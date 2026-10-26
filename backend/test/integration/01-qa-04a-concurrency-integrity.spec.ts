/**
 * POLINTRACK — FASE QA-04A: INTEGRIDAD Y CONCURRENCIA
 *
 * Demostración experimental con PostgreSQL local (polintrack_test) y servicios reales:
 * 1. Carrera asimétrica entre createDispatch y correctDailyProduction (H-03 -> Stock negativo).
 * 2. Serialización efectiva en correcciones concurrentes sobre el mismo documento (SELECT FOR UPDATE).
 * 3. Atomicidad y Rollback integral ante excepciones durante transacciones complejas.
 * 4. Demostración del comportamiento de errores SQL dentro de transacciones PostgreSQL (H-05).
 */

import { PrismaClient, MovementType, DispatchStatus, ReasonType } from '@prisma/client';
import { PrismaService } from '../../src/database/prisma.service';
import { InventoryLedgerService } from '../../src/modules/inventory/inventory-ledger.service';
import { DailyProductionService } from '../../src/modules/daily-production/daily-production.service';
import { DispatchesService } from '../../src/modules/dispatches/dispatches.service';
import {
  assertAuthorizedTestConnectionUrl,
  assertLiveServerIdentity,
} from '../security/assert-local-db';

import * as crypto from 'crypto';

describe('QA-04A — Integridad Transaccional y Concurrencia de Inventario', () => {
  let prisma: PrismaService;
  let ledgerService: InventoryLedgerService;
  let dailyProdService: DailyProductionService;
  let dispatchesService: DispatchesService;

  // Identificadores aislados generados dinámicamente para cada corrida
  const runId = crypto.randomUUID().slice(0, 8);
  const testUserId = crypto.randomUUID();
  const testCenterId = crypto.randomUUID();
  const testProductId = crypto.randomUUID();
  const testUser = { id: testUserId, email: `qa04a-${runId}@polintrack.local`, role: 'ADMIN' };

  beforeAll(async () => {
    // 1. Verificación estricta de aislamiento de seguridad
    assertAuthorizedTestConnectionUrl(process.env.DATABASE_URL!, ['polintrack_admin']);

    prisma = new PrismaService();
    await prisma.$connect();
    await assertLiveServerIdentity((sql) => prisma.$queryRawUnsafe(sql), 'polintrack_admin');

    ledgerService = new InventoryLedgerService(prisma);
    dailyProdService = new DailyProductionService(prisma, ledgerService);
    dispatchesService = new DispatchesService(prisma, ledgerService);

    // 2. Sembrar datos aislados para la corrida
    await prisma.user.create({
      data: {
        id: testUserId,
        email: testUser.email,
        fullName: `QA-04A Test Admin ${runId}`,
        passwordHash: '$2b$10$dummyHashForLocalQATestingOnly2026',
        role: 'ADMIN',
        isActive: true,
      },
    });

    await prisma.clientCenter.create({
      data: {
        id: testCenterId,
        name: `QA-04A Centro Test ${runId}`,
        isActive: true,
      },
    });

    await prisma.product.create({
      data: {
        id: testProductId,
        name: `QA04A Polin Test ${runId}`,
        dimensions: '45x48',
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ============================================================================
  // ESCENARIO 1: Demostración experimental del defecto H-03 (Stock Negativo)
  // ============================================================================
  it('1. Demuestra experimentalmente el defecto H-03: Asimetría de bloqueos conduce a saldo negativo', async () => {
    // A. Estado inicial: Dos lotes de producción (lotA = 5 piezas, lotB = 5 piezas, total = 10 piezas)
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

    // Verificar stock inicial en el ledger = exactamente 10 piezas
    const stockBaseline = await ledgerService.getAvailableStock(testProductId);
    expect(stockBaseline).toBe(10);

    // B. Coordinación de concurrencia:
    // Con la corrección H-03 implementada, T1 adquiere el bloqueo pesimista en products.
    // Retardamos T1 200ms antes de registrar el movimiento para simular contención en red.
    // T2 intentará corregir lotA reduciendo 5 piezas, pero PostgreSQL la bloqueará.
    let t1InCriticalSection = false;
    const originalRecordMovement = ledgerService.recordMovement.bind(ledgerService);

    jest.spyOn(ledgerService, 'recordMovement').mockImplementation(async (input, tx) => {
      if (input.productId === testProductId && !t1InCriticalSection) {
        t1InCriticalSection = true;
        await new Promise((r) => setTimeout(r, 200));
      }
      return originalRecordMovement(input, tx);
    });

    // C. Lanzar Operación 1: Despacho por 10 piezas sobre lotB (bloquea el producto 'products FOR UPDATE')
    const testInvoice = `FAC-QA04A-RACE-${crypto.randomUUID().slice(0, 8)}`;
    const testIdemp = `corr-race-h03-${crypto.randomUUID().slice(0, 8)}`;

    const op1DispatchPromise = dispatchesService.create(
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

    // Esperar 40ms para que T1 ingrese a su transacción y adquiera el lock en products
    await new Promise((r) => setTimeout(r, 40));

    // D. Lanzar Operación 2: Corrección de producción en lotA reduciendo 5 piezas (5 -> 0)
    // T2 solicita lock en products y queda encolada en PostgreSQL esperando a T1
    const op2CorrectionPromise = dailyProdService.correctQuantity(
      lotA.id,
      {
        reason: 'Corrección por reconteo físico en patio verificado por auditoría',
        idempotencyKey: testIdemp,
        items: [
          {
            lineId: lotA.productionDetails[0].id,
            productId: testProductId,
            quantity: 0, // Reducción neta de -5 piezas
          },
        ],
      },
      testUserId,
    );

    // Esperar a que ambas transacciones concluyan
    const [op1Result, op2Result] = await Promise.allSettled([
      op1DispatchPromise,
      op2CorrectionPromise,
    ]);

    // Restaurar el espía
    jest.restoreAllMocks();

    expect(op1Result.status).toBe('fulfilled');
    expect(op2Result.status).toBe('rejected');

    if (op2Result.status === 'rejected') {
      expect(op2Result.reason).toBeInstanceOf(Error);
      console.log(`[EVIDENCIA H-03 RESUELTO]: Operación 2 rechazada coherentemente tras commit de T1`);
    }

    // E. Verificación en la base de datos real: Saldo físico NUNCA negativo
    const rawStockAggregate = await prisma.inventoryMovement.aggregate({
      where: { productId: testProductId },
      _sum: { deltaQuantity: true },
    });

    const finalCalculatedStock = rawStockAggregate._sum.deltaQuantity;

    console.log(`[EVIDENCIA H-03 RESUELTO]: Saldo resultante en PostgreSQL = ${finalCalculatedStock}`);
    expect(finalCalculatedStock).toBe(0);
    expect(finalCalculatedStock).toBeGreaterThanOrEqual(0);
  });

  // ============================================================================
  // ESCENARIO 2: Serialización efectiva en bloqueos sobre el mismo documento
  // ============================================================================
  it('2. Confirma que dos transacciones sobre el MISMO documento se serializan correctamente', async () => {
    // Crear lote de producción específico para esta prueba
    const prodLot = await dailyProdService.create(
      {
        productionDate: '2026-10-12',
        products: [{ productId: testProductId, quantityProduced: 50 }],
      },
      testUserId,
    );

    const lineId = prodLot.productionDetails[0].id;
    const executionOrder: string[] = [];

    let t1InCriticalSectionResolve: () => void;
    const t1InCriticalSection = new Promise<void>((resolve) => {
      t1InCriticalSectionResolve = resolve;
    });

    let allowT1CommitResolve: () => void;
    const allowT1Commit = new Promise<void>((resolve) => {
      allowT1CommitResolve = resolve;
    });

    // T1: Primera corrección que retiene el lock pesimista sobre daily_productions
    const t1Promise = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM daily_productions WHERE id = ${prodLot.id}::uuid FOR UPDATE`;
      executionOrder.push('T1_ACQUIRED_LOCK');
      t1InCriticalSectionResolve();

      // Mantenemos la transacción abierta simulando procesamiento
      await allowT1Commit;

      executionOrder.push('T1_COMMITTED');
      return 'T1_DONE';
    });

    // Esperar a que T1 tenga el bloqueo activo sobre la fila
    await t1InCriticalSection;

    // T2: Segunda transacción que intenta adquirir el mismo bloqueo sobre daily_productions
    const t2Promise = prisma.$transaction(async (tx) => {
      executionOrder.push('T2_WAITING_FOR_LOCK');
      await tx.$queryRaw`SELECT id FROM daily_productions WHERE id = ${prodLot.id}::uuid FOR UPDATE`;
      executionOrder.push('T2_ACQUIRED_LOCK');
      return 'T2_DONE';
    });

    // Dar una pequeña ventana para que T2 intente adquirir el lock y quede bloqueado en PostgreSQL
    await new Promise((r) => setTimeout(r, 100));

    // Confirmar que T2 no ha adquirido el bloqueo mientras T1 lo retiene
    expect(executionOrder).toEqual(['T1_ACQUIRED_LOCK', 'T2_WAITING_FOR_LOCK']);

    // Liberar T1 para que complete su commit
    allowT1CommitResolve!();
    await Promise.all([t1Promise, t2Promise]);

    // Confirmar que T2 solo adquirió el lock DESPUÉS de que T1 liberó el recurso
    expect(executionOrder).toEqual([
      'T1_ACQUIRED_LOCK',
      'T2_WAITING_FOR_LOCK',
      'T1_COMMITTED',
      'T2_ACQUIRED_LOCK',
    ]);
  });

  // ============================================================================
  // ESCENARIO 3: Atomicidad y Rollback Integral ante excepciones intermedias
  // ============================================================================
  it('3. Confirma que un error intencional a mitad de transacción produce rollback estricto', async () => {
    const testInvoice = `FAC-QA04A-ROLLBACK-${crypto.randomUUID().slice(0, 8)}`;

    // Crear un lote previo para vincular
    const rollbackLot = await dailyProdService.create(
      {
        productionDate: '2026-10-13',
        products: [{ productId: testProductId, quantityProduced: 20 }],
      },
      testUserId,
    );

    // Intentamos ejecutar un despacho donde provocamos un error después de crear la cabecera
    const failedAttempt = prisma.$transaction(async (tx) => {
      // Paso 1: Crear cabecera
      const header = await tx.dispatchHeader.create({
        data: {
          invoiceNumber: testInvoice,
          dispatchDate: new Date('2026-10-13T00:00:00.000Z'),
          dispatchTime: new Date('1970-01-01T12:00:00.000Z'),
          clientCenterId: testCenterId,
          status: DispatchStatus.COMPLETED,
          createdById: testUserId,
        },
      });

      // Paso 2: Crear detalle
      await tx.dispatchDetail.create({
        data: {
          dispatchHeaderId: header.id,
          dailyProductionId: rollbackLot.id,
          productId: testProductId,
          quantityDispatched: 5,
          dimensions: '45x48',
        },
      });

      // Paso 3: Provocar un fallo intencional de integridad
      throw new Error('SIMULATED_TRANSACTION_FAILURE_FOR_QA_TEST');
    });

    await expect(failedAttempt).rejects.toThrow('SIMULATED_TRANSACTION_FAILURE_FOR_QA_TEST');

    // Verificar en la base de datos real que NINGÚN registro quedó huérfano
    const persistedHeader = await prisma.dispatchHeader.findUnique({
      where: { invoiceNumber: testInvoice },
    });
    expect(persistedHeader).toBeNull();

    const orphanedDetails = await prisma.dispatchDetail.findMany({
      where: { dimensions: '45x48', quantityDispatched: 5 },
    });
    const testOrphans = orphanedDetails.filter((d) => d.productId === testProductId);
    expect(testOrphans.length).toBe(0);
  });

  // ============================================================================
  // ESCENARIO 4: Demostración experimental del defecto H-05 (Supresión de SQL)
  // ============================================================================
  it('4. Demuestra experimentalmente el defecto H-05: El try/catch silencia excepciones SQL reales', async () => {
    // Demostración del comportamiento de PostgreSQL:
    // Si se produce un error en una transacción y se silencia con try/catch en TypeScript,
    // PostgreSQL pasa al estado 25P02 y rechaza cualquier consulta posterior.
    const testTxAbort = prisma.$transaction(async (tx) => {
      // Simular el patrón exacto en daily-production.service.ts:722-728
      try {
        // Ejecutamos una sentencia SQL errónea a propósito (tabla inexistente o error sintáctico)
        await tx.$queryRaw`SELECT non_existent_column FROM non_existent_table WHERE id = 1`;
      } catch (e) {
        // Este catch silencia el error tal como lo hace el código actual
      }

      // Intentamos continuar con una consulta legítima de Prisma
      // Si el error fue silenciado, PostgreSQL arroja el error 25P02 (current transaction is aborted)
      return await tx.product.findUnique({
        where: { id: testProductId },
      });
    });

    // En PostgreSQL real, la transacción se aborta forzosamente.
    // Demuestra que silenciar el error en TypeScript NO permite que la transacción continúe.
    await expect(testTxAbort).rejects.toThrow();
  });
});
