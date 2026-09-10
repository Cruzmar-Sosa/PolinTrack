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

async function runE2eReportsDashboardTests() {
  console.log('===============================================================');
  console.log('🚀 INICIANDO TEST E2E — TSK-15: REPORTS & DASHBOARD MODULE');
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

    // Contar movimientos de inventario antes para verificar inmutabilidad
    const movementsCountBefore = await prisma.inventoryMovement.count();

    // =========================================================================
    // TEST 1: DASHBOARD KPIS (EP-DSH-01)
    // =========================================================================
    console.log('\n--- PRUEBA 1: Dashboard 5 KPIs en tiempo real (EP-DSH-01) ---');
    const resKpis = await fetch(`${baseUrl}/dashboard/kpis`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert(resKpis.status === 200, `GET /dashboard/kpis devuelve 200 OK (obtenido ${resKpis.status})`);
    const jsonKpis = await resKpis.json();
    assert(jsonKpis.success === true, `Dashboard response success: true`);
    const kpiData = jsonKpis.data;

    // KPI 1: Inventario Actual
    assert(kpiData.kpi1_currentInventory !== undefined, `KPI 1: kpi1_currentInventory presente`);
    assert(typeof kpiData.kpi1_currentInventory.totalPieces === 'number', `KPI 1 totalPieces es numérico (${kpiData.kpi1_currentInventory.totalPieces})`);
    assert(Array.isArray(kpiData.kpi1_currentInventory.byProduct), `KPI 1 byProduct es un array`);
    assert(kpiData.kpi1_currentInventory.byProduct.length >= 5, `KPI 1 desglosa los 5 tipos de polines`);

    // KPI 2: Entradas de Madera
    assert(kpiData.kpi2_woodReceipts !== undefined, `KPI 2: kpi2_woodReceipts presente`);
    assert(typeof kpiData.kpi2_woodReceipts.timbrePieTablarTotal === 'number', `KPI 2 timbrePieTablarTotal es numérico (${kpiData.kpi2_woodReceipts.timbrePieTablarTotal})`);
    assert(typeof kpiData.kpi2_woodReceipts.procesadaPiecesTotal === 'number', `KPI 2 procesadaPiecesTotal es numérico (${kpiData.kpi2_woodReceipts.procesadaPiecesTotal})`);

    // KPI 3: Salidas de Polines
    assert(kpiData.kpi3_polinesDispatched !== undefined, `KPI 3: kpi3_polinesDispatched presente`);
    assert(typeof kpiData.kpi3_polinesDispatched.totalPieces === 'number', `KPI 3 totalPieces es numérico (${kpiData.kpi3_polinesDispatched.totalPieces})`);

    // KPI 4: Madera Despachada Equivalente
    assert(kpiData.kpi4_woodDispatchedEquivalent !== undefined, `KPI 4: kpi4_woodDispatchedEquivalent presente`);
    assert(typeof kpiData.kpi4_woodDispatchedEquivalent.totalDispatchedEquivalent === 'number', `KPI 4 totalDispatchedEquivalent es numérico (${kpiData.kpi4_woodDispatchedEquivalent.totalDispatchedEquivalent})`);

    // KPI 5: Salidas por Centro Cliente
    assert(kpiData.kpi5_dispatchesByClientCenter !== undefined, `KPI 5: kpi5_dispatchesByClientCenter presente`);
    assert(Array.isArray(kpiData.kpi5_dispatchesByClientCenter), `KPI 5 es un array`);
    assert(kpiData.kpi5_dispatchesByClientCenter.length === 7, `KPI 5 incluye exactamente las 7 plantas cliente`);

    // =========================================================================
    // TEST 2: REPORTE 1 — INGRESOS DE MADERA (EP-REP-01)
    // =========================================================================
    console.log('\n--- PRUEBA 2: Reporte 1 - Ingresos de Madera (EP-REP-01) ---');
    const resRep1 = await fetch(`${baseUrl}/reports/wood-receipts?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${contabilidadToken}` },
    });
    assert(resRep1.status === 200, `GET /reports/wood-receipts devuelve 200 OK`);
    const jsonRep1 = await resRep1.json();
    assert(jsonRep1.success === true, `Reporte 1 success: true`);
    assert(Array.isArray(jsonRep1.data), `Reporte 1 data es un array`);
    assert(jsonRep1.meta && typeof jsonRep1.meta.total === 'number', `Reporte 1 incluye paginación con meta.total`);

    if (jsonRep1.data.length > 0) {
      const item = jsonRep1.data[0];
      assert(item.receiptDate && item.lotNumber && item.supplierName, `Reporte 1 tiene campos canónicos (receiptDate, lotNumber, supplierName)`);
    }

    // =========================================================================
    // TEST 3: REPORTE 2 — SALIDAS Y DESPACHOS (EP-REP-02)
    // =========================================================================
    console.log('\n--- PRUEBA 3: Reporte 2 - Salidas y Despachos (EP-REP-02) ---');
    const resRep2 = await fetch(`${baseUrl}/reports/dispatches?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${consultaToken}` },
    });
    assert(resRep2.status === 200, `GET /reports/dispatches devuelve 200 OK`);
    const jsonRep2 = await resRep2.json();
    assert(jsonRep2.success === true, `Reporte 2 success: true`);
    assert(Array.isArray(jsonRep2.data), `Reporte 2 data es un array`);
    assert(jsonRep2.meta && typeof jsonRep2.meta.total === 'number', `Reporte 2 incluye paginación`);

    // =========================================================================
    // TEST 4: REPORTE 3 — INVENTARIO OPERATIVO CONSOLIDADO (EP-REP-03)
    // =========================================================================
    console.log('\n--- PRUEBA 4: Reporte 3 - Inventario Operativo (EP-REP-03) ---');
    const resRep3 = await fetch(`${baseUrl}/reports/inventory`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(resRep3.status === 200, `GET /reports/inventory devuelve 200 OK`);
    const jsonRep3 = await resRep3.json();
    assert(jsonRep3.success === true, `Reporte 3 success: true`);
    assert(Array.isArray(jsonRep3.data), `Reporte 3 data es un array`);
    assert(jsonRep3.summary !== undefined, `Reporte 3 incluye summary consolidado`);
    assert(typeof jsonRep3.summary.totalAvailableStock === 'number', `Reporte 3 totalAvailableStock es numérico`);

    if (jsonRep3.data.length > 0) {
      const item = jsonRep3.data[0];
      assert(
        item.productName &&
        typeof item.totalProduced === 'number' &&
        typeof item.totalDispatched === 'number' &&
        typeof item.currentAvailableStock === 'number',
        `Reporte 3 desglosa producción, despachos y stock disponible por polín`,
      );
    }

    // =========================================================================
    // TEST 5: REPORTE 4 — PRODUCCIÓN DIARIA POR SEMANA ISO (EP-REP-04)
    // =========================================================================
    console.log('\n--- PRUEBA 5: Reporte 4 - Producción Diaria (EP-REP-04) ---');
    const resRep4 = await fetch(`${baseUrl}/reports/daily-productions?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${contabilidadToken}` },
    });
    assert(resRep4.status === 200, `GET /reports/daily-productions devuelve 200 OK`);
    const jsonRep4 = await resRep4.json();
    assert(jsonRep4.success === true, `Reporte 4 success: true`);
    assert(Array.isArray(jsonRep4.data), `Reporte 4 data es un array`);
    assert(jsonRep4.meta && typeof jsonRep4.meta.total === 'number', `Reporte 4 incluye paginación`);

    // =========================================================================
    // TEST 6: REPORTE 5 — FUMIGACIONES Y CERTIFICADOS OIRSA (EP-REP-05)
    // =========================================================================
    console.log('\n--- PRUEBA 6: Reporte 5 - Fumigaciones OIRSA (EP-REP-05) ---');
    const resRep5 = await fetch(`${baseUrl}/reports/fumigations?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${consultaToken}` },
    });
    assert(resRep5.status === 200, `GET /reports/fumigations devuelve 200 OK`);
    const jsonRep5 = await resRep5.json();
    assert(jsonRep5.success === true, `Reporte 5 success: true`);
    assert(Array.isArray(jsonRep5.data), `Reporte 5 data es un array`);

    if (jsonRep5.data.length > 0) {
      const item = jsonRep5.data[0];
      assert(
        item.certificateNumber && item.certificateDownloadUrl,
        `Reporte 5 contiene certificado OIRSA y certificateDownloadUrl`,
      );
    }

    // =========================================================================
    // TEST 7: REPORTE 6 — MOVIMIENTOS POR CENTRO CLIENTE (EP-REP-06)
    // =========================================================================
    console.log('\n--- PRUEBA 7: Reporte 6 - Distribución por Centro (EP-REP-06) ---');
    const resRep6 = await fetch(`${baseUrl}/reports/distribution-centers`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(resRep6.status === 200, `GET /reports/distribution-centers devuelve 200 OK`);
    const jsonRep6 = await resRep6.json();
    assert(jsonRep6.success === true, `Reporte 6 success: true`);
    assert(Array.isArray(jsonRep6.data), `Reporte 6 data es un array`);
    assert(jsonRep6.data.length === 7, `Reporte 6 contiene exactamente las 7 plantas cliente`);
    assert(jsonRep6.summary !== undefined, `Reporte 6 incluye summary global`);

    // =========================================================================
    // TEST 8: VALIDACIÓN ESTRICTA RN-007 (startDate > endDate -> 400 Bad Request)
    // =========================================================================
    console.log('\n--- PRUEBA 8: Validación estricta RN-007 (startDate > endDate) ---');
    const invalidDates = 'startDate=2026-09-30&endDate=2026-09-01';

    // Probar en Dashboard
    const resDshInvalid = await fetch(`${baseUrl}/dashboard/kpis?${invalidDates}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(resDshInvalid.status === 400, `GET /dashboard/kpis con startDate > endDate devuelve 400 Bad Request`);
    const jsonDshInvalid = await resDshInvalid.json();
    assert(
      jsonDshInvalid.message === 'La fecha inicial no puede ser posterior a la fecha final' ||
      JSON.stringify(jsonDshInvalid).includes('posterior'),
      `Mensaje descriptivo de RN-007 en Dashboard`,
    );

    // Probar en Reporte 1
    const resR1Invalid = await fetch(`${baseUrl}/reports/wood-receipts?${invalidDates}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(resR1Invalid.status === 400, `GET /reports/wood-receipts con startDate > endDate devuelve 400`);

    // Probar en Reporte 2
    const resR2Invalid = await fetch(`${baseUrl}/reports/dispatches?${invalidDates}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(resR2Invalid.status === 400, `GET /reports/dispatches con startDate > endDate devuelve 400`);

    // Probar en Reporte 4
    const resR4Invalid = await fetch(`${baseUrl}/reports/daily-productions?${invalidDates}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(resR4Invalid.status === 400, `GET /reports/daily-productions con startDate > endDate devuelve 400`);

    // Probar en Reporte 5
    const resR5Invalid = await fetch(`${baseUrl}/reports/fumigations?${invalidDates}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(resR5Invalid.status === 400, `GET /reports/fumigations con startDate > endDate devuelve 400`);

    // Probar en Reporte 6
    const resR6Invalid = await fetch(`${baseUrl}/reports/distribution-centers?${invalidDates}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(resR6Invalid.status === 400, `GET /reports/distribution-centers con startDate > endDate devuelve 400`);

    // =========================================================================
    // TEST 9: RBAC & AUTENTICACIÓN (Sin Token -> 401 Unauthorized)
    // =========================================================================
    console.log('\n--- PRUEBA 9: Seguridad y RBAC ---');
    const resNoAuthDsh = await fetch(`${baseUrl}/dashboard/kpis`);
    assert(resNoAuthDsh.status === 401, `GET /dashboard/kpis sin token devuelve 401 Unauthorized`);

    const resNoAuthRep = await fetch(`${baseUrl}/reports/wood-receipts`);
    assert(resNoAuthRep.status === 401, `GET /reports/wood-receipts sin token devuelve 401 Unauthorized`);

    // =========================================================================
    // TEST 10: INMUTABILIDAD Y READ-ONLY (Prohibición de Verbos Mutativos)
    // =========================================================================
    console.log('\n--- PRUEBA 10: Inmutabilidad estricta (Zero Mutations) ---');
    const resPostDsh = await fetch(`${baseUrl}/dashboard/kpis`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: 123 }),
    });
    assert(resPostDsh.status === 404 || resPostDsh.status === 405, `POST /dashboard/kpis prohibido (404/405)`);

    const resPostRep = await fetch(`${baseUrl}/reports/wood-receipts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: 123 }),
    });
    assert(resPostRep.status === 404 || resPostRep.status === 405, `POST /reports/wood-receipts prohibido (404/405)`);

    const resDeleteRep = await fetch(`${baseUrl}/reports/inventory`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(resDeleteRep.status === 404 || resDeleteRep.status === 405, `DELETE /reports/inventory prohibido (404/405)`);

    // Confirmar que el conteo de movimientos de inventario no cambió en absoluto
    const movementsCountAfter = await prisma.inventoryMovement.count();
    assert(
      movementsCountBefore === movementsCountAfter,
      `Conteo del ledger inalterado antes (${movementsCountBefore}) y después (${movementsCountAfter}) de reportes`,
    );

    console.log('\n===============================================================');
    console.log(`🎉 TODOS LOS TESTS E2E DE REPORTS & DASHBOARD PASARON: ${passedTests}/${totalTests}`);
    console.log('===============================================================');
  } finally {
    await app.close();
    await prisma.$disconnect();
  }
}

runE2eReportsDashboardTests().catch((err) => {
  console.error('\n❌ Error fatal en test E2E de Reports & Dashboard:', err);
  process.exit(1);
});
