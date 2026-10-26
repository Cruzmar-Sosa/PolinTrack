/**
 * POLINTRACK — FASE QA-05: REGRESIÓN DE INTEGRIDAD Y CONCURRENCIA H-03
 *
 * Verificación con PostgreSQL local (polintrack_test) y servicios reales:
 * Demuestra que la carrera de inventario H-03 está 100% corregida:
 * 1. Con stock = 10 piezas, T1 inicia despacho de 10 piezas y adquiere el bloqueo FOR UPDATE en products.
 * 2. T2 (corrección de producción por -5 piezas) intenta ejecutarse concurrentemente.
 *    PostgreSQL encola a T2 esperando la liberación del bloqueo en products.
 * 3. Cuando T1 hace commit (stock pasa a 0), T2 se desbloquea, lee el saldo fresco (0 piezas)
 *    y rechaza estrictamente con INSUFFICIENT_STOCK (400).
 * 4. El saldo en base de datos queda estrictamente en 0 (NUNCA NEGATIVO, cumpliendo RN-002).
 * 5. Prueba de orden inverso: Corrección adquiere lock primero (-5 piezas -> saldo = 5),
 *    despacho se desbloquea, detecta stock insuficiente (10 solicitadas > 5 disponibles) y rechaza.
 *    El saldo queda estrictamente en 5 piezas.
 */

import { PrismaService } from '../../src/database/prisma.service';
import { InventoryLedgerService } from '../../src/modules/inventory/inventory-ledger.service';
import { DailyProductionService } from '../../src/modules/daily-production/daily-production.service';
import { DispatchesService } from '../../src/modules/dispatches/dispatches.service';
import {
  assertAuthorizedTestConnectionUrl,
  assertLiveServerIdentity,
} from '../security/assert-local-db';
import { BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';

describe('QA-05 / H-03 — Regresión de Concurrencia y Prevención de Saldo Negativo', () => {
  let prisma: PrismaService;
  let ledgerService: InventoryLedgerService;
  let dailyProdService: DailyProductionService;
  let dispatchesService: DispatchesService;

  const runId = crypto.randomUUID().slice(0, 8);
  const testUserId = crypto.randomUUID();
  const testCenterId = crypto.randomUUID();
  const testProductId = crypto.randomUUID();
  const testUser = { id: testUserId, email: `qa05-h03-${runId}@polintrack.local`, role: 'ADMIN' };

  beforeAll(async () => {
    assertAuthorizedTestConnectionUrl(process.env.DATABASE_URL!, ['polintrack_admin']);

    prisma = new PrismaService();
    await prisma.$connect();
    await assertLiveServerIdentity((sql) => prisma.$queryRawUnsafe(sql), 'polintrack_admin');

    ledgerService = new InventoryLedgerService(prisma);
    dailyProdService = new DailyProductionService(prisma, ledgerService);
    dispatchesService = new DispatchesService(prisma, ledgerService);

    // Sembrar entidades base aisladas
    await prisma.user.create({
      data: {
        id: testUserId,
        email: testUser.email,
        fullName: `QA-05 Test Operator ${runId}`,
        passwordHash: '$2b$10$dummyHashForLocalQATestingOnly2026',
        role: 'ADMIN',
        isActive: true,
      },
    });

    await prisma.clientCenter.create({
      data: {
        id: testCenterId,
        name: `Centro Cliente QA-05 ${runId}`,
        isActive: true,
      },
    });

    await prisma.product.create({
      data: {
        id: testProductId,
        name: `QA05 Polin Concurrente ${runId}`,
        dimensions: '45x48',
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('1. Demuestra que el bloqueo simétrico en products serializa T1 y T2, impidiendo saldo negativo', async () => {
    // A. Preparar stock inicial = 10 piezas (2 lotes de 5 piezas cada uno)
    const lotA = await dailyProdService.create(
      {
        productionDate: '2026-10-10',
        products: [{ productId: testProductId, quantityProduced: 5 }],
      },
      testUserId,
    );

    const lotB = await dailyProdService.create(
      {
        productionDate: '2026-10-11',
        products: [{ productId: testProductId, quantityProduced: 5 }],
      },
      testUserId,
    );

    const stockBaseline = await ledgerService.getAvailableStock(testProductId);
    expect(stockBaseline).toBe(10);

    // B. Coordinar determinísticamente la concurrencia:
    // T1 (despacho) adquiere lock en products. Se pausa 200ms antes de insertar el movimiento.
    // T2 (corrección de lotA por -5 piezas) arranca inmediatamente.
    // T2 debe quedar encolada en PostgreSQL esperando a T1.
    const originalRecordMovement = ledgerService.recordMovement.bind(ledgerService);
    let t1InCriticalSection = false;

    jest.spyOn(ledgerService, 'recordMovement').mockImplementation(async (input, tx) => {
      if (input.productId === testProductId && !t1InCriticalSection) {
        t1InCriticalSection = true;
        // Pausar deliberadamente T1 durante 250ms mientras retiene el lock en PostgreSQL
        await new Promise((r) => setTimeout(r, 250));
      }
      return originalRecordMovement(input, tx);
    });

    const testInvoice = `FAC-QA05-H03-${crypto.randomUUID().slice(0, 8)}`;
    const testIdemp = `corr-qa05-h03-${crypto.randomUUID().slice(0, 8)}`;

    // Lanzar T1: Despacho por 10 piezas
    const t1DispatchPromise = dispatchesService.create(
      {
        invoiceNumber: testInvoice,
        dispatchDate: '2026-10-11',
        dispatchTime: '10:00',
        clientCenterId: testCenterId,
        details: [
          {
            dailyProductionId: lotB.id,
            productId: testProductId,
            quantityDispatched: 10,
          },
        ],
      },
      testUser,
    );

    // Esperar 50ms para garantizar que T1 ya ingresó a su transacción y adquirió el lock en products
    await new Promise((r) => setTimeout(r, 50));

    // Lanzar T2: Corrección de lotA reduciendo 5 piezas (5 -> 0)
    // Con la corrección H-03, correctQuantity solicita lock FOR UPDATE en products y se encola en PostgreSQL
    const t2CorrectionPromise = dailyProdService.correctQuantity(
      lotA.id,
      {
        reason: 'Corrección por conteo físico en patio QA-05',
        idempotencyKey: testIdemp,
        items: [
          {
            lineId: lotA.productionDetails[0].id,
            productId: testProductId,
            quantity: 0,
          },
        ],
      },
      testUserId,
    );

    // Evaluar resultados de ambas promesas concurrentes
    const [t1Result, t2Result] = await Promise.allSettled([
      t1DispatchPromise,
      t2CorrectionPromise,
    ]);

    // Restaurar mock
    jest.restoreAllMocks();

    // Verificación de los resultados:
    // T1 debió completarse exitosamente (despachó 10 piezas)
    expect(t1Result.status).toBe('fulfilled');

    // T2 debió ser rechazada por stock insuficiente al despertar tras el commit de T1 (saldo fresco = 0 < 5)
    expect(t2Result.status).toBe('rejected');
    if (t2Result.status === 'rejected') {
      expect(t2Result.reason).toBeInstanceOf(BadRequestException);
      expect(t2Result.reason.message).toMatch(/Stock insuficiente en almacén para (aplicar la reducción|descontar)/i);
      console.log(
        `[EVIDENCIA H-03 RESUELTO]: T2 fue rechazada coherentemente tras serialización: '${t2Result.reason.message}'`,
      );
    }

    // Verificación final estricta de la invariante RN-002: Stock en BD = exactamente 0 (NUNCA NEGATIVO)
    const finalStock = await ledgerService.getAvailableStock(testProductId);
    expect(finalStock).toBe(0);
    expect(finalStock).toBeGreaterThanOrEqual(0);

    console.log(`[EVIDENCIA H-03 RESUELTO]: Saldo final persistido en PostgreSQL = ${finalStock} (RN-002 preservado)`);
  });

  it('2. Demuestra que la serialización también protege el orden inverso (corrección primero, despacho después)', async () => {
    // Crear lote nuevo con 10 piezas
    const lotC = await dailyProdService.create(
      {
        productionDate: '2026-10-12',
        products: [{ productId: testProductId, quantityProduced: 10 }],
      },
      testUserId,
    );

    // Stock actual = 0 + 10 = 10 piezas
    const stockCurrent = await ledgerService.getAvailableStock(testProductId);
    expect(stockCurrent).toBe(10);

    // T1: Corrección de lotC reduciendo 6 piezas (10 -> 4)
    // Pausamos T1 200ms para que retenga el lock en products
    let t1CorrectionInCritical = false;
    const originalRecordMovement = ledgerService.recordMovement.bind(ledgerService);

    jest.spyOn(ledgerService, 'recordMovement').mockImplementation(async (input, tx) => {
      if (input.productId === testProductId && !t1CorrectionInCritical) {
        t1CorrectionInCritical = true;
        await new Promise((r) => setTimeout(r, 200));
      }
      return originalRecordMovement(input, tx);
    });

    const testIdemp2 = `corr-qa05-h03-inv-${crypto.randomUUID().slice(0, 8)}`;
    const testInvoice2 = `FAC-QA05-INV-${crypto.randomUUID().slice(0, 8)}`;

    const t1CorrectionPromise = dailyProdService.correctQuantity(
      lotC.id,
      {
        reason: 'Reducción de piezas en patio autorizada por supervisor',
        idempotencyKey: testIdemp2,
        items: [
          {
            lineId: lotC.productionDetails[0].id,
            productId: testProductId,
            quantity: 4, // Reduce 6 piezas
          },
        ],
      },
      testUserId,
    );

    await new Promise((r) => setTimeout(r, 50));

    // T2: Despacho de 8 piezas (solicita más de las 4 que van a quedar)
    const t2DispatchPromise = dispatchesService.create(
      {
        invoiceNumber: testInvoice2,
        dispatchDate: '2026-10-12',
        dispatchTime: '11:00',
        clientCenterId: testCenterId,
        details: [
          {
            dailyProductionId: lotC.id,
            productId: testProductId,
            quantityDispatched: 8,
          },
        ],
      },
      testUser,
    );

    const [res1, res2] = await Promise.allSettled([
      t1CorrectionPromise,
      t2DispatchPromise,
    ]);

    jest.restoreAllMocks();

    expect(res1.status).toBe('fulfilled');
    expect(res2.status).toBe('rejected');
    if (res2.status === 'rejected') {
      expect(res2.reason).toBeInstanceOf(BadRequestException);
      expect(res2.reason.message).toMatch(/Stock insuficiente para despachar/i);
    }

    // Saldo final = exactamente 4 piezas (10 - 6 = 4)
    const finalStock = await ledgerService.getAvailableStock(testProductId);
    expect(finalStock).toBe(4);
    expect(finalStock).toBeGreaterThanOrEqual(0);

    console.log(`[EVIDENCIA H-03 ORDEN INVERSO]: Saldo final persistido = ${finalStock} piezas (RN-002 preservado)`);
  });
});
