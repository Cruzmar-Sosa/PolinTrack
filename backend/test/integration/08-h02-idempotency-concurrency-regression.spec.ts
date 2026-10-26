/**
 * POLINTRACK — FASE QA-05: REGRESIÓN DE CONCURRENCIA E IDEMPOTENCIA ATÓMICA H-02
 *
 * Verificación con PostgreSQL local real (polintrack_test) y servicios operativos:
 * 1. Solicitudes concurrentes compitiendo con la MISMA idempotencyKey en DailyProduction:
 *    - Ambas peticiones resuelven exitosamente con 200 OK (sin 400 NO_CHANGES_DETECTED ni 500 P2002).
 *    - Una petición ejecuta la corrección y la otra devuelve la respuesta idempotente.
 *    - Se persiste exactamente 1 registro en quantity_corrections y 1 movimiento en inventory_movements.
 * 2. Solicitudes concurrentes compitiendo con la MISMA idempotencyKey en Dispatches:
 *    - Ambas peticiones resuelven exitosamente con 200 OK.
 *    - Se persiste exactamente 1 registro en quantity_corrections y 1 movimiento en inventory_movements.
 * 3. Detección estricta de reutilización cruzada de clave (cross-document):
 *    - Si se intenta reutilizar la misma clave en un documento operativo diferente, se rechaza con ConflictException (409).
 */

import * as crypto from 'crypto';
import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../../src/database/prisma.service';
import { InventoryLedgerService } from '../../src/modules/inventory/inventory-ledger.service';
import { DailyProductionService } from '../../src/modules/daily-production/daily-production.service';
import { DispatchesService } from '../../src/modules/dispatches/dispatches.service';
import {
  assertAuthorizedTestConnectionUrl,
  assertLiveServerIdentity,
} from '../security/assert-local-db';

describe('QA-05 / H-02 — Regresión de Concurrencia e Idempotencia Atómica', () => {
  let prisma: PrismaService;
  let ledgerService: InventoryLedgerService;
  let dailyProdService: DailyProductionService;
  let dispatchesService: DispatchesService;

  const runId = crypto.randomUUID().slice(0, 8);
  const testUserId = crypto.randomUUID();
  const testCenterId = crypto.randomUUID();
  const testProductId = crypto.randomUUID();

  beforeAll(async () => {
    assertAuthorizedTestConnectionUrl(process.env.DATABASE_URL!, ['polintrack_admin']);

    prisma = new PrismaService();
    await prisma.$connect();
    await assertLiveServerIdentity((sql) => prisma.$queryRawUnsafe(sql), 'polintrack_admin');

    ledgerService = new InventoryLedgerService(prisma);
    dailyProdService = new DailyProductionService(prisma, ledgerService);
    dispatchesService = new DispatchesService(prisma, ledgerService);

    // Sembrar usuario operador
    await prisma.user.create({
      data: {
        id: testUserId,
        email: `qa05-h02-${runId}@polintrack.local`,
        fullName: `QA-05 H02 Admin ${runId}`,
        passwordHash: '$2b$10$dummyHashForLocalQATestingOnly2026',
        role: 'ADMIN',
        isActive: true,
      },
    });

    // Sembrar centro cliente
    await prisma.clientCenter.create({
      data: {
        id: testCenterId,
        name: `Centro Cliente QA05-H02 ${runId}`,
        location: 'Guatemala QA',
      },
    });

    // Sembrar producto
    await prisma.product.create({
      data: {
        id: testProductId,
        name: `Polin H02 Test ${runId}`,
        dimensions: '45x48',
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ============================================================================
  // ESCENARIO 1: Concurrencia simultánea con la misma clave en DailyProduction
  // ============================================================================
  it('1. DailyProduction: 2 peticiones concurrentes con la misma idempotencyKey resuelven ambas 200 OK con 1 sola escritura física', async () => {
    // A. Crear orden de producción inicial con 50 piezas
    const lot = await dailyProdService.create(
      {
        productionDate: '2026-10-15',
        products: [{ productId: testProductId, quantityProduced: 50 }],
      },
      testUserId,
    );

    const idempotencyKey = `QA-H02-PRD-RACE-${runId}-001`;
    const reason = 'Corrección concurrente de prueba para verificación H-02 en producción';

    // B. Disparar simultáneamente dos llamadas idénticas con la misma clave
    const p1 = dailyProdService.correctQuantity(
      lot.id,
      {
        reason,
        idempotencyKey,
        items: [
          {
            lineId: lot.productionDetails[0].id,
            productId: testProductId,
            quantity: 45, // delta = -5
          },
        ],
      },
      testUserId,
    );

    const p2 = dailyProdService.correctQuantity(
      lot.id,
      {
        reason,
        idempotencyKey,
        items: [
          {
            lineId: lot.productionDetails[0].id,
            productId: testProductId,
            quantity: 45, // delta = -5
          },
        ],
      },
      testUserId,
    );

    const [res1, res2] = await Promise.all([p1, p2]);

    console.log(`[EVIDENCIA H-02 RESUELTO - PRD]: P1.success=${res1.success}, P2.success=${res2.success}`);

    // Ambas deben haber respondido con éxito
    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);

    // Al menos una debe indicar operación idempotente si entró como duplicada
    const hasIdempotentMessage =
      (res1 as any).message?.includes('Operación idempotente') ||
      (res2 as any).message?.includes('Operación idempotente');
    expect(hasIdempotentMessage).toBe(true);

    // Verificación de integridad física en la base de datos real:
    // 1. Debe existir exactamente 1 registro en quantity_corrections con esa clave
    const corrections = await prisma.quantityCorrection.findMany({
      where: { idempotencyKey },
    });
    expect(corrections.length).toBe(1);

    // 2. Deben existir exactamente 1 movimiento de corrección
    const correctionMovements = await prisma.inventoryMovement.findMany({
      where: {
        productId: testProductId,
        referenceId: lot.id,
        movementType: 'CORRECTION',
      },
    });
    expect(correctionMovements.length).toBe(1);
    expect(correctionMovements[0].deltaQuantity).toBe(-5);

    // 3. El saldo final debe ser exactamente 45 piezas
    const stock = await ledgerService.getAvailableStock(testProductId);
    expect(stock).toBe(45);
  });

  // ============================================================================
  // ESCENARIO 2: Concurrencia simultánea con la misma clave en Dispatches
  // ============================================================================
  it('2. Dispatches: 2 peticiones concurrentes con la misma idempotencyKey resuelven ambas 200 OK con 1 sola escritura física', async () => {
    // A. Crear lote de producción para soportar el despacho
    const lotForDispatch = await dailyProdService.create(
      {
        productionDate: '2026-10-15',
        products: [{ productId: testProductId, quantityProduced: 30 }],
      },
      testUserId,
    );

    // B. Crear un despacho comercial de 10 piezas
    const dispatchRes = await dispatchesService.create(
      {
        dispatchDate: '2026-10-15',
        dispatchTime: '14:00',
        clientCenterId: testCenterId,
        invoiceNumber: `FAC-H02-${runId}-01`,
        details: [
          {
            dailyProductionId: lotForDispatch.id,
            productId: testProductId,
            quantityDispatched: 10,
          },
        ],
      },
      { id: testUserId, email: `qa05-h02-${runId}@polintrack.local`, role: 'ADMIN' },
    );

    const dispatch = dispatchRes.data;

    const idempotencyKey = `QA-H02-DSP-RACE-${runId}-002`;
    const reason = 'Corrección concurrente de prueba para verificación H-02 en despachos';

    // C. Disparar simultáneamente dos llamadas idénticas para corregir despacho de 10 -> 8 piezas (devuelve 2 piezas al stock)
    const p1 = dispatchesService.correctQuantity(
      dispatch.id,
      {
        reason,
        idempotencyKey,
        items: [
          {
            lineId: dispatch.dispatchDetails[0].id,
            productId: testProductId,
            quantity: 8, // delta = -2 despachadas (+2 en inventario)
          },
        ],
      },
      testUserId,
    );

    const p2 = dispatchesService.correctQuantity(
      dispatch.id,
      {
        reason,
        idempotencyKey,
        items: [
          {
            lineId: dispatch.dispatchDetails[0].id,
            productId: testProductId,
            quantity: 8,
          },
        ],
      },
      testUserId,
    );

    const [res1, res2] = await Promise.all([p1, p2]);

    console.log(`[EVIDENCIA H-02 RESUELTO - DSP]: P1.success=${res1.success}, P2.success=${res2.success}`);

    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);

    const hasIdempotentMessage =
      (res1 as any).message?.includes('Operación idempotente') ||
      (res2 as any).message?.includes('Operación idempotente');
    expect(hasIdempotentMessage).toBe(true);

    // Verificación física:
    const corrections = await prisma.quantityCorrection.findMany({
      where: { idempotencyKey },
    });
    expect(corrections.length).toBe(1);

    const correctionMovements = await prisma.inventoryMovement.findMany({
      where: {
        productId: testProductId,
        referenceId: dispatch.id,
        movementType: 'CORRECTION',
      },
    });
    expect(correctionMovements.length).toBe(1);
    expect(correctionMovements[0].deltaQuantity).toBe(2);
  });

  // ============================================================================
  // ESCENARIO 3: Reutilización cruzada de clave en otro documento (ConflictException)
  // ============================================================================
  it('3. Reutilización ilegítima de clave en otro documento operativo es rechazada con ConflictException (409)', async () => {
    // A. Crear un segundo lote y un segundo despacho
    const lot2 = await dailyProdService.create(
      {
        productionDate: '2026-10-15',
        products: [{ productId: testProductId, quantityProduced: 20 }],
      },
      testUserId,
    );

    const dispatchRes2 = await dispatchesService.create(
      {
        dispatchDate: '2026-10-15',
        dispatchTime: '15:00',
        clientCenterId: testCenterId,
        invoiceNumber: `FAC-H02-${runId}-02`,
        details: [
          {
            dailyProductionId: lot2.id,
            productId: testProductId,
            quantityDispatched: 5,
          },
        ],
      },
      { id: testUserId, email: `qa05-h02-${runId}@polintrack.local`, role: 'ADMIN' },
    );

    const dispatch2 = dispatchRes2.data;

    // Intentar reutilizar la clave del escenario 2 (`QA-H02-DSP-RACE-${runId}-002`)
    const reusedKey = `QA-H02-DSP-RACE-${runId}-002`;

    await expect(
      dispatchesService.correctQuantity(
        dispatch2.id,
        {
          reason: 'Intento malicioso o erróneo de reutilización de clave',
          idempotencyKey: reusedKey,
          items: [
            {
              lineId: dispatch2.dispatchDetails[0].id,
              productId: testProductId,
              quantity: 4,
            },
          ],
        },
        testUserId,
      ),
    ).rejects.toThrow(ConflictException);

    console.log('[EVIDENCIA H-02 RESUELTO - REUSE]: Reutilización cruzada rechazada con ConflictException');
  });
});
