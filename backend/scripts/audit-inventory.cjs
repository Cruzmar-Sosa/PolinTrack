const http = require('http');

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function login(email, password) {
  const res = await request(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/v1/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { email, password }
  );
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return {
    token: res.body.data.accessToken,
    user: res.body.data.user,
  };
}

async function runAudit() {
  console.log('================================================================');
  console.log('🔍 INICIANDO AUDITORÍA OPERATIVA EN VIVO - TSK-21 (PHASE A)');
  console.log('================================================================\n');

  // 1. AUTH / RBAC TOKENS
  console.log('--- 1. VERIFICACIÓN DE AUTENTICACIÓN Y ROLES ---');
  let adminAuth, contabAuth, consultaAuth;
  try {
    adminAuth = await login('admin@polintrack.com', 'PolinTrack2026!Secure');
    console.log(`✅ Login ADMIN exitoso: ${adminAuth.user.fullName} (${adminAuth.user.role})`);
  } catch (e) {
    console.error('❌ Error login ADMIN:', e.message);
  }

  try {
    contabAuth = await login('contabilidad@polintrack.com', 'PolinTrack2026!Secure');
    console.log(`✅ Login CONTABILIDAD exitoso: ${contabAuth.user.fullName} (${contabAuth.user.role})`);
  } catch (e) {
    console.error('❌ Error login CONTABILIDAD:', e.message);
  }

  try {
    consultaAuth = await login('consulta@polintrack.com', 'PolinTrack2026!Secure');
    console.log(`✅ Login CONSULTA exitoso: ${consultaAuth.user.fullName} (${consultaAuth.user.role})`);
  } catch (e) {
    console.error('❌ Error login CONSULTA:', e.message);
  }

  // 2. EP-INV-01: GET /api/v1/inventory
  console.log('\n--- 2. AUDITORÍA EP-INV-01: GET /api/v1/inventory (Stock Disponible) ---');
  // Anonymous
  const anonInv = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/inventory',
    method: 'GET',
  });
  console.log(`[RBAC] Anónimo GET /inventory: HTTP ${anonInv.status} (esperado 401: ${anonInv.status === 401 ? 'PASS' : 'FAIL'})`);

  // Consulta
  const consultaInv = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/inventory',
    method: 'GET',
    headers: { Authorization: `Bearer ${consultaAuth.token}` },
  });
  console.log(`[RBAC] CONSULTA GET /inventory: HTTP ${consultaInv.status} (esperado 200: ${consultaInv.status === 200 ? 'PASS' : 'FAIL'})`);

  // Contabilidad
  const contabInv = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/inventory',
    method: 'GET',
    headers: { Authorization: `Bearer ${contabAuth.token}` },
  });
  console.log(`[RBAC] CONTABILIDAD GET /inventory: HTTP ${contabInv.status} (esperado 200: ${contabInv.status === 200 ? 'PASS' : 'FAIL'})`);

  // Admin
  const adminInv = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/inventory',
    method: 'GET',
    headers: { Authorization: `Bearer ${adminAuth.token}` },
  });
  console.log(`[RBAC] ADMIN GET /inventory: HTTP ${adminInv.status} (esperado 200: ${adminInv.status === 200 ? 'PASS' : 'FAIL'})`);

  console.log('\n[Datos Reales] Existencias devueltas por PostgreSQL:');
  const inventoryData = adminInv.body?.data || [];
  console.log(`Total productos en inventario: ${inventoryData.length}`);
  inventoryData.forEach((p, idx) => {
    console.log(`  ${idx + 1}. ${p.productName} (${p.dimensions}):`);
    console.log(`     Producción: ${p.producedQuantity} | Despachos: ${p.dispatchedQuantity} | Devoluciones: ${p.returnedQuantity} | Ajustes: ${p.adjustmentNetQuantity} | Stock Disp: ${p.availableStock}`);
  });

  // 3. EP-INV-02: GET /api/v1/inventory/movements (Kardex)
  console.log('\n--- 3. AUDITORÍA EP-INV-02: GET /api/v1/inventory/movements (Kardex) ---');
  const anonKardex = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/inventory/movements',
    method: 'GET',
  });
  console.log(`[RBAC] Anónimo GET /inventory/movements: HTTP ${anonKardex.status} (esperado 401)`);

  const adminKardex = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/inventory/movements?limit=10',
    method: 'GET',
    headers: { Authorization: `Bearer ${adminAuth.token}` },
  });
  console.log(`[RBAC] ADMIN GET /inventory/movements: HTTP ${adminKardex.status}`);
  const movements = adminKardex.body?.data || [];
  const meta = adminKardex.body?.meta || {};
  console.log(`[Kardex] Total movimientos registrados en DB: ${meta.total}, Mostrando primeros: ${movements.length}`);
  movements.slice(0, 5).forEach((m, idx) => {
    console.log(`  ${idx + 1}. [${m.timestamp}] Tipo: ${m.movementType} | Producto: ${m.product?.dimensions || m.productId} | Delta: ${m.deltaQuantity} | Ref: ${m.referenceTable}#${m.referenceId} | Ejecutado por: ${m.performedBy?.fullName}`);
  });

  // 4. EP-ADJ-01, EP-ADJ-02, EP-ADJ-03: Ajustes de Inventario
  console.log('\n--- 4. AUDITORÍA EP-ADJ-*: Ajustes de Inventario y RBAC ---');
  // Anonymous
  const anonAdjList = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/inventory-adjustments',
    method: 'GET',
  });
  console.log(`[RBAC] Anónimo GET /inventory-adjustments: HTTP ${anonAdjList.status} (esperado 401: ${anonAdjList.status === 401 ? 'PASS' : 'FAIL'})`);

  // Consulta
  const consultaAdjList = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/inventory-adjustments',
    method: 'GET',
    headers: { Authorization: `Bearer ${consultaAuth.token}` },
  });
  console.log(`[RBAC] CONSULTA GET /inventory-adjustments: HTTP ${consultaAdjList.status} (esperado 403: ${consultaAdjList.status === 403 ? 'PASS' : 'FAIL'})`);

  // Contabilidad
  const contabAdjList = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/inventory-adjustments',
    method: 'GET',
    headers: { Authorization: `Bearer ${contabAuth.token}` },
  });
  console.log(`[RBAC] CONTABILIDAD GET /inventory-adjustments: HTTP ${contabAdjList.status} (esperado 403: ${contabAdjList.status === 403 ? 'PASS' : 'FAIL'})`);

  // Admin
  const adminAdjList = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/inventory-adjustments',
    method: 'GET',
    headers: { Authorization: `Bearer ${adminAuth.token}` },
  });
  console.log(`[RBAC] ADMIN GET /inventory-adjustments: HTTP ${adminAdjList.status} (esperado 200: ${adminAdjList.status === 200 ? 'PASS' : 'FAIL'})`);
  console.log(`[Ajustes] Total ajustes registrados en DB: ${adminAdjList.body?.meta?.total ?? 0}`);

  // Test POST EP-ADJ-01 with Non-Admin
  const contabAdjPost = await request(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/v1/inventory-adjustments',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${contabAuth.token}`,
        'Content-Type': 'application/json',
      },
    },
    {
      productId: inventoryData[0]?.productId,
      adjustmentType: 'INCREMENT',
      quantity: 1,
      reasonType: 'ERROR_INGRESO',
    }
  );
  console.log(`[RBAC] CONTABILIDAD POST /inventory-adjustments: HTTP ${contabAdjPost.status} (esperado 403: ${contabAdjPost.status === 403 ? 'PASS' : 'FAIL'})`);

  // 5. EP-TRC-01: Trazabilidad
  console.log('\n--- 5. AUDITORÍA EP-TRC-01: GET /api/v1/traceability ---');
  const anonTrc = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/traceability?queryType=LOT_PRODUCTION&queryValue=TEST',
    method: 'GET',
  });
  console.log(`[RBAC] Anónimo GET /traceability: HTTP ${anonTrc.status} (esperado 401: ${anonTrc.status === 401 ? 'PASS' : 'FAIL'})`);

  // Test with production lot if available
  const prodRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/daily-productions?limit=1',
    method: 'GET',
    headers: { Authorization: `Bearer ${adminAuth.token}` },
  });
  const firstProdLot = prodRes.body?.data?.[0]?.productionLot;
  console.log(`Lote de producción de prueba encontrado: ${firstProdLot || 'Ninguno'}`);
  if (firstProdLot) {
    const trcRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/v1/traceability?queryType=LOT_PRODUCTION&queryValue=${encodeURIComponent(firstProdLot)}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${adminAuth.token}` },
    });
    console.log(`[Trazabilidad] GET /traceability por LOT_PRODUCTION: HTTP ${trcRes.status}`);
    if (trcRes.status === 200) {
      const trcData = trcRes.body?.data;
      console.log(`  - Nodo raíz: ${trcData?.rootNode?.id} (${trcData?.rootNode?.type})`);
      console.log(`  - Total nodos en DAG: ${trcData?.nodes?.length || 0}`);
      console.log(`  - Total aristas en DAG: ${trcData?.edges?.length || 0}`);
    }
  }

  // 6. PRUEBA DE CONSISTENCIA MATEMÁTICA (Stock = Producción - Despacho + Devolución ± Ajuste)
  console.log('\n--- 6. PRUEBA DE CONSISTENCIA MATEMÁTICA EN DB ---');
  let allConsistent = true;
  for (const p of inventoryData) {
    const expected = p.producedQuantity - p.dispatchedQuantity + p.returnedQuantity + p.adjustmentNetQuantity;
    const match = expected === p.availableStock;
    if (!match) allConsistent = false;
    console.log(`Producto ${p.dimensions}: Producido(${p.producedQuantity}) - Despachado(${p.dispatchedQuantity}) + Devolución(${p.returnedQuantity}) + Ajuste(${p.adjustmentNetQuantity}) = ${expected} | Stock Real: ${p.availableStock} -> ${match ? '✅ CONSISTENTE' : '❌ INCONSISTENTE'}`);
  }
  console.log(`Resultado global de consistencia: ${allConsistent ? '✅ PASS TOTAL' : '❌ DISCREPANCIA DETECTADA'}`);
}

runAudit().catch(console.error);
