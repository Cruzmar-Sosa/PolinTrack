require('dotenv').config();
const {
  PrismaClient,
  RoleType,
  MovementType,
  AdjustmentType,
  ReasonType,
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

async function runE2eAdjustmentsTests() {
  console.log('===============================================================');
  console.log('🚀 INICIANDO TEST E2E — TSK-13: INVENTORY ADJUSTMENTS & CONCURRENCY');
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

    // 2. Preparar producto de prueba dedicado
    const product = await prisma.product.findFirst({ where: { isActive: true } });
    assert(product, `Producto seleccionado para prueba: ${product.name}`);

    // Consultar stock inicial del ledger para este producto
    const initialAgg = await prisma.inventoryMovement.aggregate({
      where: { productId: product.id },
      _sum: { deltaQuantity: true },
    });
    const baseStock = initialAgg._sum.deltaQuantity || 0;
    console.log(`📊 Stock actual inicial del producto en Ledger: ${baseStock} piezas`);

    // Inyectar un lote de producción controlado de 100 piezas para tener base garantizada
    const testProd = await prisma.dailyProduction.create({
      data: {
        productionLot: `LT-ADJ-E2E-${Date.now()}`,
        productId: product.id,
        quantityProduced: 100,
        productionDate: new Date('2026-09-03T00:00:00.000Z'),
        isoWeek: 36,
        createdById: adminUser.id,
      },
    });

    await prisma.inventoryMovement.create({
      data: {
        productId: product.id,
        movementType: MovementType.PRODUCTION,
        deltaQuantity: 100,
        referenceTable: 'daily_productions',
        referenceId: testProd.id,
        performedById: adminUser.id,
      },
    });

    const stockBeforeAdjustments = baseStock + 100;
    console.log(`📦 Producción inyectada (+100). Stock garantizado para pruebas: ${stockBeforeAdjustments} piezas`);

    // =========================================================================
    // TEST 1: RBAC - CONTABILIDAD denegado en POST /inventory-adjustments (403)
    // =========================================================================
    console.log('\n--- PRUEBA 1: RBAC Enforce (Rol CONTABILIDAD denegado en POST) ---');
    const resContaPost = await fetch(`${baseUrl}/inventory-adjustments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${contabilidadToken}`,
      },
      body: JSON.stringify({
        productId: product.id,
        adjustmentType: AdjustmentType.INCREMENT,
        quantity: 10,
        reasonType: ReasonType.ERROR_INGRESO,
      }),
    });
    assert(
      resContaPost.status === 403,
      `POST /inventory-adjustments con CONTABILIDAD devuelve 403 Forbidden (obtenido ${resContaPost.status})`,
    );

    // =========================================================================
    // TEST 2: RBAC - CONSULTA denegado en POST /inventory-adjustments (403)
    // =========================================================================
    console.log('\n--- PRUEBA 2: RBAC Enforce (Rol CONSULTA denegado en POST) ---');
    const resConsultaPost = await fetch(`${baseUrl}/inventory-adjustments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${consultaToken}`,
      },
      body: JSON.stringify({
        productId: product.id,
        adjustmentType: AdjustmentType.INCREMENT,
        quantity: 10,
        reasonType: ReasonType.ERROR_INGRESO,
      }),
    });
    assert(
      resConsultaPost.status === 403,
      `POST /inventory-adjustments con CONSULTA devuelve 403 Forbidden (obtenido ${resConsultaPost.status})`,
    );

    // =========================================================================
    // TEST 3: RBAC - CONTABILIDAD denegado en GET /inventory-adjustments (403)
    // =========================================================================
    console.log('\n--- PRUEBA 3: RBAC Enforce (Rol CONTABILIDAD denegado en GET) ---');
    const resContaGet = await fetch(`${baseUrl}/inventory-adjustments`, {
      headers: { Authorization: `Bearer ${contabilidadToken}` },
    });
    assert(
      resContaGet.status === 403,
      `GET /inventory-adjustments con CONTABILIDAD devuelve 403 Forbidden (obtenido ${resContaGet.status})`,
    );

    // =========================================================================
    // TEST 4: Sin Token - Rechazado con 401 Unauthorized
    // =========================================================================
    console.log('\n--- PRUEBA 4: Solicitud sin autenticar rechazada ---');
    const resNoAuth = await fetch(`${baseUrl}/inventory-adjustments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: product.id,
        adjustmentType: AdjustmentType.INCREMENT,
        quantity: 10,
        reasonType: ReasonType.ERROR_INGRESO,
      }),
    });
    assert(
      resNoAuth.status === 401,
      `POST /inventory-adjustments sin token devuelve 401 Unauthorized (obtenido ${resNoAuth.status})`,
    );

    // =========================================================================
    // TEST 5: Validación de motivo CUSTOM sin justificación mínima (FA-03)
    // =========================================================================
    console.log('\n--- PRUEBA 5: Motivo CUSTOM con menos de 10 caracteres rechazado (FA-03) ---');
    const resShortNotes = await fetch(`${baseUrl}/inventory-adjustments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        productId: product.id,
        adjustmentType: AdjustmentType.INCREMENT,
        quantity: 10,
        reasonType: ReasonType.CUSTOM,
        reasonNotes: 'corto', // 5 caracteres < 10
      }),
    });
    assert(
      resShortNotes.status === 400,
      `Motivo CUSTOM con justificación corta devuelve 400 Bad Request (obtenido ${resShortNotes.status})`,
    );

    // =========================================================================
    // TEST 6: Decremento que excede el stock disponible (FA-02 / No stock negativo)
    // =========================================================================
    console.log('\n--- PRUEBA 6: Decremento que causa stock negativo rechazado (FA-02) ---');
    const excessDecrement = stockBeforeAdjustments + 500;
    const resNegativeStock = await fetch(`${baseUrl}/inventory-adjustments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        productId: product.id,
        adjustmentType: AdjustmentType.DECREMENT,
        quantity: excessDecrement,
        reasonType: ReasonType.ERROR_INGRESO,
        reasonNotes: 'Intento de dejar stock en negativo',
      }),
    });
    assert(
      resNegativeStock.status === 400,
      `Decremento excesivo devuelve 400 Bad Request (obtenido ${resNegativeStock.status})`,
    );
    const jsonNeg = await resNegativeStock.json();
    assert(
      JSON.stringify(jsonNeg).includes('NEGATIVE_STOCK_NOT_ALLOWED'),
      `Código de error es NEGATIVE_STOCK_NOT_ALLOWED`,
    );

    // =========================================================================
    // TEST 7: Ajuste Positivo Exitoso (INCREMENT, +50 piezas)
    // =========================================================================
    console.log('\n--- PRUEBA 7: Ajuste INCREMENT Exitoso (+50 piezas) ---');
    const resIncrement = await fetch(`${baseUrl}/inventory-adjustments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        productId: product.id,
        adjustmentType: AdjustmentType.INCREMENT,
        quantity: 50,
        reasonType: ReasonType.ERROR_INGRESO,
        reasonNotes: 'Conteo físico en patio detectó 50 piezas adicionales',
      }),
    });

    assert(
      resIncrement.status === 201,
      `POST /inventory-adjustments INCREMENT devuelve 201 Created (obtenido ${resIncrement.status})`,
    );
    const jsonInc = await resIncrement.json();
    const adj1 = jsonInc.data;

    assert(adj1.adjustmentType === AdjustmentType.INCREMENT, `adjustmentType es INCREMENT`);
    assert(adj1.quantity === 50, `quantity es 50`);
    assert(adj1.previousStock === stockBeforeAdjustments, `previousStock capturado fielmente (${stockBeforeAdjustments})`);
    assert(adj1.newStock === stockBeforeAdjustments + 50, `newStock calculado correctamente (${stockBeforeAdjustments + 50})`);

    // Verificar en ledger append-only (+50)
    const movAdj1 = await prisma.inventoryMovement.findFirst({
      where: {
        referenceTable: 'inventory_adjustments',
        referenceId: adj1.id,
      },
    });
    assert(movAdj1 !== null, `Movimiento en ledger registrado para el ajuste`);
    assert(movAdj1.deltaQuantity === 50, `deltaQuantity en ledger es exactamente positivo (+50)`);
    assert(movAdj1.movementType === MovementType.ADJUSTMENT, `movementType en ledger es ADJUSTMENT`);

    // =========================================================================
    // TEST 8: Ajuste Negativo Exitoso (DECREMENT, -30 piezas)
    // =========================================================================
    console.log('\n--- PRUEBA 8: Ajuste DECREMENT Exitoso (-30 piezas) ---');
    const expectedPrev2 = stockBeforeAdjustments + 50;
    const resDecrement = await fetch(`${baseUrl}/inventory-adjustments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        productId: product.id,
        adjustmentType: AdjustmentType.DECREMENT,
        quantity: 30,
        reasonType: ReasonType.CUSTOM,
        reasonNotes: 'Descarte físico por daño biológico severo en patio',
      }),
    });

    assert(
      resDecrement.status === 201,
      `POST /inventory-adjustments DECREMENT devuelve 201 Created (obtenido ${resDecrement.status})`,
    );
    const jsonDec = await resDecrement.json();
    const adj2 = jsonDec.data;

    assert(adj2.adjustmentType === AdjustmentType.DECREMENT, `adjustmentType es DECREMENT`);
    assert(adj2.quantity === 30, `quantity es 30`);
    assert(adj2.previousStock === expectedPrev2, `previousStock previo es exactamente ${expectedPrev2}`);
    assert(adj2.newStock === expectedPrev2 - 30, `newStock resultante es exactamente ${expectedPrev2 - 30}`);

    // Verificar en ledger append-only (-30)
    const movAdj2 = await prisma.inventoryMovement.findFirst({
      where: {
        referenceTable: 'inventory_adjustments',
        referenceId: adj2.id,
      },
    });
    assert(movAdj2 !== null, `Movimiento en ledger registrado para el ajuste negativo`);
    assert(movAdj2.deltaQuantity === -30, `deltaQuantity en ledger es exactamente negativo (-30)`);
    assert(movAdj2.movementType === MovementType.ADJUSTMENT, `movementType en ledger es ADJUSTMENT`);

    // =========================================================================
    // TEST 9: Concurrencia Real sobre Ajustes de Stock
    // =========================================================================
    console.log('\n--- PRUEBA 9: Concurrencia Real (Prevención de Stock Negativo bajo Carrera) ---');
    // Consultar stock exacto actual en ledger
    const aggCurrent = await prisma.inventoryMovement.aggregate({
      where: { productId: product.id },
      _sum: { deltaQuantity: true },
    });
    const currentStockBeforeRace = aggCurrent._sum.deltaQuantity;
    console.log(`  Stock actual disponible antes de la carrera: ${currentStockBeforeRace} piezas`);

    // Preparamos 2 peticiones concurrentes de decremento simultáneas.
    // Cada una solicita decrementar: currentStockBeforeRace - 10 (individualmente válida)
    // Pero la suma de ambas es: 2 * (currentStockBeforeRace - 10) >> currentStockBeforeRace!
    const decAmount = Math.max(10, currentStockBeforeRace - 10);
    console.log(`  ⚡ Disparando 2 decrementos concurrentes de ${decAmount} piezas cada uno (Total demanda = ${decAmount * 2} > ${currentStockBeforeRace})...`);

    const reqA = fetch(`${baseUrl}/inventory-adjustments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        productId: product.id,
        adjustmentType: AdjustmentType.DECREMENT,
        quantity: decAmount,
        reasonType: ReasonType.ERROR_INGRESO,
        reasonNotes: 'Ajuste concurrente carrera A',
      }),
    });

    const reqB = fetch(`${baseUrl}/inventory-adjustments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        productId: product.id,
        adjustmentType: AdjustmentType.DECREMENT,
        quantity: decAmount,
        reasonType: ReasonType.ERROR_INGRESO,
        reasonNotes: 'Ajuste concurrente carrera B',
      }),
    });

    const [resRaceA, resRaceB] = await Promise.all([reqA, reqB]);
    const raceStatuses = [resRaceA.status, resRaceB.status];
    console.log(`  Status responses concurrentes: [${raceStatuses.join(', ')}]`);

    assert(
      raceStatuses.includes(201),
      `Exactamente uno de los decrementos concurrentes fue confirmado (201)`,
    );
    assert(
      raceStatuses.includes(400),
      `El otro decremento concurrente fue RECHAZADO por prevención de stock negativo (400)`,
    );

    // Verificar stock final en PostgreSQL: no puede ser negativo bajo ninguna circunstancia
    const aggAfterRace = await prisma.inventoryMovement.aggregate({
      where: { productId: product.id },
      _sum: { deltaQuantity: true },
    });
    const finalStockAfterRace = aggAfterRace._sum.deltaQuantity;
    assert(
      finalStockAfterRace >= 0,
      `INVARIANTE DE INTEGRIDAD: Stock final es no negativo (${finalStockAfterRace} >= 0)`,
    );
    assert(
      finalStockAfterRace === currentStockBeforeRace - decAmount,
      `Stock final refleja exactamente un único decremento exitoso (${currentStockBeforeRace} - ${decAmount} = ${finalStockAfterRace})`,
    );

    // =========================================================================
    // TEST 10: Listar Historial de Ajustes (EP-ADJ-02)
    // =========================================================================
    console.log('\n--- PRUEBA 10: Listar Ajustes de Inventario (EP-ADJ-02) ---');
    const resList = await fetch(`${baseUrl}/inventory-adjustments?productId=${product.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(resList.status === 200, `GET /inventory-adjustments devuelve 200 OK`);
    const jsonList = await resList.json();
    assert(jsonList.success === true, `Respuesta success === true`);
    assert(jsonList.data.length >= 3, `Contiene al menos los 3 ajustes ejecutados`);
    assert(jsonList.meta.total >= 3, `Meta total coincide`);

    // =========================================================================
    // TEST 11: Consultar Detalle de Ajuste por ID (EP-ADJ-03)
    // =========================================================================
    console.log('\n--- PRUEBA 11: Consultar Detalle por ID (EP-ADJ-03) ---');
    const resDetail = await fetch(`${baseUrl}/inventory-adjustments/${adj1.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(resDetail.status === 200, `GET /inventory-adjustments/:id devuelve 200 OK`);
    const jsonDetail = await resDetail.json();
    assert(jsonDetail.data.id === adj1.id, `ID coincide con ajuste consultado`);
    assert(jsonDetail.data.product.name === product.name, `Incluye relación del producto`);
    assert(jsonDetail.data.executedBy.email === adminUser.email, `Incluye usuario que ejecutó el ajuste`);

    // =========================================================================
    // TEST 12: Inmutabilidad (RN-001) - Prohibición de PUT/PATCH/DELETE
    // =========================================================================
    console.log('\n--- PRUEBA 12: Inmutabilidad Absoluta en Ajustes (RN-001) ---');
    const resPut = await fetch(`${baseUrl}/inventory-adjustments/${adj1.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ quantity: 999 }),
    });
    assert(
      resPut.status === 404 || resPut.status === 405,
      `PUT /inventory-adjustments/:id no permitido (obtenido ${resPut.status})`,
    );

    const resDelete = await fetch(`${baseUrl}/inventory-adjustments/${adj1.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(
      resDelete.status === 404 || resDelete.status === 405,
      `DELETE /inventory-adjustments/:id no permitido (obtenido ${resDelete.status})`,
    );

    // =========================================================================
    // TEST 13: Auditoría Técnica (AuditLog)
    // =========================================================================
    console.log('\n--- PRUEBA 13: Registro en audit_logs ---');
    const auditRecord = await prisma.auditLog.findFirst({
      where: {
        tableName: 'inventory_adjustments',
        recordId: adj1.id,
      },
    });
    assert(auditRecord !== null, `Registro forense encontrado en audit_logs`);
    assert(auditRecord.action === 'CREATE', `Acción en audit_logs es CREATE`);
    assert(auditRecord.userId === adminUser.id, `userId en audit_logs es el Administrador`);

    // =========================================================================
    // TEST 14: Integridad Unificada del Ledger
    // =========================================================================
    console.log('\n--- PRUEBA 14: Integridad Unificada del Ledger ---');
    const allMovements = await prisma.inventoryMovement.findMany({
      where: { productId: product.id },
    });
    const expectedSum = allMovements.reduce((sum, m) => sum + m.deltaQuantity, 0);
    assert(
      expectedSum === finalStockAfterRace,
      `Cálculo determinístico del Kardex coincide exactamente con el stock del ledger (${expectedSum} === ${finalStockAfterRace})`,
    );

    console.log('\n===============================================================');
    console.log(`🎉 TODOS LOS TESTS E2E Y DE CONCURRENCIA DE AJUSTES PASARON: ${passedTests}/${totalTests}`);
    console.log('===============================================================');
  } finally {
    await app.close();
    await prisma.$disconnect();
  }
}

runE2eAdjustmentsTests().catch((err) => {
  console.error('\n❌ Error fatal en test E2E de Ajustes:', err);
  process.exit(1);
});
