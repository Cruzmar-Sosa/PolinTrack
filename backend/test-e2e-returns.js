require('dotenv').config();
const {
  PrismaClient,
  RoleType,
  MovementType,
  DispatchStatus,
  ReturnTypeEnum,
} = require('@prisma/client');
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

async function runE2eReturnsTests() {
  console.log('===============================================================');
  console.log('🚀 INICIANDO TEST E2E — TSK-12: COMMERCIAL RETURNS & CONCURRENCY');
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

    // 2. Preparar centro cliente, producto y producción inicial
    const clientCenter = await prisma.clientCenter.findFirst({ where: { isActive: true } });
    const product = await prisma.product.findFirst({ where: { isActive: true } });

    assert(clientCenter, `Centro cliente disponible: ${clientCenter.name}`);
    assert(product, `Producto disponible: ${product.name}`);

    // Inyectar orden de producción de 200 piezas
    const dailyProd = await prisma.dailyProduction.create({
      data: {
        productionLot: `LT-RET-E2E-${Date.now()}`,
        productId: product.id,
        quantityProduced: 200,
        productionDate: new Date('2026-09-02T00:00:00.000Z'),
        isoWeek: 36,
        createdById: adminUser.id,
      },
    });

    await prisma.inventoryMovement.create({
      data: {
        productId: product.id,
        movementType: MovementType.PRODUCTION,
        deltaQuantity: 200,
        referenceTable: 'daily_productions',
        referenceId: dailyProd.id,
        performedById: adminUser.id,
      },
    });

    // 3. Crear un despacho original de 100 piezas (quantityDispatched = 100)
    const invoiceNumber = `F-RET-TEST-${Date.now()}`;
    const dispatchHeader = await prisma.dispatchHeader.create({
      data: {
        invoiceNumber,
        clientCenterId: clientCenter.id,
        dispatchDate: new Date('2026-09-02T00:00:00.000Z'),
        dispatchTime: new Date('1970-01-01T10:00:00.000Z'),
        vehicleInfo: 'M-55443',
        driverName: 'Jorge Salmerón',
        status: DispatchStatus.COMPLETED,
        createdById: contabilidadUser.id,
      },
    });

    const dispatchDetail = await prisma.dispatchDetail.create({
      data: {
        dispatchHeaderId: dispatchHeader.id,
        productId: product.id,
        dailyProductionId: dailyProd.id,
        quantityDispatched: 100,
        dimensions: product.dimensions,
        quantityReturnedAccumulated: 0,
      },
    });

    // Registrar decremento en el ledger (-100)
    await prisma.inventoryMovement.create({
      data: {
        productId: product.id,
        movementType: MovementType.DISPATCH,
        deltaQuantity: -100,
        referenceTable: 'dispatch_details',
        referenceId: dispatchDetail.id,
        performedById: contabilidadUser.id,
      },
    });

    console.log(`📦 Despacho base creado: Factura=${invoiceNumber}, Despachados=100, Devueltos Acumulados=0`);

    // =========================================================================
    // TEST 1: RBAC - CONSULTA denegado en POST /returns (403)
    // =========================================================================
    console.log('\n--- PRUEBA 1: RBAC Enforce (Rol CONSULTA denegado en POST) ---');
    const resConsulta = await fetch(`${baseUrl}/returns`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${consultaToken}`,
      },
      body: JSON.stringify({
        dispatchHeaderId: dispatchHeader.id,
        returnDate: '2026-09-03',
        reason: 'Intento con rol no autorizado',
        details: [{ dispatchDetailId: dispatchDetail.id, quantityReturned: 10 }],
      }),
    });
    assert(resConsulta.status === 403, `POST /returns con CONSULTA devuelve 403 Forbidden (obtenido ${resConsulta.status})`);

    // =========================================================================
    // TEST 2: Solicitud sin token rechazada (401)
    // =========================================================================
    console.log('\n--- PRUEBA 2: Solicitud sin token rechazada ---');
    const resNoAuth = await fetch(`${baseUrl}/returns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dispatchHeaderId: dispatchHeader.id,
        returnDate: '2026-09-03',
        reason: 'Intento sin autenticar',
        details: [{ dispatchDetailId: dispatchDetail.id, quantityReturned: 10 }],
      }),
    });
    assert(resNoAuth.status === 401, `POST /returns sin token devuelve 401 Unauthorized (obtenido ${resNoAuth.status})`);

    // =========================================================================
    // TEST 3: Cronología (FA-02: returnDate anterior al despacho rechazada)
    // =========================================================================
    console.log('\n--- PRUEBA 3: Cronología Inválida (returnDate < dispatchDate) ---');
    const resInvalidDate = await fetch(`${baseUrl}/returns`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${contabilidadUserToken = contabilidadToken}`,
      },
      body: JSON.stringify({
        dispatchHeaderId: dispatchHeader.id,
        returnDate: '2026-09-01', // Despacho fue el 2026-09-02
        reason: 'Fecha anterior',
        details: [{ dispatchDetailId: dispatchDetail.id, quantityReturned: 10 }],
      }),
    });
    assert(resInvalidDate.status === 400, `Fecha anterior al despacho devuelve 400 Bad Request (obtenido ${resInvalidDate.status})`);

    // =========================================================================
    // TEST 4: Línea de detalle no perteneciente al despacho
    // =========================================================================
    console.log('\n--- PRUEBA 4: Detalle foráneo rechazado ---');
    const resForeignDet = await fetch(`${baseUrl}/returns`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${contabilidadToken}`,
      },
      body: JSON.stringify({
        dispatchHeaderId: dispatchHeader.id,
        returnDate: '2026-09-03',
        reason: 'Línea inválida',
        details: [{ dispatchDetailId: '00000000-0000-0000-0000-000000000000', quantityReturned: 10 }],
      }),
    });
    assert(resForeignDet.status === 400, `Detalle no perteneciente al despacho devuelve 400 Bad Request (obtenido ${resForeignDet.status})`);

    // =========================================================================
    // TEST 5: Devolución que supera lo despachado (RN-013, FA-01)
    // =========================================================================
    console.log('\n--- PRUEBA 5: Devolución que supera remanente despachado ---');
    const resExcess = await fetch(`${baseUrl}/returns`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${contabilidadToken}`,
      },
      body: JSON.stringify({
        dispatchHeaderId: dispatchHeader.id,
        returnDate: '2026-09-03',
        reason: 'Supera remanente',
        details: [{ dispatchDetailId: dispatchDetail.id, quantityReturned: 101 }], // Despachado fue 100
      }),
    });
    assert(resExcess.status === 400, `Devolver 101 sobre 100 devuelve 400 Bad Request (obtenido ${resExcess.status})`);
    const jsonExcess = await resExcess.json();
    assert(
      JSON.stringify(jsonExcess).includes('RETURN_QUANTITY_EXCEEDS_DISPATCHED'),
      `Código de error es RETURN_QUANTITY_EXCEEDS_DISPATCHED`,
    );

    // =========================================================================
    // TEST 6: Registro Exitoso de Devolución Parcial (UC-RET-01)
    // =========================================================================
    console.log('\n--- PRUEBA 6: Devolución Parcial Exitosa (30 piezas) ---');
    const resPartial = await fetch(`${baseUrl}/returns`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${contabilidadToken}`,
      },
      body: JSON.stringify({
        dispatchHeaderId: dispatchHeader.id,
        returnDate: '2026-09-03',
        reason: 'Rechazo de calidad en Planta 2 por humedad',
        observations: 'Piezas reingresadas a patio secundario',
        details: [{ dispatchDetailId: dispatchDetail.id, quantityReturned: 30 }],
      }),
    });

    assert(resPartial.status === 201, `POST /returns parcial devuelve 201 Created (obtenido ${resPartial.status})`);
    const jsonPartial = await resPartial.json();
    const returnRecord1 = jsonPartial.data;

    assert(returnRecord1.returnType === ReturnTypeEnum.PARCIAL, `returnType es PARCIAL`);
    assert(returnRecord1.returnDetails.length === 1, `Tiene exactamente 1 línea de retorno`);
    assert(returnRecord1.returnDetails[0].quantityReturned === 30, `quantityReturned es 30`);

    // Verificar en base de datos: Inmutabilidad de quantityDispatched y actualización de acumulador
    const freshDetail1 = await prisma.dispatchDetail.findUnique({ where: { id: dispatchDetail.id } });
    assert(freshDetail1.quantityDispatched === 100, `quantityDispatched PERMANECE EXACTAMENTE EN 100 (Inmutabilidad RN-001)`);
    assert(freshDetail1.quantityReturnedAccumulated === 30, `quantityReturnedAccumulated se incrementó a 30`);

    const freshHeader1 = await prisma.dispatchHeader.findUnique({ where: { id: dispatchHeader.id } });
    assert(freshHeader1.status === DispatchStatus.RETURNED_PARTIAL, `Estado del despacho actualizado a RETURNED_PARTIAL`);

    // Verificar movimiento en el ledger append-only (+30)
    const movReturn1 = await prisma.inventoryMovement.findFirst({
      where: {
        referenceTable: 'return_details',
        referenceId: returnRecord1.returnDetails[0].id,
      },
    });
    assert(movReturn1 !== null, `Movimiento en ledger registrado para la devolución`);
    assert(movReturn1.deltaQuantity === 30, `deltaQuantity es exactamente positivo (+30)`);
    assert(movReturn1.movementType === MovementType.RETURN, `movementType es RETURN`);

    // =========================================================================
    // TEST 7: Concurrencia Real sobre quantityReturnedAccumulated
    // =========================================================================
    console.log('\n--- PRUEBA 7: Concurrencia Real (Prevención de Overflow sobre Remanente) ---');
    // Remanente actual = 100 - 30 = 70 piezas.
    // Disparamos 2 peticiones concurrentes simultáneas intentando devolver 50 piezas cada una.
    // Demanda = 50 + 50 = 100 > 70 disponible!
    console.log(`  ⚡ Disparando 2 peticiones concurrentes simultáneas por 50 piezas cada una (remanente disponible = 70)...`);

    const reqA = fetch(`${baseUrl}/returns`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        dispatchHeaderId: dispatchHeader.id,
        returnDate: '2026-09-03',
        reason: 'Devolución concurrente A',
        details: [{ dispatchDetailId: dispatchDetail.id, quantityReturned: 50 }],
      }),
    });

    const reqB = fetch(`${baseUrl}/returns`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        dispatchHeaderId: dispatchHeader.id,
        returnDate: '2026-09-03',
        reason: 'Devolución concurrente B',
        details: [{ dispatchDetailId: dispatchDetail.id, quantityReturned: 50 }],
      }),
    });

    const [resRaceA, resRaceB] = await Promise.all([reqA, reqB]);
    const raceStatuses = [resRaceA.status, resRaceB.status];
    console.log(`  Status responses concurrentes: [${raceStatuses.join(', ')}]`);

    assert(
      raceStatuses.includes(201),
      `Exactamente una de las devoluciones concurrentes fue confirmada (201)`,
    );
    assert(
      raceStatuses.includes(400),
      `La otra devolución concurrente fue RECHAZADA por exceder remanente (400)`,
    );

    // Verificar acumulador en PostgreSQL: 30 inicial + 50 aceptados = 80
    const freshDetailRace = await prisma.dispatchDetail.findUnique({ where: { id: dispatchDetail.id } });
    assert(
      freshDetailRace.quantityReturnedAccumulated === 80,
      `PREVENCIÓN DE OVERFLOW CONFIRMADA: quantityReturnedAccumulated es exactamente 80 (30 + 50 = 80) y NO 130`,
    );

    // =========================================================================
    // TEST 8: Devolución Total (Completar remanente exacto de 20 piezas)
    // =========================================================================
    console.log('\n--- PRUEBA 8: Devolución Total al agotar el 100% despachado ---');
    // Remanente disponible = 100 - 80 = 20 piezas.
    const resTotal = await fetch(`${baseUrl}/returns`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${contabilidadToken}`,
      },
      body: JSON.stringify({
        dispatchHeaderId: dispatchHeader.id,
        returnDate: '2026-09-03',
        reason: 'Devolución del remanente final',
        details: [{ dispatchDetailId: dispatchDetail.id, quantityReturned: 20 }],
      }),
    });

    assert(resTotal.status === 201, `POST /returns total devuelve 201 Created`);
    const jsonTotal = await resTotal.json();
    assert(jsonTotal.data.returnType === ReturnTypeEnum.TOTAL, `returnType es TOTAL`);

    const freshHeaderTotal = await prisma.dispatchHeader.findUnique({ where: { id: dispatchHeader.id } });
    assert(freshHeaderTotal.status === DispatchStatus.RETURNED_TOTAL, `Estado del despacho es RETURNED_TOTAL`);

    const freshDetailTotal = await prisma.dispatchDetail.findUnique({ where: { id: dispatchDetail.id } });
    assert(freshDetailTotal.quantityReturnedAccumulated === 100, `quantityReturnedAccumulated alcanzó el 100% (100)`);
    assert(freshDetailTotal.quantityDispatched === 100, `quantityDispatched PERMANECE INMUTABLE (100)`);

    // Intentar devolver 1 pieza más debe ser rechazado
    const resBlockedAfterTotal = await fetch(`${baseUrl}/returns`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${contabilidadToken}`,
      },
      body: JSON.stringify({
        dispatchHeaderId: dispatchHeader.id,
        returnDate: '2026-09-03',
        reason: 'Intento tras devolución total',
        details: [{ dispatchDetailId: dispatchDetail.id, quantityReturned: 1 }],
      }),
    });
    assert(resBlockedAfterTotal.status === 400, `Devolver sobre despacho totalmente devuelto es rechazado con 400`);

    // =========================================================================
    // TEST 9: Listar Devoluciones con Filtros (EP-RET-02)
    // =========================================================================
    console.log('\n--- PRUEBA 9: Listar Devoluciones (EP-RET-02) ---');
    const resList = await fetch(`${baseUrl}/returns?dispatchHeaderId=${dispatchHeader.id}`, {
      headers: { Authorization: `Bearer ${consultaToken}` },
    });
    assert(resList.status === 200, `GET /returns devuelve 200 OK`);
    const jsonList = await resList.json();
    assert(jsonList.success === true, `Respuesta success === true`);
    assert(jsonList.data.length === 3, `Se recuperaron las 3 devoluciones históricas del despacho`);
    assert(jsonList.meta.total === 3, `Meta total coincide con 3`);

    // =========================================================================
    // TEST 10: Detalle por ID (EP-RET-03)
    // =========================================================================
    console.log('\n--- PRUEBA 10: Consultar Detalle de Devolución por ID (EP-RET-03) ---');
    const resDetail = await fetch(`${baseUrl}/returns/${returnRecord1.id}`, {
      headers: { Authorization: `Bearer ${consultaToken}` },
    });
    assert(resDetail.status === 200, `GET /returns/:id devuelve 200 OK`);
    const jsonDetail = await resDetail.json();
    assert(jsonDetail.data.id === returnRecord1.id, `ID coincide con devolución consultada`);
    assert(jsonDetail.data.dispatchHeader.invoiceNumber === invoiceNumber, `Incluye factura del despacho original`);
    assert(jsonDetail.data.registeredBy.email === contabilidadUser.email, `Incluye usuario que registró`);

    // =========================================================================
    // TEST 11: Inmutabilidad (RN-001) - Prohibición de PUT/PATCH/DELETE
    // =========================================================================
    console.log('\n--- PRUEBA 11: Inmutabilidad Absoluta en Returns (RN-001) ---');
    const resPut = await fetch(`${baseUrl}/returns/${returnRecord1.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ reason: 'Modificación no permitida' }),
    });
    assert(resPut.status === 404 || resPut.status === 405, `PUT /returns/:id no permitido (obtenido ${resPut.status})`);

    const resDelete = await fetch(`${baseUrl}/returns/${returnRecord1.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(resDelete.status === 404 || resDelete.status === 405, `DELETE /returns/:id no permitido (obtenido ${resDelete.status})`);

    // =========================================================================
    // TEST 12: Auditoría Técnica (AuditLog)
    // =========================================================================
    console.log('\n--- PRUEBA 12: Registro en audit_logs ---');
    const auditRecord = await prisma.auditLog.findFirst({
      where: {
        tableName: 'return_headers',
        recordId: returnRecord1.id,
      },
    });
    assert(auditRecord !== null, `Registro forense encontrado en audit_logs`);
    assert(auditRecord.action === 'CREATE', `Acción en audit_logs es CREATE`);

    console.log('\n===============================================================');
    console.log(`🎉 TODOS LOS TESTS E2E Y DE CONCURRENCIA DE DEVOLUCIONES PASARON: ${passedTests}/${totalTests}`);
    console.log('===============================================================');
  } finally {
    await app.close();
    await prisma.$disconnect();
  }
}

runE2eReturnsTests().catch((err) => {
  console.error('\n❌ Error fatal en test E2E de Devoluciones:', err);
  process.exit(1);
});
