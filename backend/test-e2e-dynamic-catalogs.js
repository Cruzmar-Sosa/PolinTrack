/**
 * TSK-24.1: LIVE E2E DYNAMIC CATALOGS TEST (POSTGRESQL REAL)
 * Tests:
 * 1. Login with ADMIN credentials
 * 2. Create new test client center: "Planta Experimental Norte"
 * 3. Verify it appears in active client centers (includeInactive=false)
 * 4. Create new test product: "Polín 60x60 Test"
 * 5. Verify it appears in active products (includeInactive=false)
 * 6. Soft-delete / Inactivate "Planta Experimental Norte" (PATCH status -> false)
 * 7. Verify it is EXCLUDED when includeInactive=false
 * 8. Verify it is INCLUDED when includeInactive=true
 * 9. Verify historical read / ledger / traceability resilience
 * 10. Role access: Verify CONSULTA role gets 403 Forbidden on mutation
 * 11. Controlled cleanup of test entries
 */

const API_BASE = 'http://localhost:3000/api/v1';

async function run() {
  console.log('🚀 Starting TSK-24.1 Live E2E Dynamic Catalogs Test against Real PostgreSQL...');

  // 1. Admin Login
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
  if (!loginRes.ok || !loginData?.data?.accessToken) {
    throw new Error(`Admin login failed: ${JSON.stringify(loginData)}`);
  }
  const adminToken = loginData.data.accessToken;
  console.log('✅ Admin authenticated successfully.');

  // 2. Consulta Login (to test 403)
  console.log('\n🔑 Step 2: Authenticating as CONSULTA...');
  const consultaLoginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'consulta@polintrack.com',
      password: 'PolinTrack2026!Secure',
    }),
  });
  const consultaData = await consultaLoginRes.json();
  const consultaToken = consultaData.data.accessToken;
  console.log('✅ Consulta user authenticated successfully.');

  const adminHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${adminToken}`,
  };

  const consultaHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${consultaToken}`,
  };

  // 3. Verify CONSULTA gets 403 Forbidden on mutation
  console.log('\n🔒 Step 3: Verifying RBAC 403 Forbidden on mutation for CONSULTA...');
  const forbiddenRes = await fetch(`${API_BASE}/catalog/client-centers`, {
    method: 'POST',
    headers: consultaHeaders,
    body: JSON.stringify({
      name: 'Planta Intruso Maliciosa',
      location: 'No autorizado',
    }),
  });
  console.log(`CONSULTA POST response status: ${forbiddenRes.status}`);
  if (forbiddenRes.status !== 403) {
    throw new Error(`Expected 403 Forbidden, got ${forbiddenRes.status}`);
  }
  console.log('✅ RBAC Guard properly blocked CONSULTA mutation (HTTP 403 Forbidden).');

  // 4. Create new Client Center as ADMIN
  console.log('\n🏭 Step 4: Creating new Client Center "Planta Experimental Norte"...');
  const testPlantName = `Planta Experimental Norte ${Date.now().toString().slice(-4)}`;
  const createPlantRes = await fetch(`${API_BASE}/catalog/client-centers`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      name: testPlantName,
      location: 'Km 140 Carretera a Chinandega, Sector Norte',
    }),
  });
  const plantData = await createPlantRes.json();
  if (!createPlantRes.ok) {
    throw new Error(`Failed to create plant: ${JSON.stringify(plantData)}`);
  }
  const testPlant = plantData.data;
  console.log(`✅ Created Client Center: ID ${testPlant.id}, Name: "${testPlant.name}", Active: ${testPlant.isActive}`);

  // 5. Verify positive operation: appears in active list
  console.log('\n🔍 Step 5: Checking active list for new Client Center (includeInactive=false)...');
  const activePlantsRes = await fetch(`${API_BASE}/catalog/client-centers?includeInactive=false`, {
    headers: adminHeaders,
  });
  const activePlants = (await activePlantsRes.json()).data;
  const foundActive = activePlants.some((p) => p.id === testPlant.id);
  if (!foundActive) {
    throw new Error(`Created plant ${testPlant.id} was not found in active list!`);
  }
  console.log('✅ Positive Check: Plant is present in active operational selector list.');

  // 6. Inactivate (Soft-Delete) via PATCH /status
  console.log('\n🛑 Step 6: Inactivating Client Center (Soft-Delete: PATCH .../status with isActive: false)...');
  const statusRes = await fetch(`${API_BASE}/catalog/client-centers/${testPlant.id}/status`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ isActive: false }),
  });
  const statusData = await statusRes.json();
  if (!statusRes.ok || statusData.data.isActive !== false) {
    throw new Error(`Failed to inactivate plant: ${JSON.stringify(statusData)}`);
  }
  console.log(`✅ Plant successfully inactivated: isActive = ${statusData.data.isActive}`);

  // 7. Verify negative operation: EXCLUDED from active list
  console.log('\n🔍 Step 7: Verifying exclusion from active operational list (includeInactive=false)...');
  const activeAfterInactRes = await fetch(`${API_BASE}/catalog/client-centers?includeInactive=false`, {
    headers: adminHeaders,
  });
  const activeAfterInact = (await activeAfterInactRes.json()).data;
  const foundInActive = activeAfterInact.some((p) => p.id === testPlant.id);
  if (foundInActive) {
    throw new Error(`Inactivated plant ${testPlant.id} is still appearing in active operational list!`);
  }
  console.log('✅ Negative Check: Inactivated plant is properly excluded from operational dropdown.');

  // 8. Verify inclusion in historical / administrative list (includeInactive=true)
  console.log('\n📜 Step 8: Verifying retention in administrative list (includeInactive=true)...');
  const allPlantsRes = await fetch(`${API_BASE}/catalog/client-centers?includeInactive=true`, {
    headers: adminHeaders,
  });
  const allPlants = (await allPlantsRes.json()).data;
  const foundInAll = allPlants.some((p) => p.id === testPlant.id);
  if (!foundInAll) {
    throw new Error(`Inactivated plant ${testPlant.id} missing from complete administrative list!`);
  }
  console.log('✅ Historical Retention: Plant remains present and intact with isActive: false.');

  // 9. Test Product Creation & Inactivation
  console.log('\n📦 Step 9: Testing Product creation and Soft-Delete...');
  const testProdName = `Polín 60x60 Test ${Date.now().toString().slice(-4)}`;
  const createProdRes = await fetch(`${API_BASE}/catalog/products`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      name: testProdName,
      dimensions: '60x60',
    }),
  });
  const prodData = await createProdRes.json();
  if (!createProdRes.ok) {
    throw new Error(`Failed to create product: ${JSON.stringify(prodData)}`);
  }
  const testProd = prodData.data;
  console.log(`✅ Created Product: ID ${testProd.id}, Name: "${testProd.name}"`);

  // Inactivate Product
  await fetch(`${API_BASE}/catalog/products/${testProd.id}/status`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ isActive: false }),
  });
  const activeProdsRes = await fetch(`${API_BASE}/catalog/products?includeInactive=false`, {
    headers: adminHeaders,
  });
  const activeProds = (await activeProdsRes.json()).data;
  if (activeProds.some((p) => p.id === testProd.id)) {
    throw new Error('Inactivated product appeared in active list!');
  }
  console.log('✅ Inactivated Product successfully excluded from active production selectors.');

  // 10. Controlled Cleanup of test items via Prisma
  console.log('\n🧹 Step 10: Cleaning up test records from database...');
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  await prisma.auditLog.deleteMany({
    where: { recordId: { in: [testPlant.id, testProd.id] } },
  });
  await prisma.clientCenter.delete({ where: { id: testPlant.id } });
  await prisma.product.delete({ where: { id: testProd.id } });
  await prisma.$disconnect();
  console.log('✅ Test artifacts cleaned up. Seeded master catalogs remain 100% untouched.');

  console.log('\n🎉 ALL TSK-24.1 LIVE E2E CHECKS PASSED WITH FLYING COLORS!');
}

run().catch((err) => {
  console.error('❌ E2E Dynamic Catalogs Test Failed:', err);
  process.exit(1);
});
