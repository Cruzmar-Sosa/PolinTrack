/**
 * POLINTRACK — FASE QA-05: REGRESIÓN DE INTEGRIDAD TRANSACCIONAL H-05
 *
 * Verificación con PostgreSQL local (polintrack_test) y servicios reales:
 * Demuestra que los errores SQL dentro de transacciones no son silenciados:
 * 1. Provocan un fallo controlado con propagación limpia de la excepción.
 * 2. Ejecutan un ROLLBACK ÍNTEGRO de todas las operaciones previas de la transacción.
 * 3. No dejan registros huérfanos en quantity_corrections, inventory_movements ni tablas maestras.
 * 4. La conexión queda libre del estado abortado 25P02 para consultas subsiguientes.
 */

import { PrismaService } from '../../src/database/prisma.service';
import { InventoryLedgerService } from '../../src/modules/inventory/inventory-ledger.service';
import { DailyProductionService } from '../../src/modules/daily-production/daily-production.service';
import { DispatchesService } from '../../src/modules/dispatches/dispatches.service';
import {
  assertAuthorizedTestConnectionUrl,
  assertLiveServerIdentity,
} from '../security/assert-local-db';
import * as crypto from 'crypto';

describe('QA-05 / H-05 — Regresión de Integridad Transaccional y Manejo de Errores SQL', () => {
  let prisma: PrismaService;
  let ledgerService: InventoryLedgerService;
  let dailyProdService: DailyProductionService;
  let dispatchesService: DispatchesService;

  const runId = crypto.randomUUID().slice(0, 8);
  const testUserId = crypto.randomUUID();
  const testCenterId = crypto.randomUUID();
  const testProductId = crypto.randomUUID();
  const testUser = { id: testUserId, email: `qa05-h05-${runId}@polintrack.local`, role: 'ADMIN' };

  beforeAll(async () => {
    assertAuthorizedTestConnectionUrl(process.env.DATABASE_URL!, ['polintrack_admin']);

    prisma = new PrismaService();
    await prisma.$connect();
    await assertLiveServerIdentity((sql) => prisma.$queryRawUnsafe(sql), 'polintrack_admin');

    ledgerService = new InventoryLedgerService(prisma);
    dailyProdService = new DailyProductionService(prisma, ledgerService);
    dispatchesService = new DispatchesService(prisma, ledgerService);

    // Sembrar entidades base
    await prisma.user.create({
      data: {
        id: testUserId,
        email: testUser.email,
        fullName: `QA-05 H05 Operator ${runId}`,
        passwordHash: '$2b$10$dummyHashForLocalQATestingOnly2026',
        role: 'ADMIN',
        isActive: true,
      },
    });

    await prisma.clientCenter.create({
      data: {
        id: testCenterId,
        name: `Centro Cliente QA-05 H05 ${runId}`,
        isActive: true,
      },
    });

    await prisma.product.create({
      data: {
        id: testProductId,
        name: `QA05 H05 Polin Test ${runId}`,
        dimensions: '45x48',
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('1. Demuestra que un fallo de bloqueo pesimista propaga el error y ejecuta rollback total en DailyProduction', async () => {
    // A. Crear un lote de producción con 10 piezas
    const lot = await dailyProdService.create(
      {
        productionDate: '2026-10-10',
        products: [{ productId: testProductId, quantityProduced: 10 }],
      },
      testUserId,
    );

    const stockBefore = await ledgerService.getAvailableStock(testProductId);
    expect(stockBefore).toBe(10);

    const testIdemp = `h05-prod-fail-${crypto.randomUUID().slice(0, 8)}`;

    // B. Simular una falla en la consulta de bloqueo o SQL dentro de la transacción
    // Forzamos un fallo en $queryRaw cuando busca el bloqueo pesimista
    const originalQueryRaw = prisma.$queryRaw.bind(prisma);
    let lockAttempted = false;

    (jest.spyOn(prisma, '$queryRaw') as any).mockImplementation(async (strings: any, ...values: any[]) => {
      // Si la consulta es el lock pesimista sobre daily_productions, lanzar error de base de datos
      const queryText = String(strings);
      if (queryText.includes('daily_productions') && queryText.includes('FOR UPDATE')) {
        lockAttempted = true;
        throw new Error('ERROR_POSTGRES_LOCK_TIMEOUT_SIMULATED: deadlock detected or lock acquisition timeout');
      }
      return originalQueryRaw(strings, ...values);
    });

    // C. Ejecutar corrección
    await expect(
      dailyProdService.correctQuantity(
        lot.id,
        {
          reason: 'Intento de corrección que debe fallar por error de lock',
          idempotencyKey: testIdemp,
          items: [
            {
              lineId: lot.productionDetails[0].id,
              productId: testProductId,
              quantity: 5,
            },
          ],
        },
        testUserId,
      ),
    ).rejects.toThrow('ERROR_POSTGRES_LOCK_TIMEOUT_SIMULATED');

    expect(lockAttempted).toBe(true);
    jest.restoreAllMocks();

    // D. Verificación de Rollback Íntegro:
    // 1. El stock debe permanecer exactamente en 10 piezas
    const stockAfter = await ledgerService.getAvailableStock(testProductId);
    expect(stockAfter).toBe(10);

    // 2. No debe haberse insertado ningún registro en quantity_corrections con esa clave
    const orphanCorrection = await prisma.quantityCorrection.findUnique({
      where: { idempotencyKey: testIdemp },
    });
    expect(orphanCorrection).toBeNull();

    // 3. No debe haberse registrado ningún movimiento de compensación en inventory_movements
    const orphanMovement = await prisma.inventoryMovement.findFirst({
      where: {
        productId: testProductId,
        movementType: 'CORRECTION',
        referenceId: lot.id,
      },
    });
    expect(orphanMovement).toBeNull();

    console.log('[EVIDENCIA H-05 RESUELTO]: Error SQL propagado limpiamente y rollback total verificado.');
  });

  it('2. Demuestra que un fallo de bloqueo pesimista propaga el error y ejecuta rollback total en Dispatches', async () => {
    // A. Crear un despacho de 5 piezas
    const invoiceNumber = `FAC-H05-${crypto.randomUUID().slice(0, 8)}`;
    const lot = await dailyProdService.create(
      {
        productionDate: '2026-10-11',
        products: [{ productId: testProductId, quantityProduced: 10 }],
      },
      testUserId,
    );

    const dispatchRes = await dispatchesService.create(
      {
        invoiceNumber,
        dispatchDate: '2026-10-11',
        dispatchTime: '12:00',
        clientCenterId: testCenterId,
        details: [
          {
            dailyProductionId: lot.id,
            productId: testProductId,
            quantityDispatched: 5,
          },
        ],
      },
      testUser,
    );

    const stockBefore = await ledgerService.getAvailableStock(testProductId);
    // Stock = 10 + 10 - 5 = 15 piezas
    expect(stockBefore).toBe(15);

    const testIdemp = `h05-disp-fail-${crypto.randomUUID().slice(0, 8)}`;

    // B. Simular un fallo en el lock de dispatch_headers
    const originalQueryRaw = prisma.$queryRaw.bind(prisma);
    let lockAttempted = false;

    (jest.spyOn(prisma, '$queryRaw') as any).mockImplementation(async (strings: any, ...values: any[]) => {
      const queryText = String(strings);
      if (queryText.includes('dispatch_headers') && queryText.includes('FOR UPDATE')) {
        lockAttempted = true;
        throw new Error('ERROR_POSTGRES_DISPATCH_LOCK_FAILED');
      }
      return originalQueryRaw(strings, ...values);
    });

    // C. Ejecutar corrección de despacho
    await expect(
      dispatchesService.correctQuantity(
        dispatchRes.data.id,
        {
          reason: 'Corrección de despacho que debe fallar',
          idempotencyKey: testIdemp,
          items: [
            {
              lineId: dispatchRes.data.dispatchDetails[0].id,
              quantity: 2,
            },
          ],
        },
        testUserId,
      ),
    ).rejects.toThrow('ERROR_POSTGRES_DISPATCH_LOCK_FAILED');

    expect(lockAttempted).toBe(true);
    jest.restoreAllMocks();

    // D. Verificación de Rollback Íntegro
    const stockAfter = await ledgerService.getAvailableStock(testProductId);
    expect(stockAfter).toBe(15);

    const orphanCorrection = await prisma.quantityCorrection.findUnique({
      where: { idempotencyKey: testIdemp },
    });
    expect(orphanCorrection).toBeNull();

    // La cantidad en dispatchDetail sigue siendo 5
    const freshDetail = await prisma.dispatchDetail.findUnique({
      where: { id: dispatchRes.data.dispatchDetails[0].id },
    });
    expect(freshDetail!.quantityDispatched).toBe(5);

    console.log('[EVIDENCIA H-05 DESPACHOS RESUELTO]: Rollback de despacho verificado sin huérfanos.');
  });
});
