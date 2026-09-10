require('dotenv').config();
const { PrismaClient, RoleType } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./dist/app.module');
const { ValidationPipe } = require('@nestjs/common');

const prisma = new PrismaClient();

const jwtSecret =
  process.env.SUPABASE_JWT_SECRET ||
  process.env.JWT_SECRET ||
  'polintrack_jwt_fallback_secret_key_2026';

function generateToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
    },
    jwtSecret,
    { expiresIn: '1h' },
  );
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runE2eAuditTests() {
  console.log('===============================================================');
  console.log('🚀 INICIANDO TEST E2E — TSK-16: AUDIT LOG & ASYNC INTERCEPTOR');
  console.log('===============================================================');

  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.listen(0);
  const server = app.getHttpServer();
  const address = server.address();
  const baseUrl = `http://localhost:${address.port}/api/v1`;
  console.log(`📡 Servidor NestJS de prueba escuchando en ${baseUrl}`);

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      console.log(`  ✅ [TEST ${totalTests}] PASS: ${message}`);
      passedTests++;
    } else {
      console.error(`  ❌ [TEST ${totalTests}] FAIL: ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  try {
    // 1. Obtener usuarios para RBAC
    const adminUser = await prisma.user.findFirst({
      where: { role: RoleType.ADMIN, isActive: true },
    });
    const contabilidadUser = await prisma.user.findFirst({
      where: { role: RoleType.CONTABILIDAD, isActive: true },
    });
    const consultaUser = await prisma.user.findFirst({
      where: { role: RoleType.CONSULTA, isActive: true },
    });

    assert(adminUser, 'Existe usuario ADMIN en PostgreSQL');
    assert(contabilidadUser, 'Existe usuario CONTABILIDAD en PostgreSQL');
    assert(consultaUser, 'Existe usuario CONSULTA en PostgreSQL');

    const adminToken = generateToken(adminUser);
    const contabilidadToken = generateToken(contabilidadUser);
    const consultaToken = generateToken(consultaUser);

    const initialAuditLogsCount = await prisma.auditLog.count();
    console.log(`📊 Conteo inicial de registros en audit_logs: ${initialAuditLogsCount}`);

    // =========================================================================
    // PRUEBA 1: INTERCEPCIÓN DE MUTACIÓN POST EN BASE DE DATOS
    // =========================================================================
    console.log('\n--- PRUEBA 1: Intercepción de Mutación POST (Creación de Proveedor) ---');
    const uniqueSuffix = Date.now().toString().slice(-6);
    const supplierPayload = {
      name: `Maderas Auditoría ${uniqueSuffix} S.A.`,
      legalId: `J-999${uniqueSuffix}`,
      phone: '+505 8888-0000',
      notes: 'Proveedor de prueba para auditoría',
    };

    const resPostSupplier = await fetch(`${baseUrl}/suppliers`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(supplierPayload),
    });

    assert(resPostSupplier.status === 201, `POST /suppliers responde 201 Created`);
    const supplierData = await resPostSupplier.json();
    const createdSupplierId = supplierData.data?.id || supplierData.id;
    assert(createdSupplierId, `Proveedor creado con ID UUID: ${createdSupplierId}`);

    // Esperar despacho asíncrono no bloqueante a PostgreSQL (máx 500ms)
    await sleep(600);

    const latestAuditLog = await prisma.auditLog.findFirst({
      where: {
        tableName: 'suppliers',
        recordId: createdSupplierId,
      },
    });

    assert(latestAuditLog !== null, 'Se insertó registro en audit_logs para el nuevo proveedor');
    assert(latestAuditLog.action === 'INSERT', `Acción registrada es 'INSERT' (obtenido ${latestAuditLog?.action})`);
    assert(latestAuditLog.userId === adminUser.id, `Usuario actor registrado es el ADMIN autenticado`);
    assert(latestAuditLog.newValues !== null, `newValues contiene el snapshot de datos creados`);

    // =========================================================================
    // PRUEBA 2: VERIFICACIÓN DE SANITIZACIÓN (CERO CREDENCIALES/TOKENS)
    // =========================================================================
    console.log('\n--- PRUEBA 2: Verificación de Sanitización y Privacidad ---');
    const newValuesStr = JSON.stringify(latestAuditLog.newValues);
    assert(!newValuesStr.includes('password'), 'newValues no contiene palabra clave sensible');
    assert(!newValuesStr.includes('secret'), 'newValues no contiene secretos');

    // =========================================================================
    // PRUEBA 3: CERO AUDITORÍA EN LLAMADAS READ-ONLY (GET)
    // =========================================================================
    console.log('\n--- PRUEBA 3: Cero registros de auditoría en peticiones GET ---');
    const auditCountBeforeGets = await prisma.auditLog.count();

    await fetch(`${baseUrl}/dashboard/kpis`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    await fetch(`${baseUrl}/reports/inventory`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    await fetch(`${baseUrl}/reports/wood-receipts`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    await fetch(`${baseUrl}/suppliers`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    await fetch(`${baseUrl}/catalogs/products`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    await sleep(400);
    const auditCountAfterGets = await prisma.auditLog.count();

    assert(
      auditCountBeforeGets === auditCountAfterGets,
      `Conteo de audit_logs inalterado tras 5 llamadas GET (antes: ${auditCountBeforeGets}, después: ${auditCountAfterGets})`,
    );

    // =========================================================================
    // PRUEBA 4: CONSULTA Y RBAC EN GET /api/v1/audit-logs
    // =========================================================================
    console.log('\n--- PRUEBA 4: RBAC y Consulta en GET /api/v1/audit-logs ---');
    // 4.1 ADMIN: Permitido (200 OK)
    const resAdminLogs = await fetch(`${baseUrl}/audit-logs?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(resAdminLogs.status === 200, `GET /audit-logs con ADMIN devuelve 200 OK`);
    const jsonAdminLogs = await resAdminLogs.json();
    assert(jsonAdminLogs.success === true, `Respuesta success: true`);
    assert(Array.isArray(jsonAdminLogs.data), `jsonAdminLogs.data es un array`);
    assert(jsonAdminLogs.meta && typeof jsonAdminLogs.meta.total === 'number', `meta de paginación presente`);

    // 4.2 CONTABILIDAD: Rechazado (403 Forbidden)
    const resContaLogs = await fetch(`${baseUrl}/audit-logs`, {
      headers: { Authorization: `Bearer ${contabilidadToken}` },
    });
    assert(
      resContaLogs.status === 403,
      `GET /audit-logs con CONTABILIDAD devuelve 403 Forbidden (obtenido ${resContaLogs.status})`,
    );

    // 4.3 CONSULTA: Rechazado (403 Forbidden)
    const resConsultaLogs = await fetch(`${baseUrl}/audit-logs`, {
      headers: { Authorization: `Bearer ${consultaToken}` },
    });
    assert(
      resConsultaLogs.status === 403,
      `GET /audit-logs con CONSULTA devuelve 403 Forbidden (obtenido ${resConsultaLogs.status})`,
    );

    // 4.4 Sin Token: Rechazado (401 Unauthorized)
    const resNoAuth = await fetch(`${baseUrl}/audit-logs`);
    assert(
      resNoAuth.status === 401,
      `GET /audit-logs sin autenticación devuelve 401 Unauthorized (obtenido ${resNoAuth.status})`,
    );

    // Limpieza del proveedor de prueba
    await prisma.supplier.delete({ where: { id: createdSupplierId } }).catch(() => {});
    await prisma.auditLog.deleteMany({ where: { recordId: createdSupplierId } }).catch(() => {});

    console.log('\n===============================================================');
    console.log(`🎉 TODOS LOS TESTS E2E DE AUDIT LOG PASARON: ${passedTests}/${totalTests}`);
    console.log('===============================================================');
  } finally {
    await app.close();
    await prisma.$disconnect();
  }
}

runE2eAuditTests().catch((err) => {
  console.error('\n❌ Error fatal en test E2E de Audit Log:', err);
  process.exit(1);
});
