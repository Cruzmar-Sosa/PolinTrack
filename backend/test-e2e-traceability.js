require('dotenv').config();
const {
  PrismaClient,
  RoleType,
  DispatchStatus,
  ReturnTypeEnum,
  UnitOfMeasure,
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

async function runE2eTraceabilityTests() {
  console.log('===============================================================');
  console.log('🚀 INICIANDO TEST E2E — TSK-14: TRACEABILITY DAG MODULE');
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

    // 2. Sembrar una cadena genealógica completa en PostgreSQL
    const supplier = await prisma.supplier.findFirst({ where: { isActive: true } });
    const species = await prisma.woodSpecies.findFirst();
    const woodType = await prisma.woodType.findFirst();
    const clientCenter = await prisma.clientCenter.findFirst({ where: { isActive: true } });
    const product = await prisma.product.findFirst({ where: { isActive: true } });

    assert(supplier, `Proveedor base: ${supplier.name}`);
    assert(species, `Especie base: ${species.name}`);
    assert(woodType, `Tipo madera base: ${woodType.name}`);
    assert(clientCenter, `Centro cliente base: ${clientCenter.name}`);
    assert(product, `Producto base: ${product.name}`);

    const uniqueId = Date.now();
    const woodLot = `LT-TRC-W-${uniqueId}`;
    const prodLot = `LT-TRC-P-${uniqueId}`;
    const certNumber = `OIRSA-TRC-${uniqueId}`;
    const invoiceNum = `F-TRC-${uniqueId}`;

    // A. Recepción de madera
    const woodReceipt = await prisma.woodReceipt.create({
      data: {
        lotNumber: woodLot,
        supplierId: supplier.id,
        speciesId: species.id,
        woodTypeId: woodType.id,
        quantity: 5000,
        unit: UnitOfMeasure.PIE_TABLAR,
        receiptDate: new Date('2026-09-01T00:00:00.000Z'),
        receiptTime: new Date('1970-01-01T08:00:00.000Z'),
        createdById: adminUser.id,
      },
    });

    // B. Producción diaria (500 piezas)
    const dailyProduction = await prisma.dailyProduction.create({
      data: {
        productionLot: prodLot,
        productId: product.id,
        quantityProduced: 500,
        productionDate: new Date('2026-09-02T00:00:00.000Z'),
        isoWeek: 36,
        createdById: adminUser.id,
      },
    });

    // C. Enlace M:N ProductionWoodReceipt
    await prisma.productionWoodReceipt.create({
      data: {
        dailyProductionId: dailyProduction.id,
        woodReceiptId: woodReceipt.id,
      },
    });

    // D. Fumigación fitosanitaria
    await prisma.fumigation.create({
      data: {
        dailyProductionId: dailyProduction.id,
        certificateNumber: certNumber,
        pdfFilePath: `certificates/2026/09/${certNumber}.pdf`,
        pdfFileName: `${certNumber}.pdf`,
        fileSizeBytes: 102400,
        fumigationDate: new Date('2026-09-02T00:00:00.000Z'),
        fumigationTime: new Date('1970-01-01T14:00:00.000Z'),
        registeredById: adminUser.id,
      },
    });

    // E. Despacho comercial (300 piezas despachadas)
    const dispatchHeader = await prisma.dispatchHeader.create({
      data: {
        invoiceNumber: invoiceNum,
        clientCenterId: clientCenter.id,
        dispatchDate: new Date('2026-09-03T00:00:00.000Z'),
        dispatchTime: new Date('1970-01-01T09:00:00.000Z'),
        vehicleInfo: 'M-99887',
        driverName: 'Marcos E2E',
        status: DispatchStatus.COMPLETED,
        createdById: contabilidadUser.id,
      },
    });

    const dispatchDetail = await prisma.dispatchDetail.create({
      data: {
        dispatchHeaderId: dispatchHeader.id,
        productId: product.id,
        dailyProductionId: dailyProduction.id,
        quantityDispatched: 300,
        dimensions: product.dimensions,
        quantityReturnedAccumulated: 0,
      },
    });

    // F. Devolución parcial (50 piezas devueltas)
    const returnHeader = await prisma.returnHeader.create({
      data: {
        dispatchHeaderId: dispatchHeader.id,
        returnDate: new Date('2026-09-03T00:00:00.000Z'),
        returnType: ReturnTypeEnum.PARCIAL,
        reason: 'Rechazo parcial por humedad en Planta de destino',
        registeredById: contabilidadUser.id,
      },
    });

    await prisma.returnDetail.create({
      data: {
        returnHeaderId: returnHeader.id,
        dispatchDetailId: dispatchDetail.id,
        productId: product.id,
        quantityReturned: 50,
      },
    });

    await prisma.dispatchDetail.update({
      where: { id: dispatchDetail.id },
      data: { quantityReturnedAccumulated: 50 },
    });

    console.log(`🔗 Cadena operativa completa sembrada en PostgreSQL:`);
    console.log(`   Madera: ${woodLot} -> Producción: ${prodLot} -> Fumigación: ${certNumber} -> Despacho: ${invoiceNum} -> Devolución: 50 pcs`);

    // =========================================================================
    // TEST 1: Consulta por LOT_PRODUCTION (Travesía Completa y DAG)
    // =========================================================================
    // Warm-up call to prime connection pool and JIT
    await fetch(`${baseUrl}/traceability?queryType=LOT_PRODUCTION&queryValue=${prodLot}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    const startT1 = Date.now();
    const resProd = await fetch(
      `${baseUrl}/traceability?queryType=LOT_PRODUCTION&queryValue=${prodLot}`,
      {
        headers: { Authorization: `Bearer ${adminToken}` },
      },
    );
    const durationT1 = Date.now() - startT1;

    assert(resProd.status === 200, `GET /traceability?queryType=LOT_PRODUCTION devuelve 200 OK (obtenido ${resProd.status})`);
    assert(durationT1 < 5000, `Rendimiento de traversal WAN < 5000ms (obtenido ${durationT1}ms)`);

    const jsonProd = await resProd.json();
    const dataProd = jsonProd.data;

    assert(dataProd.queryType === 'LOT_PRODUCTION', `queryType coincide con LOT_PRODUCTION`);
    assert(dataProd.production.lot === prodLot, `production.lot coincide con ${prodLot}`);
    assert(dataProd.production.quantityProduced === 500, `quantityProduced coincide con 500`);
    assert(dataProd.rawMaterialOrigin.length === 1, `rawMaterialOrigin contiene 1 lote de madera`);
    assert(dataProd.rawMaterialOrigin[0].lotNumber === woodLot, `lotNumber de madera coincide con ${woodLot}`);
    assert(dataProd.fumigations.length === 1, `fumigations contiene 1 certificado`);
    assert(dataProd.fumigations[0].certificateNumber === certNumber, `certificateNumber coincide con ${certNumber}`);
    assert(dataProd.dispatches.length === 1, `dispatches contiene 1 factura`);
    assert(dataProd.dispatches[0].invoiceNumber === invoiceNum, `invoiceNumber coincide con ${invoiceNum}`);
    assert(dataProd.returns.length === 1, `returns contiene 1 devolución`);
    assert(dataProd.returns[0].quantityReturned === 50, `quantityReturned coincide con 50`);

    // Comprobar estado del lote
    assert(dataProd.currentLotStatus.initialProduced === 500, `initialProduced es 500`);
    assert(dataProd.currentLotStatus.currentlyDelivered === 250, `currentlyDelivered es 250 (300 - 50)`);
    assert(dataProd.currentLotStatus.availableInYard === 250, `availableInYard es 250 (500 - 250)`);

    // Comprobar topología del grafo DAG
    assert(dataProd.graph.nodes.length >= 5, `Grafo contiene al menos 5 nodos`);
    assert(dataProd.graph.edges.length >= 4, `Grafo contiene al menos 4 aristas`);
    const edgeRels = dataProd.graph.edges.map((e) => e.relationship);
    assert(edgeRels.includes('SUPPLIES'), `Arista SUPPLIES presente (Madera -> Producción)`);
    assert(edgeRels.includes('TREATED_BY'), `Arista TREATED_BY presente (Producción -> Fumigación)`);
    assert(edgeRels.includes('DISPATCHED_IN'), `Arista DISPATCHED_IN presente (Producción -> Despacho)`);
    assert(edgeRels.includes('RETURNED_FROM'), `Arista RETURNED_FROM presente (Despacho -> Devolución)`);

    // =========================================================================
    // TEST 2: Consulta por LOT_WOOD (Travesía hacia adelante)
    // =========================================================================
    console.log('\n--- PRUEBA 2: Consulta por LOT_WOOD (Travesía Forward) ---');
    const startT2 = Date.now();
    const resWood = await fetch(
      `${baseUrl}/traceability?queryType=LOT_WOOD&queryValue=${woodLot}`,
      {
        headers: { Authorization: `Bearer ${contabilidadToken}` },
      },
    );
    const durationT2 = Date.now() - startT2;

    assert(resWood.status === 200, `GET /traceability?queryType=LOT_WOOD devuelve 200 OK (obtenido ${resWood.status})`);
    assert(durationT2 < 5000, `Rendimiento de traversal WAN < 5000ms (obtenido ${durationT2}ms)`);

    const jsonWood = await resWood.json();
    const dataWood = jsonWood.data;

    assert(dataWood.rawMaterialOrigin[0].lotNumber === woodLot, `Materia prima identificada: ${woodLot}`);
    assert(dataWood.production.lot === prodLot, `Producción enlazada identificada: ${prodLot}`);
    assert(dataWood.fumigations[0].certificateNumber === certNumber, `Fumigación enlazada: ${certNumber}`);
    assert(dataWood.dispatches[0].invoiceNumber === invoiceNum, `Despacho enlazado: ${invoiceNum}`);
    assert(dataWood.returns[0].quantityReturned === 50, `Devolución enlazada: 50 piezas`);

    // =========================================================================
    // TEST 3: Consulta por INVOICE (Travesía hacia atrás)
    // =========================================================================
    console.log('\n--- PRUEBA 3: Consulta por INVOICE (Travesía Backward) ---');
    const startT3 = Date.now();
    const resInv = await fetch(
      `${baseUrl}/traceability?queryType=INVOICE&queryValue=${invoiceNum}`,
      {
        headers: { Authorization: `Bearer ${consultaToken}` },
      },
    );
    const durationT3 = Date.now() - startT3;

    assert(resInv.status === 200, `GET /traceability?queryType=INVOICE devuelve 200 OK (obtenido ${resInv.status})`);
    assert(durationT3 < 5000, `Rendimiento de traversal WAN < 5000ms (obtenido ${durationT3}ms)`);

    const jsonInv = await resInv.json();
    const dataInv = jsonInv.data;

    assert(dataInv.dispatches[0].invoiceNumber === invoiceNum, `Despacho origen identificado: ${invoiceNum}`);
    assert(dataInv.production.lot === prodLot, `Producción previa identificada: ${prodLot}`);
    assert(dataInv.rawMaterialOrigin[0].lotNumber === woodLot, `Madera original identificada: ${woodLot}`);
    assert(dataInv.fumigations[0].certificateNumber === certNumber, `Certificado fitosanitario previo: ${certNumber}`);
    assert(dataInv.returns[0].quantityReturned === 50, `Devolución asociada identificada: 50 piezas`);

    // =========================================================================
    // TEST 4: RBAC & Seguridad (Sin Token -> 401 Unauthorized)
    // =========================================================================
    console.log('\n--- PRUEBA 4: Acceso sin autenticar rechazado ---');
    const resNoAuth = await fetch(
      `${baseUrl}/traceability?queryType=LOT_PRODUCTION&queryValue=${prodLot}`,
    );
    assert(resNoAuth.status === 401, `GET /traceability sin token devuelve 401 Unauthorized (obtenido ${resNoAuth.status})`);

    // =========================================================================
    // TEST 5: Criterios No Encontrados (404 Not Found)
    // =========================================================================
    console.log('\n--- PRUEBA 5: Búsquedas no encontradas devuelven 404 ---');
    const resNotFoundProd = await fetch(
      `${baseUrl}/traceability?queryType=LOT_PRODUCTION&queryValue=LT-INEXISTENTE-999`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    assert(resNotFoundProd.status === 404, `Lote de producción inexistente devuelve 404 Not Found`);

    const resNotFoundWood = await fetch(
      `${baseUrl}/traceability?queryType=LOT_WOOD&queryValue=LT-WOOD-FAKE-999`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    assert(resNotFoundWood.status === 404, `Lote de madera inexistente devuelve 404 Not Found`);

    const resNotFoundInv = await fetch(
      `${baseUrl}/traceability?queryType=INVOICE&queryValue=F-FAKE-999`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    assert(resNotFoundInv.status === 404, `Factura inexistente devuelve 404 Not Found`);

    // =========================================================================
    // TEST 6: Parámetros Inválidos (400 Bad Request)
    // =========================================================================
    console.log('\n--- PRUEBA 6: Parámetros inválidos rechazados con 400 ---');
    const resInvalidQuery = await fetch(
      `${baseUrl}/traceability?queryType=CRITERIO_INVALIDO&queryValue=123`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    assert(resInvalidQuery.status === 400, `queryType no reconocido devuelve 400 Bad Request`);

    // =========================================================================
    // TEST 7: Inmutabilidad (RN-001) - Prohibición de Verbos Mutativos
    // =========================================================================
    console.log('\n--- PRUEBA 7: Inmutabilidad y Protección Read-Only ---');
    const resPost = await fetch(`${baseUrl}/traceability`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ any: 'mutation' }),
    });
    assert(resPost.status === 404 || resPost.status === 405, `POST /traceability prohibido (obtenido ${resPost.status})`);

    const resPut = await fetch(`${baseUrl}/traceability`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ any: 'mutation' }),
    });
    assert(resPut.status === 404 || resPut.status === 405, `PUT /traceability prohibido (obtenido ${resPut.status})`);

    const resDelete = await fetch(`${baseUrl}/traceability`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(resDelete.status === 404 || resDelete.status === 405, `DELETE /traceability prohibido (obtenido ${resDelete.status})`);

    console.log('\n===============================================================');
    console.log(`🎉 TODOS LOS TESTS E2E DE TRAZABILIDAD PASARON: ${passedTests}/${totalTests}`);
    console.log('===============================================================');
  } finally {
    await app.close();
    await prisma.$disconnect();
  }
}

runE2eTraceabilityTests().catch((err) => {
  console.error('\n❌ Error fatal en test E2E de Trazabilidad:', err);
  process.exit(1);
});
