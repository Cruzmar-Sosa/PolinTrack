/**
 * POLINTRACK — TSK-25 DIMENSIÓN 2: CONCURRENCIA Y PREVENCIÓN DE SOBREVENTA (RACE CONDITIONS)
 * Stress test verifying pessimistic row-level locking (SELECT ... FOR UPDATE) and RN-002
 */

const API_BASE = 'http://localhost:3000/api/v1';

async function request(endpoint, options = {}, token = null) {
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    json = { raw: text };
  }

  return { status: res.status, ok: res.ok, data: json };
}

async function runConcurrencyTest() {
  console.log('================================================================================');
  console.log('⚡ INICIANDO PRUEBA DE CONCURRENCIA Y CARRERA PESIMISTA (RN-002)');
  console.log('================================================================================\n');

  // Step 0: Auth
  const loginRes = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'admin@polintrack.com',
      password: 'PolinTrack2026!Secure',
    }),
  });

  const token = loginRes.data?.data?.accessToken || loginRes.data?.data?.session?.access_token;
  if (!token) throw new Error('Fallo al autenticar en prueba de concurrencia');

  // Step 1: Pick a product and client center
  const [productsRes, centersRes] = await Promise.all([
    request('/catalog/products', {}, token),
    request('/catalog/client-centers', {}, token),
  ]);

  // Use Polín 48x64 or Polín 45x47
  const product = productsRes.data.data.find(p => p.dimensions === '48x64') || productsRes.data.data[1];
  const clientCenter = centersRes.data.data[0];

  console.log(`- Producto objetivo: ${product.name} (${product.dimensions}, ID: ${product.id})`);
  console.log(`- Planta Cliente: ${clientCenter.name} (ID: ${clientCenter.id})\n`);

  // Step 2: Calibrate stock to EXACTLY 50 pieces
  console.log('--- CALIBRANDO STOCK BASE A EXACTAMENTE 50 PIEZAS ---');
  const invRes1 = await request('/inventory', {}, token);
  const currentItem = invRes1.data.data.find(i => i.productId === product.id);
  const currentStock = currentItem ? currentItem.availableStock : 0;
  console.log(`Stock actual antes de calibración: ${currentStock} pcs`);

  if (currentStock < 50) {
    const diff = 50 - currentStock;
    console.log(`Ajustando stock: INCREMENT +${diff} pcs`);
    await request('/inventory-adjustments', {
      method: 'POST',
      body: JSON.stringify({
        productId: product.id,
        adjustmentType: 'INCREMENT',
        quantity: diff,
        reasonType: 'CUSTOM',
        reasonNotes: 'Calibración controlada de stock a 50 pcs para prueba de concurrencia',
      }),
    }, token);
  } else if (currentStock > 50) {
    const diff = currentStock - 50;
    console.log(`Ajustando stock: DECREMENT -${diff} pcs`);
    await request('/inventory-adjustments', {
      method: 'POST',
      body: JSON.stringify({
        productId: product.id,
        adjustmentType: 'DECREMENT',
        quantity: diff,
        reasonType: 'CUSTOM',
        reasonNotes: 'Calibración controlada de stock a 50 pcs para prueba de concurrencia',
      }),
    }, token);
  }

  // Verify calibrated stock is exactly 50
  const invRes2 = await request('/inventory', {}, token);
  const calibratedItem = invRes2.data.data.find(i => i.productId === product.id);
  console.log(`✅ Stock disponible verificado: EXACTAMENTE ${calibratedItem.availableStock} piezas en patio.\n`);

  if (calibratedItem.availableStock !== 50) {
    throw new Error(`Fallo de calibración: se esperaban 50 pcs, se obtuvieron ${calibratedItem.availableStock}`);
  }

  // Step 3: Ensure there is a daily production lot associated with this product
  console.log('--- VERIFICANDO LOTE DE PRODUCCIÓN DE ORIGEN ---');
  const prodLotsRes = await request(`/daily-productions?productId=${product.id}&limit=5`, {}, token);
  let productionId;

  if (prodLotsRes.data?.data && prodLotsRes.data.data.length > 0) {
    productionId = prodLotsRes.data.data[0].id;
    console.log(`Lote de producción existente localizado: ${prodLotsRes.data.data[0].productionLot} (${productionId})`);
  } else {
    // Create a lot if none exists
    const dateStr = new Date().toISOString().split('T')[0];
    const newProd = await request('/daily-productions', {
      method: 'POST',
      body: JSON.stringify({
        productionDate: dateStr,
        products: [{ productId: product.id, quantityProduced: 50 }],
      }),
    }, token);
    productionId = newProd.data.data.id;
    console.log(`Nuevo lote de producción creado: ${newProd.data.data.productionLot}`);
  }

  // Step 4: Launch 5 SIMULTANEOUS CONCURRENT DISPATCHES of 20 pieces each
  // Available: 50 pcs
  // Demanded: 5 x 20 = 100 pcs
  // Expected: EXACTLY 2 approved (40 pcs deducted) and EXACTLY 3 rejected (HTTP 400 Insufficient Stock)
  // Final expected stock: 50 - 40 = 10 pcs
  console.log('\n--- LANZANDO 5 PETICIONES DE DESPACHO SIMULTÁNEAS CONCURRENTES ---');
  console.log('Demanda: 5 peticiones x 20 piezas = 100 piezas.');
  console.log('Disponible en patio: 50 piezas.');
  console.log('Resultado obligatorio: Exactamente 2 aprobadas (HTTP 201), exactamente 3 rechazadas (HTTP 400).\n');

  const batchId = Date.now().toString().slice(-5);
  const dateStr = new Date().toISOString().split('T')[0];
  const timeStr = new Date().toTimeString().split(' ')[0].substring(0, 8);

  const dispatchRequests = [1, 2, 3, 4, 5].map(index => {
    const invoiceNum = `CONCUR-${batchId}-${index}`;
    return request('/dispatches', {
      method: 'POST',
      body: JSON.stringify({
        invoiceNumber: invoiceNum,
        clientCenterId: clientCenter.id,
        dispatchDate: dateStr,
        dispatchTime: timeStr,
        vehicleInfo: `M-CONCUR-${index}`,
        driverName: `Chofer Concurrente ${index}`,
        observations: `Prueba de estrés de concurrencia ${index}`,
        details: [
          {
            productId: product.id,
            dailyProductionId: productionId,
            quantityDispatched: 20,
            dimensions: product.dimensions,
          },
        ],
      }),
    }, token).then(res => ({
      index,
      invoiceNumber: invoiceNum,
      status: res.status,
      ok: res.ok,
      errorCode: res.data?.error?.code,
      errorMessage: res.data?.error?.message,
    }));
  });

  const results = await Promise.all(dispatchRequests);

  console.log('Resultados de las 5 peticiones concurrentes:');
  results.forEach(r => {
    if (r.status === 201) {
      console.log(`   [Petición #${r.index} - ${r.invoiceNumber}]: ✅ APROBADA (HTTP 201 Created) — 20 pcs despachadas`);
    } else {
      console.log(`   [Petición #${r.index} - ${r.invoiceNumber}]: 🛑 RECHAZADA LIMPIAMENTE (HTTP ${r.status} ${r.errorCode || ''}) — ${r.errorMessage}`);
    }
  });

  const approvedCount = results.filter(r => r.status === 201).length;
  const rejectedCount = results.filter(r => r.status === 400).length;

  console.log(`\nResumen de Concurrencia:`);
  console.log(`- Peticiones Aprobadas: ${approvedCount} (Esperado: 2)`);
  console.log(`- Peticiones Rechazadas por RN-002: ${rejectedCount} (Esperado: 3)`);

  // Step 5: Check Final Stock Balance in Ledger
  console.log('\n--- VERIFICACIÓN DEL BALANCE RESULTANTE EN EL KARDEX ---');
  const invRes3 = await request('/inventory', {}, token);
  const finalItem = invRes3.data.data.find(i => i.productId === product.id);
  const finalStock = finalItem ? finalItem.availableStock : -1;

  console.log(`Stock inicial calibrado: 50 pcs`);
  console.log(`Total piezas aprobadas para salida: ${approvedCount * 20} pcs`);
  console.log(`Stock final disponible en patio: ${finalStock} pcs (Esperado: 10 pcs)`);

  // Validation assertions
  if (approvedCount !== 2) {
    throw new Error(`FALLO DE CONCURRENCIA: Se aprobaron ${approvedCount} peticiones, se esperaban exactamente 2.`);
  }

  if (rejectedCount !== 3) {
    throw new Error(`FALLO DE CONCURRENCIA: Se rechazaron ${rejectedCount} peticiones, se esperaban exactamente 3.`);
  }

  if (finalStock !== 10) {
    throw new Error(`FALLO DE SALDO: El saldo final es ${finalStock}, se esperaba exactamente 10.`);
  }

  if (finalStock < 0) {
    throw new Error(`FALLO CRÍTICO DE INTEGRIDAD: ¡El saldo en inventario quedó negativo (${finalStock})!`);
  }

  console.log('\n================================================================================');
  console.log('🛡️ PRUEBA DE CONCURRENCIA SUPERADA: SELECT ... FOR UPDATE BLOQUEÓ SOBREVENTA');
  console.log('   - 0 condiciones de carrera');
  console.log('   - 0 saldos negativos');
  console.log('   - Control atómico RN-002 100% verificado');
  console.log('================================================================================\n');

  return {
    success: true,
    approvedCount,
    rejectedCount,
    initialStock: 50,
    finalStock,
  };
}

runConcurrencyTest()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ ERROR FATAL EN PRUEBA DE CONCURRENCIA:', err);
    process.exit(1);
  });
