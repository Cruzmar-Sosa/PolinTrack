/**
 * POLINTRACK — FASE QA-04D: REGRESIÓN E INTEGRIDAD DEL KARDEX
 *
 * Verificación con PostgreSQL local (polintrack_test) y servicios reales:
 * 1. Ciclo de vida operacional completo:
 *    Producción (+100) -> Despacho (-40) -> Retorno Reproceso (+10) -> Retorno Desecho (0, RN-010-B) ->
 *    Ajuste Almacén (-15) -> Corrección Despacho (+5 compensatorio) = Saldo exacto 60.
 * 2. Determinismo del Kardex y balance consolidado (getStockBalance vs getKardexMovements).
 * 3. Invariante RN-001 (Inmutabilidad histórica de cabeceras/detalles y trazabilidad).
 * 4. Invariante RN-013 (Límites de devoluciones y prevención de reducción por debajo de devoluciones).
 * 5. Invariante RN-002 (Stock no negativo: rechazo estricto ante sobregiros en despachos y ajustes).
 * 6. Inmutabilidad de auditoría en PostgreSQL: validación del trigger append-only en quantity_corrections.
 */

import {
  MovementType,
  ReturnDestination,
  AdjustmentType,
  ReasonType,
  DispatchStatus,
} from '@prisma/client';
import { PrismaService } from '../../src/database/prisma.service';
import { InventoryLedgerService } from '../../src/modules/inventory/inventory-ledger.service';
import { DailyProductionService } from '../../src/modules/daily-production/daily-production.service';
import { DispatchesService } from '../../src/modules/dispatches/dispatches.service';
import { ReturnsService } from '../../src/modules/returns/returns.service';
import { AdjustmentsService } from '../../src/modules/inventory/adjustments.service';
import {
  assertAuthorizedTestConnectionUrl,
  assertLiveServerIdentity,
} from '../security/assert-local-db';

import * as crypto from 'crypto';

describe('QA-04D — Regresión e Integridad del Kardex y Ciclo de Vida Operacional', () => {
  let prisma: PrismaService;
  let ledgerService: InventoryLedgerService;
  let dailyProdService: DailyProductionService;
  let dispatchesService: DispatchesService;
  let returnsService: ReturnsService;
  let adjustmentsService: AdjustmentsService;

  const runId = crypto.randomUUID().slice(0, 8);
  const testUserId = crypto.randomUUID();
  const testCenterId = crypto.randomUUID();
  const testProductId = crypto.randomUUID();
  const testUser = {
    id: testUserId,
    email: `qa04d-${runId}@polintrack.local`,
    role: 'ADMIN',
  };

  // Referencias operacionales compartidas para trazabilidad
  let createdProductionId: string;
  let createdDispatchId: string;
  let createdDispatchDetailId: string;
  let invoiceNumber: string;

  beforeAll(async () => {
    assertAuthorizedTestConnectionUrl(process.env.DATABASE_URL!, ['polintrack_admin']);

    prisma = new PrismaService();
    await prisma.$connect();
    await assertLiveServerIdentity((sql) => prisma.$queryRawUnsafe(sql), 'polintrack_admin');

    ledgerService = new InventoryLedgerService(prisma);
    dailyProdService = new DailyProductionService(prisma, ledgerService);
    dispatchesService = new DispatchesService(prisma, ledgerService);
    returnsService = new ReturnsService(prisma, ledgerService);
    adjustmentsService = new AdjustmentsService(prisma, ledgerService);

    // Sembrar entidades base aisladas
    await prisma.user.create({
      data: {
        id: testUserId,
        email: testUser.email,
        fullName: `QA-04D Test Operator ${runId}`,
        passwordHash: '$2b$10$dummyHashForLocalQATestingOnly2026',
        role: 'ADMIN',
        isActive: true,
      },
    });

    await prisma.clientCenter.create({
      data: {
        id: testCenterId,
        name: `Centro Cliente QA-04D ${runId}`,
        isActive: true,
      },
    });

    await prisma.product.create({
      data: {
        id: testProductId,
        name: `QA04D Polin Certificado ${runId}`,
        dimensions: '50x50',
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ============================================================================
  // ESCENARIO 1: Ciclo de Vida Operacional Completo y Balance Determinista (RN-010-B)
  // ============================================================================
  it('1. Ejecuta el ciclo de vida operacional completo y verifica el cálculo determinista del Kardex', async () => {
    invoiceNumber = `REM-04D-${runId}`;

    // Paso 1: Producción (+100 piezas)
    const production = await dailyProdService.create(
      {
        productionDate: '2026-10-10',
        products: [{ productId: testProductId, quantityProduced: 100 }],
      },
      testUserId,
    );
    createdProductionId = production.id;

    let currentStock = await ledgerService.getAvailableStock(testProductId);
    expect(currentStock).toBe(100);

    // Paso 2: Despacho (-40 piezas)
    const dispatchRes = await dispatchesService.create(
      {
        invoiceNumber,
        dispatchDate: '2026-10-11',
        dispatchTime: '09:00',
        clientCenterId: testCenterId,
        details: [
          {
            productId: testProductId,
            dailyProductionId: createdProductionId,
            quantityDispatched: 40,
          },
        ],
      },
      testUser,
    );
    createdDispatchId = dispatchRes.data.id;
    createdDispatchDetailId = dispatchRes.data.dispatchDetails[0].id;

    currentStock = await ledgerService.getAvailableStock(testProductId);
    expect(currentStock).toBe(60);

    // Paso 3: Devolución comercial de REPROCESO (+10 piezas ingresan a patio)
    await returnsService.create(
      {
        dispatchHeaderId: createdDispatchId,
        returnDate: '2026-10-12',
        reason: 'Piezas con astillado menor para reaserrado',
        details: [
          {
            dispatchDetailId: createdDispatchDetailId,
            quantityReturned: 10,
            destination: ReturnDestination.REPROCESO,
          },
        ],
      },
      testUser,
    );

    currentStock = await ledgerService.getAvailableStock(testProductId);
    expect(currentStock).toBe(70);

    // Paso 4: Devolución comercial de DESECHO (5 piezas de merma / scrap, delta = 0 en saldo)
    await returnsService.create(
      {
        dispatchHeaderId: createdDispatchId,
        returnDate: '2026-10-12',
        reason: 'Piezas con daño severo no aptas para reproceso',
        details: [
          {
            dispatchDetailId: createdDispatchDetailId,
            quantityReturned: 5,
            destination: ReturnDestination.DESECHO,
          },
        ],
      },
      testUser,
    );

    currentStock = await ledgerService.getAvailableStock(testProductId);
    expect(currentStock).toBe(70); // RN-010-B: DESECHO NO altera el stock disponible vendible

    // Paso 5: Ajuste Administrativo de Almacén (-15 piezas por daño interno)
    await adjustmentsService.create(
      {
        productId: testProductId,
        adjustmentType: AdjustmentType.DECREMENT,
        quantity: 15,
        reasonType: ReasonType.CUSTOM,
        reasonNotes: 'Deterioro por humedad en patio norte verificado',
      },
      testUser,
    );

    currentStock = await ledgerService.getAvailableStock(testProductId);
    expect(currentStock).toBe(55); // 70 - 15 = 55

    // Paso 6: Corrección de Despacho (reducción de 40 a 35 piezas -> delta despacho = -5 -> delta saldo = +5)
    await dispatchesService.correctQuantity(
      createdDispatchId,
      {
        reason: 'Ajuste por conteo físico en báscula de cliente validado',
        idempotencyKey: `idemp-corr-04d-${runId}`,
        items: [
          {
            lineId: createdDispatchDetailId,
            quantity: 35,
          },
        ],
      },
      testUserId,
    );

    currentStock = await ledgerService.getAvailableStock(testProductId);
    expect(currentStock).toBe(60); // 55 + 5 = 60

    // Paso 7: Verificación del Balance de Stock Consolidado (getStockBalance)
    const [balance] = await ledgerService.getStockBalance(testProductId);

    expect(balance).toBeDefined();
    expect(balance.producedQuantity).toBe(100);
    expect(balance.dispatchedQuantity).toBe(40);
    expect(balance.returnedQuantity).toBe(10); // Solo reproceso en ledger
    expect(balance.totalReturnedRework).toBe(10);
    expect(balance.totalReturnedScrap).toBe(5); // Scrap contabilizado para trazabilidad
    expect(balance.totalReturned).toBe(15);
    expect(balance.adjustmentNetQuantity).toBe(-15);
    expect(balance.correctionNetQuantity).toBe(5);
    expect(balance.availableStock).toBe(60);

    // Paso 8: Verificación del Kardex Histórico (getKardexMovements)
    const kardexResult = await ledgerService.getKardexMovements({
      productId: testProductId,
      page: 1,
      limit: 10,
    });

    expect(kardexResult.meta.total).toBe(6);
    expect(kardexResult.data.length).toBe(6);

    const deltas = kardexResult.data.map((m) => m.deltaQuantity);
    // getKardexMovements devuelve en orden descendente (más reciente primero)
    expect(deltas).toEqual([5, -15, 0, 10, -40, 100]);
    expect(deltas.slice().reverse()).toEqual([100, -40, 10, 0, -15, 5]);

    console.log(
      `[QA-04D CICLO COMPLETO]: 6 movimientos registrados (orden DESC): ${deltas.join(', ')}, Stock Final = ${balance.availableStock}`,
    );
  });

  // ============================================================================
  // ESCENARIO 2: Invariantes RN-001 (Inmutabilidad) y RN-013 (Límites de Devolución)
  // ============================================================================
  it('2. Verifica la inmutabilidad histórica de cabeceras/detalles y las reglas de protección de devoluciones (RN-001, RN-013)', async () => {
    // A. Inspeccionar la cabecera y detalle del despacho
    const freshDispatch = await prisma.dispatchHeader.findUnique({
      where: { id: createdDispatchId },
      include: { dispatchDetails: true },
    });

    expect(freshDispatch).toBeDefined();
    expect(freshDispatch!.invoiceNumber).toBe(invoiceNumber);
    // El acumulador de devoluciones registra exactamente las 15 piezas devueltas
    expect(freshDispatch!.dispatchDetails[0].quantityReturnedAccumulated).toBe(15);
    // La cantidad actual despachada fue corregida a 35
    expect(freshDispatch!.dispatchDetails[0].quantityDispatched).toBe(35);

    // B. Protección RN-013: No se puede reducir la cantidad despachada por debajo de lo devuelto acumulado (15)
    await expect(
      dispatchesService.correctQuantity(
        createdDispatchId,
        {
          reason: 'Intento de reducir despacho por debajo del remanente devuelto',
          idempotencyKey: `idemp-corr-fail-${runId}`,
          items: [
            {
              lineId: createdDispatchDetailId,
              quantity: 10, // 10 < 15 piezas devueltas
            },
          ],
        },
        testUserId,
      ),
    ).rejects.toThrow('Ya existen 15 piezas devueltas asociadas a esta línea');

    // C. Protección RN-013: No se puede devolver más de lo disponible (despachadas 35, acumuladas 15, disponible = 20)
    await expect(
      returnsService.create(
        {
          dispatchHeaderId: createdDispatchId,
          returnDate: '2026-10-13',
          reason: 'Intento de devolver más del remanente',
          details: [
            {
              dispatchDetailId: createdDispatchDetailId,
              quantityReturned: 25, // 25 > 20 disponible
              destination: ReturnDestination.REPROCESO,
            },
          ],
        },
        testUser,
      ),
    ).rejects.toThrow('supera el remanente despachado disponible');
  });

  // ============================================================================
  // ESCENARIO 3: Invariante RN-002 (Stock No Negativo)
  // ============================================================================
  it('3. Demuestra que despachos y ajustes rechazan estrictamente operaciones que causen saldo negativo (RN-002)', async () => {
    const stockBefore = await ledgerService.getAvailableStock(testProductId);
    expect(stockBefore).toBe(60);

    // A. Rechazo en Ajuste Administrativo por stock insuficiente
    await expect(
      adjustmentsService.create(
        {
          productId: testProductId,
          adjustmentType: AdjustmentType.DECREMENT,
          quantity: 70, // 70 > 60 disponible
          reasonType: ReasonType.CUSTOM,
          reasonNotes: 'Decremento excesivo no permitido por stock',
        },
        testUser,
      ),
    ).rejects.toThrow('El ajuste no puede dejar el stock del producto en negativo');

    // B. Rechazo en Despacho Comercial por stock insuficiente
    await expect(
      dispatchesService.create(
        {
          invoiceNumber: `REM-OVER-${runId}`,
          dispatchDate: '2026-10-14',
          dispatchTime: '10:00',
          clientCenterId: testCenterId,
          details: [
            {
              productId: testProductId,
              dailyProductionId: createdProductionId,
              quantityDispatched: 65, // 65 > 60 disponible
            },
          ],
        },
        testUser,
      ),
    ).rejects.toThrow('Stock insuficiente para despachar');

    // C. Verificar que ningún movimiento fantasma fue creado y el stock permanece en 60
    const stockAfter = await ledgerService.getAvailableStock(testProductId);
    expect(stockAfter).toBe(60);
  });

  // ============================================================================
  // ESCENARIO 4: Inmutabilidad de Auditoría a nivel PostgreSQL (Trigger de BD)
  // ============================================================================
  it('4. Confirma que la base de datos PostgreSQL bloquea modificaciones y eliminaciones en registros de auditoría', async () => {
    // Buscar la corrección registrada en el escenario 1
    const correction = await prisma.quantityCorrection.findFirst({
      where: { recordId: createdDispatchId },
    });

    expect(correction).toBeDefined();

    // A. Intento de UPDATE directo en quantity_corrections -> Rechazado por trigger
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE quantity_corrections SET reason = 'Texto alterado' WHERE id = '${correction!.id}'::uuid`,
      ),
    ).rejects.toThrow(/Quantity corrections are append-only audit records and cannot be updated or deleted/i);

    // B. Intento de DELETE directo en quantity_corrections -> Rechazado por trigger
    await expect(
      prisma.$executeRawUnsafe(
        `DELETE FROM quantity_corrections WHERE id = '${correction!.id}'::uuid`,
      ),
    ).rejects.toThrow(/Quantity corrections are append-only audit records and cannot be updated or deleted/i);

    console.log('[QA-04D TRIGGER INMUTABILIDAD]: PostgreSQL protegió con éxito los registros de auditoría.');
  });
});
