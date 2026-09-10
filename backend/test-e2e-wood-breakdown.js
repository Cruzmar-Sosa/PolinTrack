/**
 * TSK-REC-EXT: LIVE E2E VERIFICATION TEST FOR WOOD BREAKDOWN (YUGOS & REGLAS)
 *
 * Ground Truth: RN-016, RN-016-B, EP-REC-01, EP-REC-02, EP-REC-03, EP-REP-01, EP-TRC-01
 * Runs against live NestJS API on http://localhost:3000/api/v1 and Supabase PostgreSQL.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const API_BASE = 'http://localhost:3000/api/v1';

async function run() {
  console.log('🚀 [TSK-REC-EXT] Starting Live E2E Verification for Yugos & Reglas...');
  let testsPassed = 0;
  let testsTotal = 0;

  function assert(condition, description) {
    testsTotal++;
    if (condition) {
      console.log(`  ✅ [PASS] ${description}`);
      testsPassed++;
    } else {
      console.error(`  ❌ [FAIL] ${description}`);
      throw new Error(`Assertion failed: ${description}`);
    }
  }

  try {
    // 1. Authenticate as ADMIN
    console.log('\n🔑 Step 1: Authenticating as ADMIN...');
    const loginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@polintrack.com',
        password: 'PolinTrack2026!Secure',
      }),
    });
    const loginData = await loginRes.json();
    assert(loginRes.ok && loginData?.data?.accessToken, 'Admin authenticated successfully with JWT token');
    const adminToken = loginData.data.accessToken;

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    };

    // 2. Fetch Catalogs
    console.log('\n📋 Step 2: Fetching active operational catalogs...');
    const [suppliersRes, speciesRes, typesRes] = await Promise.all([
      fetch(`${API_BASE}/suppliers?limit=10&isActive=true`, { headers }),
      fetch(`${API_BASE}/catalog/wood-species?includeInactive=false`, { headers }),
      fetch(`${API_BASE}/catalog/wood-types?includeInactive=false`, { headers }),
    ]);

    const suppliersData = await suppliersRes.json();
    const speciesData = await speciesRes.json();
    const typesData = await typesRes.json();

    const supplier = suppliersData.data[0];
    const species = speciesData.data[0];
    const timbreType = typesData.data.find((t) => t.name === 'TIMBRE');
    const procesadaType = typesData.data.find((t) => t.name === 'PROCESADA');

    assert(supplier && species && timbreType && procesadaType, 'Found active Supplier, Species, TIMBRE and PROCESADA catalogs');

    const todayStr = new Date().toISOString().split('T')[0];

    // 3. Test Invariants for TIMBRE (RN-016 & RN-016-B)
    console.log('\n🪵 Step 3: Verifying TIMBRE Invariants (strictly PIE_TABLAR, no yugos/reglas)...');

    // 3.1 Reject if yugosQuantity is sent with TIMBRE
    const badTimbreRes1 = await fetch(`${API_BASE}/wood-receipts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        supplierId: supplier.id,
        speciesId: species.id,
        woodTypeId: timbreType.id,
        quantity: 1200,
        yugosQuantity: 10,
        receiptDate: todayStr,
        receiptTime: '08:30',
      }),
    });
    assert(
      badTimbreRes1.status === 400,
      `Rejected TIMBRE receipt containing yugosQuantity (HTTP ${badTimbreRes1.status})`
    );

    // 3.2 Reject if reglasQuantity is sent with TIMBRE
    const badTimbreRes2 = await fetch(`${API_BASE}/wood-receipts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        supplierId: supplier.id,
        speciesId: species.id,
        woodTypeId: timbreType.id,
        quantity: 1200,
        reglasQuantity: 15,
        receiptDate: todayStr,
        receiptTime: '08:35',
      }),
    });
    assert(
      badTimbreRes2.status === 400,
      `Rejected TIMBRE receipt containing reglasQuantity (HTTP ${badTimbreRes2.status})`
    );

    // 3.3 Create Valid TIMBRE receipt
    const validTimbreRes = await fetch(`${API_BASE}/wood-receipts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        supplierId: supplier.id,
        speciesId: species.id,
        woodTypeId: timbreType.id,
        quantity: 1500.5,
        receiptDate: todayStr,
        receiptTime: '08:40',
        guideNumber: 'GUIA-TIMBRE-E2E-01',
        woodStatus: 'Bloque rústico de pino',
      }),
    });
    const validTimbreJson = await validTimbreRes.json();
    assert(
      validTimbreRes.status === 201 && validTimbreJson?.data?.lotNumber,
      `Created valid TIMBRE receipt: ${validTimbreJson?.data?.lotNumber}`
    );
    assert(
      validTimbreJson.data.yugosQuantity === null && validTimbreJson.data.reglasQuantity === null,
      'TIMBRE receipt returns null for yugosQuantity and reglasQuantity in API'
    );

    // 4. Test Invariants for PROCESADA (RN-016-B)
    console.log('\n📏 Step 4: Verifying PROCESADA Invariants (Yugos + Reglas = Total Piezas)...');

    // 4.1 Reject if both yugos and reglas are 0 or missing
    const badProcesadaRes1 = await fetch(`${API_BASE}/wood-receipts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        supplierId: supplier.id,
        speciesId: species.id,
        woodTypeId: procesadaType.id,
        quantity: 100,
        yugosQuantity: 0,
        reglasQuantity: 0,
        receiptDate: todayStr,
        receiptTime: '09:00',
      }),
    });
    assert(
      badProcesadaRes1.status === 400,
      `Rejected PROCESADA receipt when both yugosQuantity and reglasQuantity are 0 (HTTP ${badProcesadaRes1.status})`
    );

    // 4.2 Reject if sum does not match quantity (sum mismatch)
    const badProcesadaRes2 = await fetch(`${API_BASE}/wood-receipts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        supplierId: supplier.id,
        speciesId: species.id,
        woodTypeId: procesadaType.id,
        quantity: 200,
        yugosQuantity: 100,
        reglasQuantity: 50, // 100 + 50 = 150 != 200
        receiptDate: todayStr,
        receiptTime: '09:05',
      }),
    });
    assert(
      badProcesadaRes2.status === 400,
      `Rejected PROCESADA receipt with sum inconsistency (100+50 != 200) (HTTP ${badProcesadaRes2.status})`
    );

    // 4.3 Create Valid PROCESADA receipt (120 Yugos + 80 Reglas = 200 Piezas)
    const validProcesadaRes = await fetch(`${API_BASE}/wood-receipts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        supplierId: supplier.id,
        speciesId: species.id,
        woodTypeId: procesadaType.id,
        quantity: 200,
        yugosQuantity: 120,
        reglasQuantity: 80,
        receiptDate: todayStr,
        receiptTime: '09:10',
        guideNumber: 'GUIA-PROCESADA-E2E-01',
        woodStatus: 'Madera dimensionada seca',
      }),
    });
    const validProcesadaJson = await validProcesadaRes.json();
    assert(
      validProcesadaRes.status === 201 && validProcesadaJson?.data?.lotNumber,
      `Created valid PROCESADA receipt: ${validProcesadaJson?.data?.lotNumber}`
    );
    const procesadaLot = validProcesadaJson.data.lotNumber;
    const procesadaId = validProcesadaJson.data.id;

    assert(
      validProcesadaJson.data.yugosQuantity === 120 && validProcesadaJson.data.reglasQuantity === 80,
      'API response returns yugosQuantity: 120 and reglasQuantity: 80'
    );
    assert(
      Number(validProcesadaJson.data.quantity) === 200 && validProcesadaJson.data.unit === 'PIEZAS',
      'API response returns quantity: 200 and unit: PIEZAS'
    );

    // 4.4 Verify GET /wood-receipts/:id returns breakdown
    const getReceiptRes = await fetch(`${API_BASE}/wood-receipts/${procesadaId}`, { headers });
    const getReceiptJson = await getReceiptRes.json();
    assert(
      getReceiptRes.ok &&
        getReceiptJson.data.yugosQuantity === 120 &&
        getReceiptJson.data.reglasQuantity === 80,
      'GET /wood-receipts/:id returns accurate yugosQuantity and reglasQuantity'
    );

    // 4.5 Verify persistence in PostgreSQL database directly via Prisma
    console.log('\n🗄️ Step 5: Verifying direct PostgreSQL database persistence...');
    const dbRecord = await prisma.woodReceipt.findUnique({
      where: { id: procesadaId },
    });
    assert(
      dbRecord && dbRecord.yugosQuantity === 120 && dbRecord.reglasQuantity === 80,
      'Direct PostgreSQL record has yugos_quantity = 120 and reglas_quantity = 80'
    );
    assert(
      Number(dbRecord.quantity) === 200 && dbRecord.unit === 'PIEZAS',
      'Direct PostgreSQL record has quantity = 200 and unit = PIEZAS'
    );

    // 5. Downstream Integration: Reports (EP-REP-01)
    console.log('\n📊 Step 6: Verifying Reports module (EP-REP-01)...');
    const reportsRes = await fetch(`${API_BASE}/reports/wood-receipts?limit=50`, { headers });
    const reportsJson = await reportsRes.json();
    const reportedLot = reportsJson.data.find((item) => item.lotNumber === procesadaLot);
    assert(
      reportedLot && reportedLot.yugosQuantity === 120 && reportedLot.reglasQuantity === 80,
      `Report item for lot ${procesadaLot} includes yugosQuantity: 120 and reglasQuantity: 80`
    );

    // 6. Downstream Integration: Traceability (EP-TRC-01)
    console.log('\n🔍 Step 7: Verifying Traceability module (EP-TRC-01)...');
    const traceRes = await fetch(
      `${API_BASE}/traceability?queryType=LOT_WOOD&queryValue=${procesadaLot}`,
      { headers }
    );
    const traceJson = await traceRes.json();
    assert(traceRes.ok && traceJson.data, 'Traceability query for lot succeeded');
    const originLot = traceJson.data.rawMaterialOrigin?.find((item) => item.lotNumber === procesadaLot);
    assert(
      originLot && originLot.yugosQuantity === 120 && originLot.reglasQuantity === 80,
      `Traceability stage 1 includes yugosQuantity: 120 and reglasQuantity: 80 for ${procesadaLot}`
    );

    // Summary
    console.log(`\n======================================================`);
    console.log(`🎉 ALL TESTS PASSED: ${testsPassed}/${testsTotal} assertions verified!`);
    console.log(`======================================================\n`);
  } catch (err) {
    console.error('\n❌ Test execution encountered an error:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

run();
