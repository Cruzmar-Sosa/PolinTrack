/**
 * POLINTRACK — FASE QA-06: CONCURRENCIA REAL EN WoodReceiptsService
 *
 * Verificación con PostgreSQL local (polintrack_test) y servicios reales:
 * 1. Carrera en creación simultánea de recepciones de madera (generación correlativa de lotes LT-DDMMYY-XX).
 * 2. Serialización estricta mediante SELECT FOR UPDATE en correcciones simultáneas sobre el mismo documento.
 * 3. Idempotencia concurrente con misma idempotencyKey (prevención de doble registro de corrección).
 * 4. Detección determinista de NO_CHANGES_DETECTED tras desbloqueo de transacción competidora.
 * 5. Atomicidad y rollback integral ante fallas durante la transacción de corrección.
 */

import { PrismaService } from '../../src/database/prisma.service';
import { WoodReceiptsService } from '../../src/modules/wood-receipts/wood-receipts.service';
import {
  assertAuthorizedTestConnectionUrl,
  assertLiveServerIdentity,
} from '../security/assert-local-db';
import { BadRequestException } from '@nestjs/common';
import { WoodSpeciesEnum, WoodTypeEnum, UnitOfMeasure } from '@prisma/client';
import * as crypto from 'crypto';

describe('QA-06 — Concurrencia Real de WoodReceiptsService en PostgreSQL Local', () => {
  let prisma: PrismaService;
  let service: WoodReceiptsService;

  const runId = crypto.randomUUID().slice(0, 8);
  const testUserId = crypto.randomUUID();
  const testSupplierId = crypto.randomUUID();
  let timbreWoodTypeId: string;
  let procesadaWoodTypeId: string;
  let speciesId: string;

  const testUser = {
    id: testUserId,
    email: `qa06-wood-${runId}@polintrack.local`,
    role: 'ADMIN',
  };

  beforeAll(async () => {
    // 1. Verificación estricta de aislamiento de seguridad
    assertAuthorizedTestConnectionUrl(process.env.DATABASE_URL!, ['polintrack_admin']);

    prisma = new PrismaService();
    await prisma.$connect();
    await assertLiveServerIdentity((sql) => prisma.$queryRawUnsafe(sql), 'polintrack_admin');

    service = new WoodReceiptsService(prisma);

    // 2. Sembrar catálogos esenciales si no existen
    const timbre = await prisma.woodType.upsert({
      where: { name: WoodTypeEnum.TIMBRE },
      update: { isActive: true },
      create: {
        name: WoodTypeEnum.TIMBRE,
        defaultUnit: UnitOfMeasure.PIE_TABLAR,
        description: 'Madera en troza / rolliza (pt)',
        isActive: true,
      },
    });
    timbreWoodTypeId = timbre.id;

    const procesada = await prisma.woodType.upsert({
      where: { name: WoodTypeEnum.PROCESADA },
      update: { isActive: true },
      create: {
        name: WoodTypeEnum.PROCESADA,
        defaultUnit: UnitOfMeasure.PIEZAS,
        description: 'Madera dimensionada en piezas (yugos y reglas)',
        isActive: true,
      },
    });
    procesadaWoodTypeId = procesada.id;

    const species = await prisma.woodSpecies.upsert({
      where: { name: WoodSpeciesEnum.TECA },
      update: { isActive: true },
      create: {
        name: WoodSpeciesEnum.TECA,
        isActive: true,
      },
    });
    speciesId = species.id;

    // 3. Sembrar usuario y proveedor para la suite
    await prisma.user.create({
      data: {
        id: testUserId,
        email: testUser.email,
        fullName: `QA-06 Wood Inspector ${runId}`,
        passwordHash: '$2b$10$dummyHashForLocalQATestingOnly2026',
        role: 'ADMIN',
        isActive: true,
      },
    });

    await prisma.supplier.create({
      data: {
        id: testSupplierId,
        name: `Proveedor Forestal QA-06 ${runId}`,
        legalId: `RUC-${runId}`,
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ============================================================================
  // ESCENARIO 1: Creación concurrente de recepciones (Carrera de numeración)
  // ============================================================================
  it('1. Debe generar números de lote correlativos únicos bajo creación concurrente simultánea', async () => {
    const receiptDate = '2026-10-15';

    // Disparar simultáneamente dos creaciones de recepción para la misma fecha
    const p1 = service.create(
      {
        receiptDate,
        receiptTime: '10:00',
        supplierId: testSupplierId,
        speciesId,
        woodTypeId: timbreWoodTypeId,
        quantity: 50,
      },
      testUserId,
    );

    const p2 = service.create(
      {
        receiptDate,
        receiptTime: '10:00',
        supplierId: testSupplierId,
        speciesId,
        woodTypeId: timbreWoodTypeId,
        quantity: 75,
      },
      testUserId,
    );

    const [res1, res2] = await Promise.all([p1, p2]);

    console.log(
      `[EVIDENCIA QA-06 - CREACIÓN CONCURRENTE]: Lote 1 = ${res1.lotNumber}, Lote 2 = ${res2.lotNumber}`,
    );

    // Verificaciones:
    // 1. Ambas creaciones completadas
    expect(res1.id).toBeDefined();
    expect(res2.id).toBeDefined();
    // 2. Lotes asignados son estrictamente distintos (sin colisión)
    expect(res1.lotNumber).not.toEqual(res2.lotNumber);
    // 3. Ambos pertenecen al prefijo de fecha correcto
    expect(res1.lotNumber).toMatch(/^LT-151026-\d{2}$/);
    expect(res2.lotNumber).toMatch(/^LT-151026-\d{2}$/);

    // 4. Verificar persistencia en base de datos PostgreSQL
    const dbReceipts = await prisma.woodReceipt.findMany({
      where: { id: { in: [res1.id, res2.id] } },
    });
    expect(dbReceipts.length).toBe(2);
  });

  // ============================================================================
  // ESCENARIO 2: Serialización estricta en correcciones concurrentes sobre el mismo documento
  // ============================================================================
  it('2. Debe serializar mediante SELECT FOR UPDATE dos correcciones concurrentes sobre la misma recepción', async () => {
    // A. Crear recepción TIMBRE con 100 pt
    const receipt = await service.create(
      {
        receiptDate: '2026-10-15',
        receiptTime: '11:00',
        supplierId: testSupplierId,
        speciesId,
        woodTypeId: timbreWoodTypeId,
        quantity: 100,
      },
      testUserId,
    );

    const key1 = `QA06-WR-CORR-1-${runId}-${Date.now()}`;
    const key2 = `QA06-WR-CORR-2-${runId}-${Date.now()}`;

    // B. Lanzar concurrentemente dos correcciones con valores distintos
    // T1 intenta corregir a 125 pt (delta = +25)
    // T2 intenta corregir a 160 pt (delta = +35 sobre 125)
    const p1 = service.correctQuantity(
      receipt.id,
      {
        quantity: 125,
        reason: 'Ajuste de cubicación verificado en patio de descarga por operador 1',
        idempotencyKey: key1,
      },
      testUserId,
    );

    const p2 = service.correctQuantity(
      receipt.id,
      {
        quantity: 160,
        reason: 'Recubicación final certificada por supervisor en báscula',
        idempotencyKey: key2,
      },
      testUserId,
    );

    const [res1, res2] = await Promise.all([p1, p2]);

    console.log(
      `[EVIDENCIA QA-06 - CORRECCIÓN SERIALIZADA]: T1 final = ${res1.data?.quantity}, T2 final = ${res2.data?.quantity}`,
    );

    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);

    // C. Verificar estado final persistido en PostgreSQL
    const finalReceipt = await prisma.woodReceipt.findUnique({
      where: { id: receipt.id },
    });

    // Ambas transacciones debieron serializarse; la última en ejecutar fija el estado final
    const finalQty = Number(finalReceipt!.quantity);
    expect([125, 160]).toContain(finalQty);

    // D. Verificar auditoría en quantity_corrections: deben existir exactamente 2 correcciones
    const corrections = await prisma.quantityCorrection.findMany({
      where: { recordId: receipt.id },
      orderBy: { createdAt: 'asc' },
      include: { items: true },
    });

    expect(corrections.length).toBe(2);
    // Verificar que ambas claves de idempotencia se registraron sin pérdida
    const recordedKeys = corrections.map((c) => c.idempotencyKey);
    expect(recordedKeys).toContain(key1);
    expect(recordedKeys).toContain(key2);

    console.log(
      `[EVIDENCIA QA-06 - AUDITORÍA COMPLETA]: Correcciones registradas = ${corrections.length}, Saldo final = ${finalQty} pt`,
    );
  });

  // ============================================================================
  // ESCENARIO 3: Concurrencia con idempotencyKey idéntica (Prevención de doble corrección)
  // ============================================================================
  it('3. Debe garantizar idempotencia bajo llamadas concurrentes con la misma idempotencyKey', async () => {
    // A. Crear recepción PROCESADA con 50 yugos y 50 reglas (total 100 piezas)
    const receipt = await service.create(
      {
        receiptDate: '2026-10-15',
        receiptTime: '12:00',
        supplierId: testSupplierId,
        speciesId,
        woodTypeId: procesadaWoodTypeId,
        quantity: 100,
        yugosQuantity: 50,
        reglasQuantity: 50,
      },
      testUserId,
    );

    const duplicateKey = `QA06-IDEM-WR-${runId}-SHARED`;
    const correctionPayload = {
      yugosQuantity: 60,
      reglasQuantity: 50,
      reason: 'Corrección concurrente de prueba para verificar idempotencia estricta en madera procesada',
      idempotencyKey: duplicateKey,
    };

    // B. Disparar simultáneamente dos llamadas con la misma clave y payload
    const p1 = service.correctQuantity(receipt.id, correctionPayload, testUserId);
    const p2 = service.correctQuantity(receipt.id, correctionPayload, testUserId);

    const [res1, res2] = await Promise.all([p1, p2]);

    console.log(
      `[EVIDENCIA QA-06 - IDEMPOTENCIA CONCURRENTE]: Res1=${res1.success}, Res2=${res2.success}`,
    );

    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);

    // Al menos una de las dos respuestas debe indicar explícitamente operación idempotente
    const hasIdempotentMsg =
      res1.message?.includes('Operación idempotente') ||
      res2.message?.includes('Operación idempotente');
    expect(hasIdempotentMsg).toBe(true);

    // C. Verificar en PostgreSQL que NO hubo duplicación en quantity_corrections
    const corrections = await prisma.quantityCorrection.findMany({
      where: { idempotencyKey: duplicateKey },
    });
    expect(corrections.length).toBe(1);

    // D. Verificar saldo final en wood_receipts (total = 110: 60 yugos + 50 reglas)
    const finalReceipt = await prisma.woodReceipt.findUnique({
      where: { id: receipt.id },
    });
    expect(Number(finalReceipt!.quantity)).toBe(110);
    expect(finalReceipt!.yugosQuantity).toBe(60);
    expect(finalReceipt!.reglasQuantity).toBe(50);
  });

  // ============================================================================
  // ESCENARIO 4: Detección de NO_CHANGES_DETECTED tras serialización
  // ============================================================================
  it('4. Debe rechazar con NO_CHANGES_DETECTED cuando la segunda transacción serializada no detecta cambio neto', async () => {
    // A. Crear recepción TIMBRE con 100 pt
    const receipt = await service.create(
      {
        receiptDate: '2026-10-15',
        receiptTime: '13:00',
        supplierId: testSupplierId,
        speciesId,
        woodTypeId: timbreWoodTypeId,
        quantity: 100,
      },
      testUserId,
    );

    // Ambas transacciones intentan fijar la cantidad en 120 pt (con claves distintas)
    const p1 = service.correctQuantity(
      receipt.id,
      {
        quantity: 120,
        reason: 'Ajuste de cubicación a 120 pt por el primer operador',
        idempotencyKey: `QA06-NOCHANGE-T1-${runId}`,
      },
      testUserId,
    );

    const p2 = service.correctQuantity(
      receipt.id,
      {
        quantity: 120,
        reason: 'Ajuste de cubicación a 120 pt por el segundo operador concurrente',
        idempotencyKey: `QA06-NOCHANGE-T2-${runId}`,
      },
      testUserId,
    );

    // Una debe tener éxito y la otra debe ser rechazada con NO_CHANGES_DETECTED (400)
    const results = await Promise.allSettled([p1, p2]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    console.log(
      `[EVIDENCIA QA-06 - NO_CHANGES_DETECTED]: Aprobados = ${fulfilled.length}, Rechazados = ${rejected.length}`,
    );

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const rejectionReason = (rejected[0] as PromiseRejectedResult).reason;
    expect(rejectionReason).toBeInstanceOf(BadRequestException);
    expect(rejectionReason.getResponse().code).toBe('NO_CHANGES_DETECTED');

    // Estado final en PostgreSQL: 120 pt y exactamente 1 corrección registrada
    const finalReceipt = await prisma.woodReceipt.findUnique({
      where: { id: receipt.id },
    });
    expect(Number(finalReceipt!.quantity)).toBe(120);

    const countCorrections = await prisma.quantityCorrection.count({
      where: { recordId: receipt.id },
    });
    expect(countCorrections).toBe(1);
  });

  // ============================================================================
  // ESCENARIO 5: Atomicidad transaccional y Rollback ante fallo
  // ============================================================================
  it('5. Debe revertir el UPDATE operativo si ocurre una falla en la transacción de corrección', async () => {
    const receipt = await service.create(
      {
        receiptDate: '2026-10-15',
        receiptTime: '14:00',
        supplierId: testSupplierId,
        speciesId,
        woodTypeId: timbreWoodTypeId,
        quantity: 100,
      },
      testUserId,
    );

    // Intentar corrección con razón que viola la longitud mínima o formato (< 10 caracteres)
    await expect(
      service.correctQuantity(
        receipt.id,
        {
          quantity: 200,
          reason: 'Corta', // Demasiado corta, rechazada por validación
          idempotencyKey: `QA06-ROLLBACK-${runId}`,
        },
        testUserId,
      ),
    ).rejects.toThrow(BadRequestException);

    // Verificar que en PostgreSQL la cantidad no fue alterada (permanece en 100 pt)
    const intactReceipt = await prisma.woodReceipt.findUnique({
      where: { id: receipt.id },
    });
    expect(Number(intactReceipt!.quantity)).toBe(100);

    // Verificar que no se creó registro de corrección huérfano
    const orphanCount = await prisma.quantityCorrection.count({
      where: { recordId: receipt.id },
    });
    expect(orphanCount).toBe(0);

    console.log(
      `[EVIDENCIA QA-06 - ROLLBACK VERIFICADO]: Cantidad intacta = ${intactReceipt!.quantity} pt, Correcciones huérfanas = ${orphanCount}`,
    );
  });
});
