require('dotenv').config();
const { PrismaClient, RoleType, MovementType, DispatchStatus } = require('@prisma/client');
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

async function runE2eDispatchesTests() {
  console.log('===============================================================');
  console.log('🚀 INICIANDO TEST E2E — TSK-11: DISPATCHES MODULE & CONCURRENCY');
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
    // 2. Obtener usuarios para RBAC
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

    // 3. Obtener centro cliente y productos
    const clientCenter = await prisma.clientCenter.findFirst({ where: { isActive: true } });
    assert(clientCenter, `Centro cliente disponible: ${clientCenter.name} (${clientCenter.id})`);

    const products = await prisma.product.findMany({ where: { isActive: true }, take: 2 });
    assert(products.length >= 2, `Al menos 2 productos terminados disponibles en catálogo`);
    const [prod1, prod2] = products;

    // 4. Asegurar existencia de lotes de producción y stock positivo en ledger para las pruebas
    const dailyProd1 = await prisma.dailyProduction.create({
      data: {
        productionLot: `LT-DSP-E2E-A-${Date.now()}`,
        productId: prod1.id,
        quantityProduced: 200,
        productionDate: new Date('2026-09-02T00:00:00.000Z'),
        isoWeek: 36,
        createdById: adminUser.id,
      },
    });

    const dailyProd2 = await prisma.dailyProduction.create({
      data: {
        productionLot: `LT-DSP-E2E-B-${Date.now()}`,
        productId: prod2.id,
        quantityProduced: 200,
        productionDate: new Date('2026-09-02T00:00:00.000Z'),
        isoWeek: 36,
        createdById: adminUser.id,
      },
    });

    // Inyectar movimientos iniciales en el ledger
    await prisma.inventoryMovement.create({
      data: {
        productId: prod1.id,
        movementType: MovementType.PRODUCTION,
        deltaQuantity: 200,
        referenceTable: 'daily_productions',
        referenceId: dailyProd1.id,
        performedById: adminUser.id,
      },
    });

    await prisma.inventoryMovement.create({
      data: {
        productId: prod2.id,
        movementType: MovementType.PRODUCTION,
        deltaQuantity: 200,
        referenceTable: 'daily_productions',
        referenceId: dailyProd2.id,
        performedById: adminUser.id,
      },
    });

    console.log(`📦 Stock inicial inyectado en ledger: Prod1=${prod1.name} (+200), Prod2=${prod2.name} (+200)`);

    // =========================================================================
    // TEST 1: RBAC - Rol CONSULTA denegado en POST /dispatches (403)
    // =========================================================================
    console.log('\n--- PRUEBA 1: RBAC Enforce (Rol CONSULTA denegado en POST) ---');
    const resConsulta = await fetch(`${baseUrl}/dispatches`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${consultaToken}`,
      },
      body: JSON.stringify({
        invoiceNumber: `F-CONSULTA-${Date.now()}`,
        clientCenterId: clientCenter.id,
        dispatchDate: '2026-09-02',
        dispatchTime: '10:00:00',
        details: [
          {
            productId: prod1.id,
            dailyProductionId: dailyProd1.id,
            quantityDispatched: 10,
          },
        ],
      }),
    });
    assert(resConsulta.status === 403, `POST /dispatches con CONSULTA devuelve 403 Forbidden (obtenido ${resConsulta.status})`);

    // =========================================================================
    // TEST 2: RBAC - Solicitud sin autenticación rechazada (401)
    // =========================================================================
    console.log('\n--- PRUEBA 2: Solicitud sin token rechazada ---');
    const resNoAuth = await fetch(`${baseUrl}/dispatches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invoiceNumber: `F-NOAUTH-${Date.now()}`,
        clientCenterId: clientCenter.id,
        dispatchDate: '2026-09-02',
        dispatchTime: '10:00:00',
        details: [
          {
            productId: prod1.id,
            dailyProductionId: dailyProd1.id,
            quantityDispatched: 10,
          },
        ],
      }),
    });
    assert(resNoAuth.status === 401, `POST /dispatches sin autenticación devuelve 401 Unauthorized (obtenido ${resNoAuth.status})`);

    // =========================================================================
    // TEST 3: Validación de Unicidad de Factura (409 Conflict / FA-02)
    // =========================================================================
    console.log('\n--- PRUEBA 3: Unicidad de Factura / Remisión (409 Conflict) ---');
    const dupInvoice = `F-DUP-${Date.now()}`;
    const payloadFirst = {
      invoiceNumber: dupInvoice,
      clientCenterId: clientCenter.id,
      dispatchDate: '2026-09-02',
      dispatchTime: '11:00:00',
      details: [
        {
          productId: prod1.id,
          dailyProductionId: dailyProd1.id,
          quantityDispatched: 5,
        },
      ],
    };

    const resFirst = await fetch(`${baseUrl}/dispatches`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${contabilidadToken}`,
      },
      body: JSON.stringify(payloadFirst),
    });
    assert(resFirst.status === 201, `Primer despacho con factura ${dupInvoice} exitoso (201 Created)`);

    const resDup = await fetch(`${baseUrl}/dispatches`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${contabilidadToken}`,
      },
      body: JSON.stringify(payloadFirst),
    });
    assert(resDup.status === 409, `Segundo despacho con MISMA factura devuelve 409 Conflict (obtenido ${resDup.status})`);

    // =========================================================================
    // TEST 4: Validación de Stock Insuficiente (RN-002)
    // =========================================================================
    console.log('\n--- PRUEBA 4: Validación Estricta de Stock Insuficiente (RN-002) ---');
    const resExcess = await fetch(`${baseUrl}/dispatches`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        invoiceNumber: `F-EXCESS-${Date.now()}`,
        clientCenterId: clientCenter.id,
        dispatchDate: '2026-09-02',
        dispatchTime: '12:00:00',
        details: [
          {
            productId: prod1.id,
            dailyProductionId: dailyProd1.id,
            quantityDispatched: 999999, // Excede con creces
          },
        ],
      }),
    });
    assert(resExcess.status === 400, `Despacho que supera stock devuelve 400 Bad Request (obtenido ${resExcess.status})`);
    const jsonExcess = await resExcess.json();
    assert(
      JSON.stringify(jsonExcess).includes('INSUFFICIENT_STOCK'),
      `Código de error es INSUFFICIENT_STOCK`,
    );

    // =========================================================================
    // TEST 5: Consolidación Multi-Línea del Mismo Producto
    // =========================================================================
    console.log('\n--- PRUEBA 5: Demanda Multi-Línea agregada excede stock ---');
    // Obtenemos saldo actual de prod1 en el ledger
    const stockProd1Agg = await prisma.inventoryMovement.aggregate({
      where: { productId: prod1.id },
      _sum: { deltaQuantity: true },
    });
    const currentProd1Stock = stockProd1Agg._sum.deltaQuantity || 0;

    const lineQtyA = Math.floor(currentProd1Stock * 0.6);
    const lineQtyB = Math.floor(currentProd1Stock * 0.6); // Suma = 1.2 * stock disponible

    const resMultiLineExcess = await fetch(`${baseUrl}/dispatches`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        invoiceNumber: `F-MULTILINE-EXCESS-${Date.now()}`,
        clientCenterId: clientCenter.id,
        dispatchDate: '2026-09-02',
        dispatchTime: '12:30:00',
        details: [
          {
            productId: prod1.id,
            dailyProductionId: dailyProd1.id,
            quantityDispatched: lineQtyA,
          },
          {
            productId: prod1.id,
            dailyProductionId: dailyProd1.id,
            quantityDispatched: lineQtyB,
          },
        ],
      }),
    });
    assert(resMultiLineExcess.status === 400, `Multi-línea agregada que excede stock devuelve 400 Bad Request (obtenido ${resMultiLineExcess.status})`);

    // =========================================================================
    // TEST 6: Creación Exitosa Multi-Producto y Multi-Lote (EP-DSP-01 / UC-DSP-01)
    // =========================================================================
    console.log('\n--- PRUEBA 6: Despacho Multi-Producto y Multi-Lote Exitoso ---');
    const invoiceSuccess = `F-SUCCESS-${Date.now()}`;
    const resSuccess = await fetch(`${baseUrl}/dispatches`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${contabilidadToken}`,
      },
      body: JSON.stringify({
        invoiceNumber: invoiceSuccess,
        clientCenterId: clientCenter.id,
        dispatchDate: '2026-09-02',
        dispatchTime: '14:30:00',
        vehicleInfo: 'M-77889',
        driverName: 'Marcos Benavides',
        observations: 'Despacho combinado de 2 productos',
        details: [
          {
            productId: prod1.id,
            dailyProductionId: dailyProd1.id,
            quantityDispatched: 20,
            dimensions: prod1.dimensions,
          },
          {
            productId: prod2.id,
            dailyProductionId: dailyProd2.id,
            quantityDispatched: 35,
            dimensions: prod2.dimensions,
          },
        ],
      }),
    });

    assert(resSuccess.status === 201, `POST /dispatches multi-producto devuelve 201 Created (obtenido ${resSuccess.status})`);
    const jsonSuccess = await resSuccess.json();
    const createdDispatch = jsonSuccess.data;

    assert(createdDispatch.invoiceNumber === invoiceSuccess, `Factura guardada correctamente: ${createdDispatch.invoiceNumber}`);
    assert(createdDispatch.status === DispatchStatus.COMPLETED, `Estado inicial es COMPLETED`);
    assert(createdDispatch.dispatchDetails.length === 2, `Se crearon exactamente las 2 líneas de detalle`);

    // Verificar movimientos en el ledger append-only (-20 y -35)
    const movProd1 = await prisma.inventoryMovement.findFirst({
      where: {
        referenceTable: 'dispatch_details',
        referenceId: createdDispatch.dispatchDetails[0].id,
      },
    });
    assert(movProd1 !== null, `Movimiento en ledger registrado para detalle 1`);
    assert(movProd1.deltaQuantity === -20, `deltaQuantity es exactamente negativo: ${movProd1.deltaQuantity}`);
    assert(movProd1.movementType === MovementType.DISPATCH, `movementType es DISPATCH`);

    const movProd2 = await prisma.inventoryMovement.findFirst({
      where: {
        referenceTable: 'dispatch_details',
        referenceId: createdDispatch.dispatchDetails[1].id,
      },
    });
    assert(movProd2 !== null, `Movimiento en ledger registrado para detalle 2`);
    assert(movProd2.deltaQuantity === -35, `deltaQuantity es exactamente negativo: ${movProd2.deltaQuantity}`);

    // =========================================================================
    // TEST 7: Control de Concurrencia y Prevención de Sobreventa (Race Condition)
    // =========================================================================
    console.log('\n--- PRUEBA 7: Concurrencia Real (Overselling Prevention con Bloqueo Pesimista) ---');
    // Creamos un producto de prueba exclusivo para la condición de carrera
    const raceProd = await prisma.product.create({
      data: {
        name: `Polín Concurrencia ${Date.now()}`,
        dimensions: '4" x 4" x 8\'',
        isActive: true,
      },
    });

    const raceDailyProd = await prisma.dailyProduction.create({
      data: {
        productionLot: `LT-RACE-${Date.now()}`,
        productId: raceProd.id,
        quantityProduced: 100,
        productionDate: new Date('2026-09-02T00:00:00.000Z'),
        isoWeek: 36,
        createdById: adminUser.id,
      },
    });

    // Stock inicial = 100
    await prisma.inventoryMovement.create({
      data: {
        productId: raceProd.id,
        movementType: MovementType.PRODUCTION,
        deltaQuantity: 100,
        referenceTable: 'daily_productions',
        referenceId: raceDailyProd.id,
        performedById: adminUser.id,
      },
    });

    // Lanzamos 2 peticiones simultáneas donde cada una solicita 70 unidades
    // Suma demandada = 140 > 100
    console.log(`  ⚡ Disparando 2 peticiones concurrentes simultáneas por 70 unidades cada una (stock total = 100)...`);

    const reqA = fetch(`${baseUrl}/dispatches`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        invoiceNumber: `F-RACE-A-${Date.now()}`,
        clientCenterId: clientCenter.id,
        dispatchDate: '2026-09-02',
        dispatchTime: '15:00:00',
        details: [
          {
            productId: raceProd.id,
            dailyProductionId: raceDailyProd.id,
            quantityDispatched: 70,
          },
        ],
      }),
    });

    const reqB = fetch(`${baseUrl}/dispatches`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        invoiceNumber: `F-RACE-B-${Date.now()}`,
        clientCenterId: clientCenter.id,
        dispatchDate: '2026-09-02',
        dispatchTime: '15:00:00',
        details: [
          {
            productId: raceProd.id,
            dailyProductionId: raceDailyProd.id,
            quantityDispatched: 70,
          },
        ],
      }),
    });

    const [resRaceA, resRaceB] = await Promise.all([reqA, reqB]);

    const statuses = [resRaceA.status, resRaceB.status];
    console.log(`  Status responses concurrentes: [${statuses.join(', ')}]`);

    assert(
      statuses.includes(201),
      `Al menos una de las peticiones concurrentes fue confirmada (201)`,
    );
    assert(
      statuses.includes(400) || statuses.includes(409),
      `La otra petición concurrente fue RECHAZADA limpiamente (400/409)`,
    );

    // Verificar saldo final del producto en el ledger: NO PUEDE SER NEGATIVO
    const finalRaceStockAgg = await prisma.inventoryMovement.aggregate({
      where: { productId: raceProd.id },
      _sum: { deltaQuantity: true },
    });
    const finalRaceStock = finalRaceStockAgg._sum.deltaQuantity;

    assert(
      finalRaceStock === 30,
      `PREVENCIÓN DE SOBREVENTA CONFIRMADA: Stock final es exactamente 30 (100 - 70 = 30) y nunca negativo`,
    );

    // =========================================================================
    // TEST 8: Listar Despachos (EP-DSP-02)
    // =========================================================================
    console.log('\n--- PRUEBA 8: Listar Despachos con Filtros (EP-DSP-02) ---');
    const resList = await fetch(`${baseUrl}/dispatches?clientCenterId=${clientCenter.id}`, {
      headers: { Authorization: `Bearer ${consultaToken}` },
    });
    assert(resList.status === 200, `GET /dispatches devuelve 200 OK`);
    const jsonList = await resList.json();
    assert(jsonList.success === true, `Respuesta success === true`);
    assert(jsonList.data.length >= 2, `Se recuperaron los despachos creados para el centro`);
    assert(jsonList.meta.total >= 2, `Metadata de paginación total presente`);

    // =========================================================================
    // TEST 9: Consulta de Detalle por ID (EP-DSP-03)
    // =========================================================================
    console.log('\n--- PRUEBA 9: Consultar Detalle por ID (EP-DSP-03) ---');
    const resDetail = await fetch(`${baseUrl}/dispatches/${createdDispatch.id}`, {
      headers: { Authorization: `Bearer ${consultaToken}` },
    });
    assert(resDetail.status === 200, `GET /dispatches/:id devuelve 200 OK`);
    const jsonDetail = await resDetail.json();
    assert(jsonDetail.data.id === createdDispatch.id, `ID coincide con despacho consultado`);
    assert(jsonDetail.data.clientCenter.name === clientCenter.name, `Incluye relación de clientCenter`);
    assert(jsonDetail.data.dispatchDetails.length === 2, `Incluye líneas de detalle`);

    // =========================================================================
    // TEST 10: Inmutabilidad (RN-001) - Prohibición de PUT/PATCH/DELETE
    // =========================================================================
    console.log('\n--- PRUEBA 10: Inmutabilidad Absoluta (RN-001) ---');
    const resPut = await fetch(`${baseUrl}/dispatches/${createdDispatch.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ observations: 'Intento de modificar' }),
    });
    assert(
      resPut.status === 404 || resPut.status === 405,
      `PUT /dispatches/:id no permitido (obtenido ${resPut.status})`,
    );

    const resDelete = await fetch(`${baseUrl}/dispatches/${createdDispatch.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(
      resDelete.status === 404 || resDelete.status === 405,
      `DELETE /dispatches/:id no permitido (obtenido ${resDelete.status})`,
    );

    // =========================================================================
    // TEST 11: Auditoría Técnica (AuditLog)
    // =========================================================================
    console.log('\n--- PRUEBA 11: Registro en audit_logs ---');
    const auditRecord = await prisma.auditLog.findFirst({
      where: {
        tableName: 'dispatch_headers',
        recordId: createdDispatch.id,
      },
    });
    assert(auditRecord !== null, `Registro forense encontrado en audit_logs`);
    assert(auditRecord.action === 'CREATE', `Acción en audit_logs es CREATE`);

    console.log('\n===============================================================');
    console.log(`🎉 TODOS LOS TESTS E2E Y DE CONCURRENCIA PASARON: ${passedTests}/${totalTests}`);
    console.log('===============================================================');
  } finally {
    await app.close();
    await prisma.$disconnect();
  }
}

runE2eDispatchesTests().catch((err) => {
  console.error('\n❌ Error fatal en test E2E de Despachos:', err);
  process.exit(1);
});
