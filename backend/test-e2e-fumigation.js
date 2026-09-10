require('dotenv').config();
const { PrismaClient, RoleType } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const http = require('http');
const FormData = require('form-data');
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

async function runE2eFumigationTests() {
  console.log('===============================================================');
  console.log('🚀 INICIANDO TEST E2E — TSK-10: FUMIGATION MODULE & STORAGE');
  console.log('===============================================================');

  // 1. Iniciar servidor NestJS en memoria
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
    // 2. Obtener usuarios de prueba para roles
    const adminUser = await prisma.user.findFirst({
      where: { role: RoleType.ADMIN, isActive: true },
    });
    const contabilidadUser = await prisma.user.findFirst({
      where: { role: RoleType.CONTABILIDAD, isActive: true },
    });
    const consultaUser = await prisma.user.findFirst({
      where: { role: RoleType.CONSULTA, isActive: true },
    });

    assert(adminUser, 'Existe usuario con rol ADMIN en PostgreSQL');
    assert(contabilidadUser, 'Existe usuario con rol CONTABILIDAD en PostgreSQL');
    assert(consultaUser, 'Existe usuario con rol CONSULTA en PostgreSQL');

    const adminToken = generateToken(adminUser);
    const contabilidadToken = generateToken(contabilidadUser);
    const consultaToken = generateToken(consultaUser);

    // 3. Obtener o crear una orden de producción real (DailyProduction)
    let dailyProduction = await prisma.dailyProduction.findFirst({
      orderBy: { createdAt: 'desc' },
    });

    if (!dailyProduction) {
      const product = await prisma.product.findFirst({ where: { isActive: true } });
      dailyProduction = await prisma.dailyProduction.create({
        data: {
          productionLot: `LT-TEST-E2E-${Date.now()}`,
          productId: product.id,
          quantityProduced: 50,
          productionDate: new Date('2026-09-02T00:00:00.000Z'),
          isoWeek: 36,
          createdById: adminUser.id,
        },
      });
    }

    assert(dailyProduction, `Lote de producción disponible: ${dailyProduction.productionLot} (${dailyProduction.id})`);

    const initialLedgerCount = await prisma.inventoryMovement.count();
    console.log(`📊 Conteo inicial en inventory_movements: ${initialLedgerCount}`);

    // =========================================================================
    // TEST 1: RBAC - CONSULTA debe ser rechazado con 403 Forbidden al crear
    // =========================================================================
    console.log('\n--- PRUEBA 1: RBAC Enforce (Rol CONSULTA denegado en POST) ---');
    const formConsulta = new FormData();
    formConsulta.append('dailyProductionId', dailyProduction.id);
    formConsulta.append('fumigationDate', '2026-09-02');
    formConsulta.append('fumigationTime', '10:00:00');
    formConsulta.append('certificateNumber', 'OIRSA-CONSULTA-TEST');
    formConsulta.append('file', Buffer.from('%PDF-1.4 mock pdf'), {
      filename: 'cert.pdf',
      contentType: 'application/pdf',
    });

    const resConsulta = await fetch(`${baseUrl}/fumigations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${consultaToken}`,
        ...formConsulta.getHeaders(),
      },
      body: formConsulta.getBuffer(),
    });

    assert(resConsulta.status === 403, `POST /fumigations con CONSULTA devuelve 403 Forbidden (obtenido ${resConsulta.status})`);

    // =========================================================================
    // TEST 2: Validación de archivo no PDF
    // =========================================================================
    console.log('\n--- PRUEBA 2: Rechazo de archivos no PDF (MIME y Magic Bytes) ---');
    const formNonPdf = new FormData();
    formNonPdf.append('dailyProductionId', dailyProduction.id);
    formNonPdf.append('fumigationDate', '2026-09-02');
    formNonPdf.append('fumigationTime', '10:00:00');
    formNonPdf.append('certificateNumber', 'OIRSA-NON-PDF');
    formNonPdf.append('file', Buffer.from('TEXT_FILE_NOT_A_PDF'), {
      filename: 'cert.txt',
      contentType: 'text/plain',
    });

    const resNonPdf = await fetch(`${baseUrl}/fumigations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        ...formNonPdf.getHeaders(),
      },
      body: formNonPdf.getBuffer(),
    });

    assert(resNonPdf.status === 400, `POST /fumigations con archivo no-PDF devuelve 400 Bad Request (obtenido ${resNonPdf.status})`);

    // =========================================================================
    // TEST 3: Validación de fecha futura
    // =========================================================================
    console.log('\n--- PRUEBA 3: Rechazo de fecha futura ---');
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    const futureDateStr = futureDate.toISOString().split('T')[0];

    const formFuture = new FormData();
    formFuture.append('dailyProductionId', dailyProduction.id);
    formFuture.append('fumigationDate', futureDateStr);
    formFuture.append('fumigationTime', '10:00:00');
    formFuture.append('certificateNumber', 'OIRSA-FUTURE');
    formFuture.append('file', Buffer.from('%PDF-1.4 mock pdf'), {
      filename: 'cert.pdf',
      contentType: 'application/pdf',
    });

    const resFuture = await fetch(`${baseUrl}/fumigations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        ...formFuture.getHeaders(),
      },
      body: formFuture.getBuffer(),
    });

    assert(resFuture.status === 400, `POST /fumigations con fecha futura devuelve 400 Bad Request (obtenido ${resFuture.status})`);

    // =========================================================================
    // TEST 4: Creación exitosa por rol CONTABILIDAD
    // =========================================================================
    console.log('\n--- PRUEBA 4: Creación exitosa por CONTABILIDAD (EP-FUM-01 / UC-FUM-01) ---');
    const certNum1 = `OIRSA-E2E-${Date.now()}-01`;
    const mockPdfContent = '%PDF-1.4\n1 0 obj\n<< /Title (Certificado OIRSA PolinTrack) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF';
    const pdfBuffer = Buffer.from(mockPdfContent);

    const formSuccess1 = new FormData();
    formSuccess1.append('dailyProductionId', dailyProduction.id);
    formSuccess1.append('fumigationDate', '2026-09-02');
    formSuccess1.append('fumigationTime', '14:30:00');
    formSuccess1.append('certificateNumber', certNum1);
    formSuccess1.append('file', pdfBuffer, {
      filename: `${certNum1}.pdf`,
      contentType: 'application/pdf',
    });

    const resSuccess1 = await fetch(`${baseUrl}/fumigations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${contabilidadToken}`,
        ...formSuccess1.getHeaders(),
      },
      body: formSuccess1.getBuffer(),
    });

    assert(resSuccess1.status === 201, `POST /fumigations con CONTABILIDAD devuelve 201 Created (obtenido ${resSuccess1.status})`);
    const jsonSuccess1 = await resSuccess1.json();
    const createdFumigation1 = jsonSuccess1.data;

    assert(createdFumigation1.certificateNumber === certNum1, `Certificado registrado correctamente: ${createdFumigation1.certificateNumber}`);
    assert(createdFumigation1.pdfFilePath.startsWith('certificates/2026/09/'), `Ruta de almacenamiento conforme a especificación: ${createdFumigation1.pdfFilePath}`);
    assert(createdFumigation1.fileSizeBytes === pdfBuffer.length, `Tamaño del archivo exacto: ${createdFumigation1.fileSizeBytes} bytes`);
    assert(createdFumigation1.registeredById === contabilidadUser.id, `Usuario que registró corresponde a CONTABILIDAD`);

    // =========================================================================
    // TEST 5: Cardinalidad 1:N — Segundo tratamiento al mismo lote (RN-003 / FA-01)
    // =========================================================================
    console.log('\n--- PRUEBA 5: Segundo tratamiento fitosanitario al mismo lote (Cardinalidad 1:N) ---');
    const certNum2 = `OIRSA-E2E-${Date.now()}-02`;
    const formSuccess2 = new FormData();
    formSuccess2.append('dailyProductionId', dailyProduction.id);
    formSuccess2.append('fumigationDate', '2026-09-02');
    formSuccess2.append('fumigationTime', '16:00:00');
    formSuccess2.append('certificateNumber', certNum2);
    formSuccess2.append('file', pdfBuffer, {
      filename: `${certNum2}.pdf`,
      contentType: 'application/pdf',
    });

    const resSuccess2 = await fetch(`${baseUrl}/fumigations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        ...formSuccess2.getHeaders(),
      },
      body: formSuccess2.getBuffer(),
    });

    assert(resSuccess2.status === 201, `POST /fumigations segundo tratamiento devuelve 201 Created (obtenido ${resSuccess2.status})`);
    const jsonSuccess2 = await resSuccess2.json();
    const createdFumigation2 = jsonSuccess2.data;
    assert(createdFumigation2.certificateNumber === certNum2, `Segundo tratamiento guardado con éxito: ${createdFumigation2.certificateNumber}`);

    // =========================================================================
    // TEST 6: Consulta filtrada (EP-FUM-02)
    // =========================================================================
    console.log('\n--- PRUEBA 6: Listar fumigaciones filtradas por lote (EP-FUM-02) ---');
    const resList = await fetch(`${baseUrl}/fumigations?dailyProductionId=${dailyProduction.id}`, {
      headers: { Authorization: `Bearer ${consultaToken}` },
    });
    assert(resList.status === 200, `GET /fumigations devuelve 200 OK`);
    const jsonList = await resList.json();
    assert(jsonList.success === true, `Respuesta success === true`);
    assert(jsonList.data.length >= 2, `Devuelve al menos los 2 tratamientos registrados para este lote (${jsonList.data.length} recibidos)`);

    // =========================================================================
    // TEST 7: Detalle por ID
    // =========================================================================
    console.log('\n--- PRUEBA 7: Obtener detalle por ID ---');
    const resDetail = await fetch(`${baseUrl}/fumigations/${createdFumigation1.id}`, {
      headers: { Authorization: `Bearer ${consultaToken}` },
    });
    assert(resDetail.status === 200, `GET /fumigations/:id devuelve 200 OK`);
    const jsonDetail = await resDetail.json();
    assert(jsonDetail.data.id === createdFumigation1.id, `Detalle coincide con ID consultado`);
    assert(jsonDetail.data.dailyProduction !== undefined, `Detalle incluye relación con dailyProduction`);

    // =========================================================================
    // TEST 8: Generación de Signed URL con vigencia de 15 minutos (EP-FUM-03)
    // =========================================================================
    console.log('\n--- PRUEBA 8: Obtener Signed URL temporal (EP-FUM-03 / UC-FUM-02) ---');
    const resSignedUrl = await fetch(`${baseUrl}/fumigations/${createdFumigation1.id}/certificate-url`, {
      headers: { Authorization: `Bearer ${consultaToken}` },
    });
    assert(resSignedUrl.status === 200, `GET /fumigations/:id/certificate-url devuelve 200 OK`);
    const jsonSignedUrl = await resSignedUrl.json();
    assert(jsonSignedUrl.success === true, `Generación de URL exitosa`);
    assert(jsonSignedUrl.data.expiresInSeconds === 900, `Vigencia exacta de 15 minutos (900 segundos): ${jsonSignedUrl.data.expiresInSeconds}s`);
    assert(jsonSignedUrl.data.downloadUrl.length > 0, `downloadUrl presente: ${jsonSignedUrl.data.downloadUrl}`);

    // =========================================================================
    // TEST 9: Descarga y verificación de contenido del certificado PDF
    // =========================================================================
    console.log('\n--- PRUEBA 9: Descarga segura del archivo PDF mediante la Signed URL ---');
    let downloadUrl = jsonSignedUrl.data.downloadUrl;
    if (downloadUrl.startsWith('/api/v1')) {
      downloadUrl = `http://localhost:${address.port}${downloadUrl}`;
    }

    const resDownload = await fetch(downloadUrl);
    assert(resDownload.status === 200, `Descarga de archivo mediante URL firmada devuelve 200 OK (obtenido ${resDownload.status})`);
    const downloadedBuffer = Buffer.from(await resDownload.arrayBuffer());
    assert(downloadedBuffer.toString() === mockPdfContent, 'El contenido descargado es idéntico byte a byte al PDF subido');

    // =========================================================================
    // TEST 10: Invariante RN-011 (Cero impacto en ledger) y Auditoría
    // =========================================================================
    console.log('\n--- PRUEBA 10: Invariante RN-011 y Registro en audit_logs ---');
    const finalLedgerCount = await prisma.inventoryMovement.count();
    assert(
      finalLedgerCount === initialLedgerCount,
      `RN-011 VERIFICADA: Cero movimientos generados en el ledger (${initialLedgerCount} inicial == ${finalLedgerCount} final)`,
    );

    const auditEntry = await prisma.auditLog.findFirst({
      where: {
        tableName: 'fumigations',
        recordId: createdFumigation1.id,
      },
    });
    assert(auditEntry !== null, `Registro de auditoría técnica forense encontrado en audit_logs`);
    assert(auditEntry.action === 'CREATE', `Acción de auditoría es CREATE`);

    console.log('\n===============================================================');
    console.log(`🎉 TODOS LOS TESTS E2E PASARON EXITOSAMENTE: ${passedTests}/${totalTests}`);
    console.log('===============================================================');
  } finally {
    await app.close();
    await prisma.$disconnect();
  }
}

runE2eFumigationTests().catch((err) => {
  console.error('\n❌ Error fatal en test E2E de Fumigación:', err);
  process.exit(1);
});
