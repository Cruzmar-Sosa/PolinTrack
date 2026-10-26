/**
 * POLINTRACK — FASE QA-06F-03B: PRUEBAS DE INTEGRACIÓN REAL DE IDEMPOTENCIA CANÓNICA
 *
 * Verificación exhaustiva con PostgreSQL local real (polintrack_test) sobre:
 * - WoodReceiptsService.correctQuantity
 * - DispatchesService.correctQuantity
 * - DailyProductionService.correctQuantity
 *
 * Casos Obligatorios:
 * - TC-IDP-01: Primera corrección con persistencia atómica de payloadHash SHA-256
 * - TC-IDP-02: Repetición secuencial idéntica; cero mutaciones duplicadas en ledger
 * - TC-IDP-03: Misma clave con cantidad diferente -> HTTP 409 IDEMPOTENCY_PAYLOAD_MISMATCH
 * - TC-IDP-04: Misma clave con motivo diferente -> HTTP 409 IDEMPOTENCY_PAYLOAD_MISMATCH
 * - TC-IDP-05: Misma clave en documento diferente -> HTTP 409 IDEMPOTENCY_KEY_REUSED
 * - TC-IDP-06: Concurrencia simultánea con misma clave y mismo payload -> 1 sola corrección física
 * - TC-IDP-07: Concurrencia simultánea con misma clave y payload divergente -> 1 éxito, 1 conflicto 409
 * - TC-IDP-08: Fallo transaccional limpia rollback; reintento posterior procesa
 * - TC-IDP-09: Registro histórico sin hash (payloadHash = null) responde 200 OK retrocompatible
 * - TC-IDP-10: Orden determinista de items genera mismo hash y respuesta idempotente
 */

import * as crypto from 'crypto';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../src/database/prisma.service';
import { InventoryLedgerService } from '../../src/modules/inventory/inventory-ledger.service';
import { DailyProductionService } from '../../src/modules/daily-production/daily-production.service';
import { DispatchesService } from '../../src/modules/dispatches/dispatches.service';
import { WoodReceiptsService } from '../../src/modules/wood-receipts/wood-receipts.service';
import {
  assertAuthorizedTestConnectionUrl,
  assertLiveServerIdentity,
} from '../security/assert-local-db';
import { CorrectionModule, WoodSpeciesEnum, WoodTypeEnum, UnitOfMeasure } from '@prisma/client';

describe('QA-06F-03B — Integración Real de Idempotencia y Payload Hash (PostgreSQL)', () => {
  let prisma: PrismaService;
  let ledgerService: InventoryLedgerService;
  let dailyProdService: DailyProductionService;
  let dispatchesService: DispatchesService;
  let woodReceiptsService: WoodReceiptsService;

  const runId = crypto.randomUUID().slice(0, 8);
  const testUserId = crypto.randomUUID();
  const testCenterId = crypto.randomUUID();
  const testSupplierId = crypto.randomUUID();
  const testProductId1 = crypto.randomUUID();
  const testProductId2 = crypto.randomUUID();

  let testSpeciesId: string;
  let testWoodTypeIdTimbre: string;
  let testWoodTypeIdProcesada: string;

  beforeAll(async () => {
    assertAuthorizedTestConnectionUrl(process.env.DATABASE_URL!, ['polintrack_admin']);

    prisma = new PrismaService();
    await prisma.$connect();
    await assertLiveServerIdentity((sql) => prisma.$queryRawUnsafe(sql), 'polintrack_admin');

    ledgerService = new InventoryLedgerService(prisma);
    dailyProdService = new DailyProductionService(prisma, ledgerService);
    dispatchesService = new DispatchesService(prisma, ledgerService);
    woodReceiptsService = new WoodReceiptsService(prisma);

    // 1. Usuario operador
    await prisma.user.create({
      data: {
        id: testUserId,
        email: `qa06f-idp-${runId}@polintrack.local`,
        fullName: `QA-06F IDP Admin ${runId}`,
        passwordHash: '$2b$10$dummyHashForLocalQATestingOnly2026',
        role: 'ADMIN',
        isActive: true,
      },
    });

    // 2. Centro cliente
    await prisma.clientCenter.create({
      data: {
        id: testCenterId,
        name: `Centro QA06F ${runId}`,
        location: 'Guatemala QA',
      },
    });

    // 3. Proveedor
    await prisma.supplier.create({
      data: {
        id: testSupplierId,
        name: `Proveedor Madera QA06F ${runId}`,
        legalId: `RUC-${runId}`,
        isActive: true,
      },
    });

    // 4. Catálogos base
    const species = await prisma.woodSpecies.upsert({
      where: { name: WoodSpeciesEnum.TECA },
      update: { isActive: true },
      create: { name: WoodSpeciesEnum.TECA, isActive: true },
    });
    testSpeciesId = species.id;

    const timbre = await prisma.woodType.upsert({
      where: { name: WoodTypeEnum.TIMBRE },
      update: { isActive: true },
      create: { name: WoodTypeEnum.TIMBRE, defaultUnit: UnitOfMeasure.PIE_TABLAR, isActive: true },
    });
    testWoodTypeIdTimbre = timbre.id;

    const procesada = await prisma.woodType.upsert({
      where: { name: WoodTypeEnum.PROCESADA },
      update: { isActive: true },
      create: { name: WoodTypeEnum.PROCESADA, defaultUnit: UnitOfMeasure.PIEZAS, isActive: true },
    });
    testWoodTypeIdProcesada = procesada.id;

    // 5. Productos
    await prisma.product.create({
      data: {
        id: testProductId1,
        name: `Polín QA06F-1 ${runId}`,
        dimensions: '3x3x8',
        isActive: true,
      },
    });

    await prisma.product.create({
      data: {
        id: testProductId2,
        name: `Polín QA06F-2 ${runId}`,
        dimensions: '4x4x8',
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  // ============================================================================
  // TC-IDP-01: Primera corrección con persistencia atómica de payloadHash SHA-256
  // ============================================================================
  it('TC-IDP-01: Debe persistir payloadHash SHA-256 de 64 caracteres de forma atómica en DailyProduction', async () => {
    const lot = await dailyProdService.create(
      {
        productionDate: '2026-10-21',
        products: [{ productId: testProductId1, quantityProduced: 50 }],
      },
      testUserId,
    );

    const idempotencyKey = `TC-IDP-01-${runId}`;
    const reason = 'Corrección inicial con clave e idempotencia canónica SHA-256';

    const result = await dailyProdService.correctQuantity(
      lot.id,
      {
        reason,
        idempotencyKey,
        items: [{ lineId: lot.productionDetails[0].id, quantity: 45 }],
      },
      testUserId,
    );

    expect(result.success).toBe(true);
    expect(result.correction).toBeDefined();

    // Verificación directa en base de datos real
    const storedCorrection = await prisma.quantityCorrection.findUnique({
      where: { idempotencyKey },
    });

    expect(storedCorrection).not.toBeNull();
    expect(storedCorrection!.idempotencyKey).toBe(idempotencyKey);
    expect(storedCorrection!.payloadHash).toBeDefined();
    expect(storedCorrection!.payloadHash).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(storedCorrection!.payloadHash!)).toBe(true);
  });

  // ============================================================================
  // TC-IDP-02: Repetición idéntica (mismo payload) -> Cero mutaciones duplicadas
  // ============================================================================
  it('TC-IDP-02: Repetición con misma clave y mismo payload debe retornar 200 OK sin duplicar movimientos en ledger', async () => {
    const lot = await dailyProdService.create(
      {
        productionDate: '2026-10-21',
        products: [{ productId: testProductId1, quantityProduced: 60 }],
      },
      testUserId,
    );

    const idempotencyKey = `TC-IDP-02-${runId}`;
    const reason = 'Ajuste inicial para verificar repetición idéntica';

    // Envío 1
    const res1 = await dailyProdService.correctQuantity(
      lot.id,
      {
        reason,
        idempotencyKey,
        items: [{ lineId: lot.productionDetails[0].id, quantity: 55 }],
      },
      testUserId,
    );
    expect(res1.success).toBe(true);

    // Conteo de movimientos de corrección después del envío 1
    const movementsCount1 = await prisma.inventoryMovement.count({
      where: { referenceId: lot.id, movementType: 'CORRECTION' },
    });
    expect(movementsCount1).toBe(1);

    // Envío 2: Mismo payload exacto
    const res2 = await dailyProdService.correctQuantity(
      lot.id,
      {
        reason,
        idempotencyKey,
        items: [{ lineId: lot.productionDetails[0].id, quantity: 55 }],
      },
      testUserId,
    );

    expect(res2.success).toBe(true);
    expect((res2 as any).message).toContain('Operación idempotente');
    expect(res2.correction.id).toBe(res1.correction.id);

    // Verificación estricta de cero mutaciones adicionales en base de datos
    const movementsCount2 = await prisma.inventoryMovement.count({
      where: { referenceId: lot.id, movementType: 'CORRECTION' },
    });
    expect(movementsCount2).toBe(1); // Cero movimientos duplicados

    const correctionsCount = await prisma.quantityCorrection.count({
      where: { idempotencyKey },
    });
    expect(correctionsCount).toBe(1);
  });

  // ============================================================================
  // TC-IDP-03: Misma clave con cantidad diferente -> HTTP 409 IDEMPOTENCY_PAYLOAD_MISMATCH
  // ============================================================================
  it('TC-IDP-03: Reutilización de clave con cantidad diferente debe ser rechazada con HTTP 409 IDEMPOTENCY_PAYLOAD_MISMATCH', async () => {
    const lot = await dailyProdService.create(
      {
        productionDate: '2026-10-21',
        products: [{ productId: testProductId1, quantityProduced: 70 }],
      },
      testUserId,
    );

    const idempotencyKey = `TC-IDP-03-${runId}`;
    const reason = 'Corrección legítima de producción con 65 piezas';

    // Envío 1: Cantidad 65
    await dailyProdService.correctQuantity(
      lot.id,
      {
        reason,
        idempotencyKey,
        items: [{ lineId: lot.productionDetails[0].id, quantity: 65 }],
      },
      testUserId,
    );

    // Envío 2: Misma clave pero cantidad 40 (DIVERGENTE)
    const divergentAttempt = dailyProdService.correctQuantity(
      lot.id,
      {
        reason,
        idempotencyKey,
        items: [{ lineId: lot.productionDetails[0].id, quantity: 40 }], // diferente cantidad
      },
      testUserId,
    );

    await expect(divergentAttempt).rejects.toThrow(ConflictException);
    await divergentAttempt.catch((err) => {
      expect(err.response?.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');
      expect(err.getStatus()).toBe(409);
    });

    // Verificar que la base de datos conservó la cantidad original 65 y no la 40
    const detail = await prisma.productionDetail.findUnique({
      where: { id: lot.productionDetails[0].id },
    });
    expect(detail!.quantityProduced).toBe(65);
  });

  // ============================================================================
  // TC-IDP-04: Misma clave con motivo diferente -> HTTP 409 IDEMPOTENCY_PAYLOAD_MISMATCH
  // ============================================================================
  it('TC-IDP-04: Reutilización de clave con motivo diferente debe ser rechazada con HTTP 409 IDEMPOTENCY_PAYLOAD_MISMATCH', async () => {
    const lot = await dailyProdService.create(
      {
        productionDate: '2026-10-21',
        products: [{ productId: testProductId1, quantityProduced: 50 }],
      },
      testUserId,
    );

    const idempotencyKey = `TC-IDP-04-${runId}`;

    // Envío 1: Motivo A
    await dailyProdService.correctQuantity(
      lot.id,
      {
        reason: 'Motivo original número uno con longitud válida',
        idempotencyKey,
        items: [{ lineId: lot.productionDetails[0].id, quantity: 45 }],
      },
      testUserId,
    );

    // Envío 2: Motivo B divergente
    const divergentReasonAttempt = dailyProdService.correctQuantity(
      lot.id,
      {
        reason: 'Motivo totalmente diferente pero misma clave de idempotencia',
        idempotencyKey,
        items: [{ lineId: lot.productionDetails[0].id, quantity: 45 }],
      },
      testUserId,
    );

    await expect(divergentReasonAttempt).rejects.toThrow(ConflictException);
    await divergentReasonAttempt.catch((err) => {
      expect(err.response?.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');
    });
  });

  // ============================================================================
  // TC-IDP-05: Misma clave en documento diferente -> HTTP 409 IDEMPOTENCY_KEY_REUSED
  // ============================================================================
  it('TC-IDP-05: Reutilización de clave en documento diferente debe ser rechazada con HTTP 409 IDEMPOTENCY_KEY_REUSED', async () => {
    const lotA = await dailyProdService.create(
      {
        productionDate: '2026-10-21',
        products: [{ productId: testProductId1, quantityProduced: 40 }],
      },
      testUserId,
    );

    const lotB = await dailyProdService.create(
      {
        productionDate: '2026-10-21',
        products: [{ productId: testProductId1, quantityProduced: 40 }],
      },
      testUserId,
    );

    const sharedKey = `TC-IDP-05-SHARED-${runId}`;

    // Aplicar a Lote A
    await dailyProdService.correctQuantity(
      lotA.id,
      {
        reason: 'Corrección legítima en lote A para prueba de clave compartida',
        idempotencyKey: sharedKey,
        items: [{ lineId: lotA.productionDetails[0].id, quantity: 35 }],
      },
      testUserId,
    );

    // Intentar aplicar en Lote B
    const crossDocAttempt = dailyProdService.correctQuantity(
      lotB.id,
      {
        reason: 'Intento de reutilizar la clave en lote B diferente',
        idempotencyKey: sharedKey,
        items: [{ lineId: lotB.productionDetails[0].id, quantity: 35 }],
      },
      testUserId,
    );

    await expect(crossDocAttempt).rejects.toThrow(ConflictException);
    await crossDocAttempt.catch((err) => {
      expect(err.response?.code).toBe('IDEMPOTENCY_KEY_REUSED');
    });
  });

  // ============================================================================
  // TC-IDP-06: Concurrencia con misma clave y mismo payload -> 1 sola mutación física
  // ============================================================================
  it('TC-IDP-06: Solicitudes concurrentes con misma clave y mismo payload deben resolver ambas 200 OK con 1 sola corrección física', async () => {
    const lot = await dailyProdService.create(
      {
        productionDate: '2026-10-21',
        products: [{ productId: testProductId1, quantityProduced: 100 }],
      },
      testUserId,
    );

    const idempotencyKey = `TC-IDP-06-RACE-${runId}`;
    const reason = 'Corrección simultánea en carrera con mismo payload';

    const p1 = dailyProdService.correctQuantity(
      lot.id,
      {
        reason,
        idempotencyKey,
        items: [{ lineId: lot.productionDetails[0].id, quantity: 90 }],
      },
      testUserId,
    );

    const p2 = dailyProdService.correctQuantity(
      lot.id,
      {
        reason,
        idempotencyKey,
        items: [{ lineId: lot.productionDetails[0].id, quantity: 90 }],
      },
      testUserId,
    );

    const [res1, res2] = await Promise.all([p1, p2]);

    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);

    // Exactamente 1 registro en quantity_corrections
    const corrections = await prisma.quantityCorrection.findMany({
      where: { idempotencyKey },
    });
    expect(corrections.length).toBe(1);

    // Exactamente 1 movimiento de corrección
    const movements = await prisma.inventoryMovement.findMany({
      where: { referenceId: lot.id, movementType: 'CORRECTION' },
    });
    expect(movements.length).toBe(1);
    expect(movements[0].deltaQuantity).toBe(-10);
  });

  // ============================================================================
  // TC-IDP-07: Concurrencia con misma clave y payload divergente -> 1 éxito, 1 conflicto 409
  // ============================================================================
  it('TC-IDP-07: Solicitudes concurrentes con misma clave y payload divergente deben otorgar éxito a una y 409 MISMATCH a la otra', async () => {
    const lot = await dailyProdService.create(
      {
        productionDate: '2026-10-21',
        products: [{ productId: testProductId1, quantityProduced: 100 }],
      },
      testUserId,
    );

    const idempotencyKey = `TC-IDP-07-RACE-${runId}`;

    // P1 pide 80 piezas
    const p1 = dailyProdService.correctQuantity(
      lot.id,
      {
        reason: 'Solicitud P1 en carrera concurrente con 80 piezas',
        idempotencyKey,
        items: [{ lineId: lot.productionDetails[0].id, quantity: 80 }],
      },
      testUserId,
    ).then(
      (res) => ({ status: 'fulfilled', value: res }),
      (err) => ({ status: 'rejected', reason: err }),
    );

    // P2 pide 50 piezas con la MISMA clave
    const p2 = dailyProdService.correctQuantity(
      lot.id,
      {
        reason: 'Solicitud P2 en carrera concurrente con 50 piezas divergentes',
        idempotencyKey,
        items: [{ lineId: lot.productionDetails[0].id, quantity: 50 }],
      },
      testUserId,
    ).then(
      (res) => ({ status: 'fulfilled', value: res }),
      (err) => ({ status: 'rejected', reason: err }),
    );

    const [out1, out2] = await Promise.all([p1, p2]);

    const successes = [out1, out2].filter((o) => o.status === 'fulfilled');
    const failures = [out1, out2].filter((o) => o.status === 'rejected');

    // Debe haber exactamente un ganador y un perdedor
    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);

    const failureErr = (failures[0] as any).reason;
    expect(failureErr).toBeInstanceOf(ConflictException);
    expect(failureErr.response?.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');

    // Debe existir exactamente 1 registro en quantity_corrections en BD
    const correctionsCount = await prisma.quantityCorrection.count({
      where: { idempotencyKey },
    });
    expect(correctionsCount).toBe(1);
  });

  // ============================================================================
  // TC-IDP-08: Fallo transaccional revierte; reintento posterior procesa
  // ============================================================================
  it('TC-IDP-08: Fallo transaccional por regla de stock revierte y permite reintento posterior limpio', async () => {
    // 1. Crear lote para despacho
    const lotForDispatch = await dailyProdService.create(
      {
        productionDate: '2026-10-21',
        products: [{ productId: testProductId1, quantityProduced: 10 }],
      },
      testUserId,
    );

    // 2. Crear despacho comercial de 10 piezas
    const dispatchRes = await dispatchesService.create(
      {
        dispatchDate: '2026-10-21',
        dispatchTime: '14:00',
        clientCenterId: testCenterId,
        invoiceNumber: `FAC-FAIL-${runId}`,
        details: [
          {
            dailyProductionId: lotForDispatch.id,
            productId: testProductId1,
            quantityDispatched: 10,
          },
        ],
      },
      { id: testUserId, email: `qa06f-idp-${runId}@polintrack.local`, role: 'ADMIN' },
    );

    const dispatch = dispatchRes.data;
    const idempotencyKey = `TC-IDP-08-ROLLBACK-${runId}`;

    // 3. Intentar incrementar despacho a 1000 piezas (stock en patio insuficiente -> fallo)
    const failAttempt = dispatchesService.correctQuantity(
      dispatch.id,
      {
        reason: 'Intento de incremento descomunal sin existencias en almacén',
        idempotencyKey,
        items: [{ lineId: dispatch.dispatchDetails[0].id, quantity: 1000 }],
      },
      testUserId,
    );

    await expect(failAttempt).rejects.toThrow(BadRequestException);

    // 4. Verificar que no quedó ninguna fila huérfana en quantity_corrections
    const orphanCount = await prisma.quantityCorrection.count({
      where: { idempotencyKey },
    });
    expect(orphanCount).toBe(0);

    // 5. Reintentar con la MISMA clave pero con un ajuste válido a la baja (10 -> 8 piezas)
    const validRetry = await dispatchesService.correctQuantity(
      dispatch.id,
      {
        reason: 'Ajuste rectificado a la baja con la misma clave tras corregir el error',
        idempotencyKey,
        items: [{ lineId: dispatch.dispatchDetails[0].id, quantity: 8 }],
      },
      testUserId,
    );

    expect(validRetry.success).toBe(true);
    expect(validRetry.correction.payloadHash).toBeDefined();

    const finalCorrection = await prisma.quantityCorrection.findUnique({
      where: { idempotencyKey },
    });
    expect(finalCorrection).not.toBeNull();
  });

  // ============================================================================
  // TC-IDP-09: Registro histórico sin hash (payloadHash = null) responde 200 OK
  // ============================================================================
  it('TC-IDP-09: Registro histórico con payloadHash nulo debe responder 200 OK retrocompatible sin mutar BD', async () => {
    const lot = await dailyProdService.create(
      {
        productionDate: '2026-10-21',
        products: [{ productId: testProductId1, quantityProduced: 50 }],
      },
      testUserId,
    );

    const legacyKey = `LEGACY-KEY-${runId}`;

    // Simular un registro histórico preexistente insertando directamente con payload_hash = NULL
    const legacyCorrection = await prisma.quantityCorrection.create({
      data: {
        module: CorrectionModule.DAILY_PRODUCTION,
        recordId: lot.id,
        recordCode: lot.productionLot,
        reason: 'Corrección histórica de prueba migrada sin hash',
        correctedById: testUserId,
        idempotencyKey: legacyKey,
        payloadHash: null, // HISTÓRICO SIN HASH
        items: {
          create: [
            {
              lineId: lot.productionDetails[0].id,
              fieldName: 'quantityProduced',
              previousQuantity: 50,
              newQuantity: 40,
              deltaQuantity: -10,
            },
          ],
        },
      },
    });

    expect(legacyCorrection.payloadHash).toBeNull();

    // Enviar una solicitud con la clave histórica
    const retryResult = await dailyProdService.correctQuantity(
      lot.id,
      {
        reason: 'Cualquier motivo enviado en reintento de cliente legacy',
        idempotencyKey: legacyKey,
        items: [{ lineId: lot.productionDetails[0].id, quantity: 40 }],
      },
      testUserId,
    );

    // Debe responder con éxito 200 OK sin arrojar MISMATCH
    expect(retryResult.success).toBe(true);
    expect((retryResult as any).message).toContain('Operación idempotente');
    expect(retryResult.correction.id).toBe(legacyCorrection.id);

    // Verificar que el registro histórico NO fue mutado (sigue con payload_hash = null)
    const checkDb = await prisma.quantityCorrection.findUnique({
      where: { idempotencyKey: legacyKey },
    });
    expect(checkDb!.payloadHash).toBeNull();
  });

  // ============================================================================
  // TC-IDP-10: Orden determinista de items en Dispatch y DailyProduction
  // ============================================================================
  it('TC-IDP-10: Orden diferente de líneas en items produce el mismo hash y respuesta idempotente', async () => {
    const lot = await dailyProdService.create(
      {
        productionDate: '2026-10-21',
        products: [
          { productId: testProductId1, quantityProduced: 50 },
          { productId: testProductId2, quantityProduced: 50 },
        ],
      },
      testUserId,
    );

    const lineA = lot.productionDetails[0].id;
    const lineB = lot.productionDetails[1].id;
    const idempotencyKey = `TC-IDP-10-${runId}`;
    const reason = 'Corrección multi-línea con orden determinista de verificación';

    // Envío 1: Orden [lineA, lineB]
    const res1 = await dailyProdService.correctQuantity(
      lot.id,
      {
        reason,
        idempotencyKey,
        items: [
          { lineId: lineA, quantity: 45 },
          { lineId: lineB, quantity: 40 },
        ],
      },
      testUserId,
    );
    expect(res1.success).toBe(true);
    const hash1 = res1.correction.payloadHash;

    // Envío 2: Mismo payload pero con orden invertido [lineB, lineA]
    const res2 = await dailyProdService.correctQuantity(
      lot.id,
      {
        reason,
        idempotencyKey,
        items: [
          { lineId: lineB, quantity: 40 },
          { lineId: lineA, quantity: 45 },
        ],
      },
      testUserId,
    );

    expect(res2.success).toBe(true);
    expect((res2 as any).message).toContain('Operación idempotente');
    expect(res2.correction.payloadHash).toBe(hash1);

    // Cero movimientos adicionales
    const totalMovements = await prisma.inventoryMovement.count({
      where: { referenceId: lot.id, movementType: 'CORRECTION' },
    });
    expect(totalMovements).toBe(2); // exactamente 2 del primer envío
  });

  // ============================================================================
  // WoodReceipts Service: Verificación adicional de TIMBRE
  // ============================================================================
  it('WoodReceipts: Idempotencia canónica en recepción de madera TIMBRE', async () => {
    // 1. Recepción en TIMBRE
    const timbreReceipt = await woodReceiptsService.create(
      {
        receiptDate: '2026-10-21',
        receiptTime: '10:00',
        supplierId: testSupplierId,
        speciesId: testSpeciesId,
        woodTypeId: testWoodTypeIdTimbre,
        quantity: 1000,
      },
      testUserId,
    );

    const timbreKey = `WR-KEY-TMB-${runId}`;
    const resTmb1 = await woodReceiptsService.correctQuantity(
      timbreReceipt.id,
      {
        reason: 'Ajuste de cubicación báscula TIMBRE a 1050 pt',
        idempotencyKey: timbreKey,
        quantity: 1050,
      },
      testUserId,
    );

    expect(resTmb1.success).toBe(true);
    expect(resTmb1.correction.payloadHash).toHaveLength(64);

    // Reintento idéntico
    const resTmb2 = await woodReceiptsService.correctQuantity(
      timbreReceipt.id,
      {
        reason: 'Ajuste de cubicación báscula TIMBRE a 1050 pt',
        idempotencyKey: timbreKey,
        quantity: 1050,
      },
      testUserId,
    );
    expect(resTmb2.success).toBe(true);
    expect((resTmb2 as any).message).toContain('Operación idempotente');

    // Reintento divergente
    const tmbDivergent = woodReceiptsService.correctQuantity(
      timbreReceipt.id,
      {
        reason: 'Ajuste de cubicación báscula TIMBRE a 1050 pt',
        idempotencyKey: timbreKey,
        quantity: 1200, // divergente
      },
      testUserId,
    );
    await expect(tmbDivergent).rejects.toThrow(ConflictException);
  });
});
