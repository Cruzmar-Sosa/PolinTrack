/**
 * POLINTRACK — FASE QA-04B: IDEMPOTENCIA EN CORRECCIONES OPERATIVAS
 *
 * Demostración experimental con PostgreSQL local (polintrack_test) y servicios reales:
 * 1. Reintento secuencial con la misma idempotencyKey: Comprobar que no duplica movimientos ni registros.
 * 2. Solicitudes concurrentes con la misma idempotencyKey (Defecto H-02): Demostrar colisión Prisma P2002.
 * 3. Reutilización ilegítima de idempotencyKey en documentos operativos diferentes (ConflictException).
 */

import * as crypto from 'crypto';
import { PrismaService } from '../../src/database/prisma.service';
import { InventoryLedgerService } from '../../src/modules/inventory/inventory-ledger.service';
import { DailyProductionService } from '../../src/modules/daily-production/daily-production.service';
import {
  assertAuthorizedTestConnectionUrl,
  assertLiveServerIdentity,
} from '../security/assert-local-db';

describe('QA-04B — Idempotencia en Correcciones de Inventario', () => {
  let prisma: PrismaService;
  let ledgerService: InventoryLedgerService;
  let dailyProdService: DailyProductionService;

  const runId = crypto.randomUUID().slice(0, 8);
  const testUserId = crypto.randomUUID();
  const testProductId = crypto.randomUUID();
  const testUser = { id: testUserId, email: `qa04b-${runId}@polintrack.local`, role: 'ADMIN' };

  beforeAll(async () => {
    assertAuthorizedTestConnectionUrl(process.env.DATABASE_URL!, ['polintrack_admin']);

    prisma = new PrismaService();
    await prisma.$connect();
    await assertLiveServerIdentity((sql) => prisma.$queryRawUnsafe(sql), 'polintrack_admin');

    ledgerService = new InventoryLedgerService(prisma);
    dailyProdService = new DailyProductionService(prisma, ledgerService);

    // Sembrar usuario y producto de prueba
    await prisma.user.create({
      data: {
        id: testUserId,
        email: testUser.email,
        fullName: `QA-04B Test Admin ${runId}`,
        passwordHash: '$2b$10$dummyHashForLocalQATestingOnly2026',
        role: 'ADMIN',
        isActive: true,
      },
    });

    await prisma.product.create({
      data: {
        id: testProductId,
        name: `QA04B Polin Test ${runId}`,
        dimensions: '45x48',
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ============================================================================
  // ESCENARIO B.1: Reintento secuencial con la misma clave de idempotencia
  // ============================================================================
  it('1. Reintento secuencial: La repetición con la misma clave no duplica movimientos ni registros', async () => {
    // A. Crear lote de producción inicial de 30 piezas
    const lot = await dailyProdService.create(
      {
        productionDate: '2026-10-10',
        products: [{ productId: testProductId, quantityProduced: 30 }],
      },
      testUserId,
    );

    const idempotencyKey = `QA-IDEMP-SEQ-${runId}-001`;
    const reason = 'Corrección secuencial de prueba para validación de idempotencia';

    // B. Primer envío de la corrección (30 -> 25, delta = -5)
    const firstResult = await dailyProdService.correctQuantity(
      lot.id,
      {
        reason,
        idempotencyKey,
        items: [
          {
            lineId: lot.productionDetails[0].id,
            productId: testProductId,
            quantity: 25,
          },
        ],
      },
      testUserId,
    );

    expect(firstResult.success).toBe(true);

    // C. Segundo envío con EXACTAMENTE la misma clave de idempotencia y payload
    const secondResult = await dailyProdService.correctQuantity(
      lot.id,
      {
        reason,
        idempotencyKey,
        items: [
          {
            lineId: lot.productionDetails[0].id,
            productId: testProductId,
            quantity: 25,
          },
        ],
      },
      testUserId,
    );

    expect(secondResult.success).toBe(true);
    expect((secondResult as any).message).toContain('Operación idempotente');

    // D. Comprobación física en la base de datos real:
    // 1. Debe existir exactamente 1 registro en quantity_corrections con esa clave
    const correctionsCount = await prisma.quantityCorrection.count({
      where: { idempotencyKey },
    });
    expect(correctionsCount).toBe(1);

    // 2. Deben existir exactamente 2 movimientos en inventory_movements:
    //    1 de PRODUCTION (+30) y 1 de CORRECTION (-5). NO DEBE HABER UN TERCER MOVIMIENTO.
    const movements = await prisma.inventoryMovement.findMany({
      where: { productId: testProductId, referenceId: lot.id },
    });

    const correctionMovements = movements.filter((m) => m.movementType === 'CORRECTION');
    console.log(`[EVIDENCIA EXPERIMENTAL B.1]: Movimientos de corrección registrados = ${correctionMovements.length}`);
    expect(correctionMovements.length).toBe(1);
    expect(correctionMovements[0].deltaQuantity).toBe(-5);

    // 3. Saldo resultante = 30 - 5 = 25 piezas
    const currentStock = await ledgerService.getAvailableStock(testProductId);
    expect(currentStock).toBe(25);
  });

  // ============================================================================
  // ESCENARIO B.2: Solicitudes concurrentes con la misma clave (Demuestra H-02)
  // ============================================================================
  it('2. Solicitudes concurrentes con la misma clave: Demuestra carrera y colisión Prisma P2002 (H-02)', async () => {
    // A. Crear nuevo lote de producción con 40 piezas
    const lot = await dailyProdService.create(
      {
        productionDate: '2026-10-11',
        products: [{ productId: testProductId, quantityProduced: 40 }],
      },
      testUserId,
    );

    const idempotencyKey = `QA-IDEMP-RACE-${runId}-002`;
    const reason = 'Corrección concurrente simultánea con la misma clave';

    // B. Lanzar dos solicitudes de corrección simultáneas con la MISMA idempotencyKey
    const request1 = dailyProdService.correctQuantity(
      lot.id,
      {
        reason,
        idempotencyKey,
        items: [
          {
            lineId: lot.productionDetails[0].id,
            productId: testProductId,
            quantity: 35, // delta = -5
          },
        ],
      },
      testUserId,
    );

    const request2 = dailyProdService.correctQuantity(
      lot.id,
      {
        reason,
        idempotencyKey,
        items: [
          {
            lineId: lot.productionDetails[0].id,
            productId: testProductId,
            quantity: 35, // delta = -5
          },
        ],
      },
      testUserId,
    );

    const results = await Promise.allSettled([request1, request2]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    console.log(`[EVIDENCIA EXPERIMENTAL B.2]: Fulfilled: ${fulfilled.length}, Rejected: ${rejected.length}`);

    // Comprobación de la integridad física de la base de datos:
    // INVARIANTE INNEGOCIABLE: Bajo ninguna circunstancia deben existir 2 correcciones en la base de datos
    const persistedCorrections = await prisma.quantityCorrection.findMany({
      where: { idempotencyKey },
    });
    expect(persistedCorrections.length).toBe(1);

    // Comprobación del defecto H-02:
    // Si la pre-consulta está fuera de la transacción, la segunda petición que compite concurrentemente
    // choca contra la restricción única de PostgreSQL (índice único en idempotency_key)
    // arrojando el error Prisma P2002 (Unique constraint failed).
    if (rejected.length > 0) {
      const errorReason = (rejected[0] as PromiseRejectedResult).reason;
      console.log(`[EVIDENCIA EXPERIMENTAL H-02]: Error capturado en petición concurrente = ${errorReason.response?.code || errorReason.code || errorReason.message}`);
      
      // Demostración del defecto H-02:
      // Al estar la verificación de idempotencia fuera de la transacción, la segunda solicitud concurrente
      // no devuelve la respuesta idempotente esperada, sino que falla con NO_CHANGES_DETECTED (400) o P2002 (500)
      const isExpectedDefectError =
        errorReason.response?.code === 'NO_CHANGES_DETECTED' ||
        errorReason.code === 'P2002' ||
        errorReason.message?.includes('No se detectaron cambios') ||
        errorReason.message?.includes('idempotencyKey');

      expect(isExpectedDefectError).toBe(true);
    }
  });

  // ============================================================================
  // ESCENARIO B.3: Reutilización de clave en documentos diferentes (ConflictException)
  // ============================================================================
  it('3. Reutilización indebida de clave en otro documento: Es rechazada con ConflictException', async () => {
    // A. Crear Lote A y aplicar corrección con clave KEY-SHARED
    const lotA = await dailyProdService.create(
      {
        productionDate: '2026-10-12',
        products: [{ productId: testProductId, quantityProduced: 20 }],
      },
      testUserId,
    );

    const sharedKey = `QA-IDEMP-REUSED-${runId}-003`;

    await dailyProdService.correctQuantity(
      lotA.id,
      {
        reason: 'Corrección legítima en lote A con clave compartida',
        idempotencyKey: sharedKey,
        items: [
          {
            lineId: lotA.productionDetails[0].id,
            productId: testProductId,
            quantity: 15,
          },
        ],
      },
      testUserId,
    );

    // B. Crear Lote B
    const lotB = await dailyProdService.create(
      {
        productionDate: '2026-10-13',
        products: [{ productId: testProductId, quantityProduced: 20 }],
      },
      testUserId,
    );

    // C. Intentar aplicar corrección en Lote B reutilizando la clave del Lote A
    const attemptReusedKey = dailyProdService.correctQuantity(
      lotB.id,
      {
        reason: 'Intento de reutilización indebida de clave en lote diferente',
        idempotencyKey: sharedKey,
        items: [
          {
            lineId: lotB.productionDetails[0].id,
            productId: testProductId,
            quantity: 10,
          },
        ],
      },
      testUserId,
    );

    // D. Debe ser rechazado con ConflictException (IDEMPOTENCY_KEY_REUSED)
    await expect(attemptReusedKey).rejects.toThrow();
    await attemptReusedKey.catch((err) => {
      expect(err.response?.code || err.message).toContain('IDEMPOTENCY_KEY_REUSED');
    });
  });
});
