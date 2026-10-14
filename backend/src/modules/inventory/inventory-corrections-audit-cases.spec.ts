import { BadRequestException } from '@nestjs/common';
import { MovementType, CorrectionModule, DispatchStatus, WoodTypeEnum, Prisma } from '@prisma/client';
import { DailyProductionService } from '../daily-production/daily-production.service';
import { DispatchesService } from '../dispatches/dispatches.service';
import { WoodReceiptsService } from '../wood-receipts/wood-receipts.service';
import { InventoryLedgerService } from './inventory-ledger.service';

/**
 * TEST SUITE OBLIGATORIO — FASE 4: CASOS A H
 * Auditoría crítica del inventario, Kardex, invariantes numéricas y concurrencia.
 */
describe('Inventory & Kardex - Auditable Quantity Corrections (Casos A - H)', () => {
  const userId = '8f02fd0b-a581-486d-8b05-6d1f641688f3';
  const prodId = 'prod-uuid-45x48';
  const reasonValid = 'Corrección por reconteo físico verificado con supervisor de patio';

  // ---------------------------------------------------------------------------
  // CASO A: Corrección de producción (50 -> 55, efecto neto +5)
  // ---------------------------------------------------------------------------
  describe('Caso A: Corrección de producción (50 -> 55)', () => {
    it('debe actualizar la producción a 55, registrar delta +5 en el ledger y no duplicar entradas', async () => {
      const mockProductionId = 'dp-uuid-caso-a';
      const mockLineId = 'line-uuid-caso-a';

      let storedProductionQty = 50;
      let storedDetailQty = 50;
      const createdMovements: any[] = [];
      const createdCorrections: any[] = [];

      const prismaMock: any = {
        $transaction: jest.fn(async (cb) => cb(prismaMock)),
        dailyProduction: {
          findUnique: jest.fn().mockImplementation(() =>
            Promise.resolve({
              id: mockProductionId,
              productionLot: 'LT-131026-W42',
              quantityProduced: storedProductionQty,
              isInitialInventory: false,
              productionDetails: [
                {
                  id: mockLineId,
                  dailyProductionId: mockProductionId,
                  productId: prodId,
                  quantityProduced: storedDetailQty,
                  product: { id: prodId, name: 'Polín 45x48', dimensions: '45x48' },
                },
              ],
            }),
          ),
          update: jest.fn().mockImplementation(({ data }) => {
            storedProductionQty = data.quantityProduced;
            return Promise.resolve({ id: mockProductionId, quantityProduced: storedProductionQty });
          }),
        },
        productionDetail: {
          findMany: jest.fn().mockImplementation(() =>
            Promise.resolve([{ id: mockLineId, quantityProduced: storedDetailQty }]),
          ),
          update: jest.fn().mockImplementation(({ data }) => {
            storedDetailQty = data.quantityProduced;
            return Promise.resolve({ id: mockLineId, quantityProduced: storedDetailQty });
          }),
        },
        fumigationDetail: {
          aggregate: jest.fn().mockResolvedValue({ _sum: { quantityFumigated: 0 } }),
        },
        dispatchDetail: {
          findMany: jest.fn().mockResolvedValue([]),
        },
        inventoryMovement: {
          create: jest.fn().mockImplementation(({ data }) => {
            const mov = { id: `mov-${createdMovements.length + 1}`, ...data };
            createdMovements.push(mov);
            return Promise.resolve(mov);
          }),
        },
        quantityCorrection: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockImplementation(({ data }) => {
            const corr = { id: 'corr-caso-a', ...data };
            createdCorrections.push(corr);
            return Promise.resolve(corr);
          }),
        },
        auditLog: {
          create: jest.fn().mockResolvedValue({ id: 'audit-caso-a' }),
        },
      };

      const ledgerMock: any = {
        getAvailableStock: jest.fn().mockResolvedValue(50),
      };

      const dailyProdService = new DailyProductionService(prismaMock, ledgerMock);

      // Ejecutar corrección 50 -> 55
      const result = await dailyProdService.correctQuantity(
        mockProductionId,
        {
          reason: reasonValid,
          items: [{ lineId: mockLineId, quantity: 55 }],
        },
        userId,
      );

      // Verificaciones numéricas estrictas
      expect(result.success).toBe(true);
      expect(storedDetailQty).toBe(55);
      expect(storedProductionQty).toBe(55);

      // Solo se debe haber creado 1 movimiento compensatorio con delta exacto de +5
      expect(createdMovements).toHaveLength(1);
      expect(createdMovements[0].movementType).toBe(MovementType.CORRECTION);
      expect(createdMovements[0].deltaQuantity).toBe(5);
      expect(createdMovements[0].productId).toBe(prodId);

      // Historial conserva valor previo (50) y nuevo (55)
      expect(createdCorrections).toHaveLength(1);
      expect(createdCorrections[0].module).toBe(CorrectionModule.DAILY_PRODUCTION);
      expect(createdCorrections[0].items.create[0].previousQuantity.toString()).toBe('50');
      expect(createdCorrections[0].items.create[0].newQuantity.toString()).toBe('55');
      expect(createdCorrections[0].items.create[0].deltaQuantity.toString()).toBe('5');
    });
  });

  // ---------------------------------------------------------------------------
  // CASO B: Corrección de despacho al alza (100 -> 105, stock disminuye 5)
  // ---------------------------------------------------------------------------
  describe('Caso B: Corrección de despacho al alza (100 -> 105)', () => {
    it('debe actualizar el despacho a 105 y reducir el inventario disponible en 5 piezas', async () => {
      const mockDispatchId = 'dsp-uuid-caso-b';
      const mockLineId = 'line-dsp-caso-b';

      let storedDispatchedQty = 100;
      const createdMovements: any[] = [];
      const createdCorrections: any[] = [];

      const prismaMock: any = {
        $transaction: jest.fn(async (cb) => cb(prismaMock)),
        dispatchHeader: {
          findUnique: jest.fn().mockImplementation(() =>
            Promise.resolve({
              id: mockDispatchId,
              invoiceNumber: 'F-2001',
              status: DispatchStatus.COMPLETED,
              dispatchDetails: [
                {
                  id: mockLineId,
                  productId: prodId,
                  quantityDispatched: storedDispatchedQty,
                  quantityReturnedAccumulated: 0,
                  dimensions: '45x48',
                  product: { id: prodId, name: 'Polín 45x48' },
                },
              ],
              returnHeaders: [],
            }),
          ),
        },
        dispatchDetail: {
          update: jest.fn().mockImplementation(({ data }) => {
            storedDispatchedQty = data.quantityDispatched;
            return Promise.resolve({ id: mockLineId, quantityDispatched: storedDispatchedQty });
          }),
        },
        inventoryMovement: {
          create: jest.fn().mockImplementation(({ data }) => {
            const mov = { id: `mov-dsp-${createdMovements.length + 1}`, ...data };
            createdMovements.push(mov);
            return Promise.resolve(mov);
          }),
        },
        quantityCorrection: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockImplementation(({ data }) => {
            const corr = { id: 'corr-caso-b', ...data };
            createdCorrections.push(corr);
            return Promise.resolve(corr);
          }),
        },
        auditLog: {
          create: jest.fn().mockResolvedValue({ id: 'audit-caso-b' }),
        },
      };

      // Stock disponible en patio es 50 (suficiente para cubrir +5 adicionales)
      const ledgerMock: any = {
        getAvailableStock: jest.fn().mockResolvedValue(50),
      };

      const dispatchesService = new DispatchesService(prismaMock, ledgerMock);

      const result = await dispatchesService.correctQuantity(
        mockDispatchId,
        {
          reason: reasonValid,
          items: [{ lineId: mockLineId, quantity: 105 }],
        },
        userId,
      );

      expect(result.success).toBe(true);
      expect(storedDispatchedQty).toBe(105);

      // Movimiento compensatorio en el ledger debe ser NEGATIVO (-5) para descontar stock
      expect(createdMovements).toHaveLength(1);
      expect(createdMovements[0].movementType).toBe(MovementType.CORRECTION);
      expect(createdMovements[0].deltaQuantity).toBe(-5);

      // Historial conserva previo 100 y nuevo 105
      expect(createdCorrections[0].items.create[0].previousQuantity.toString()).toBe('100');
      expect(createdCorrections[0].items.create[0].newQuantity.toString()).toBe('105');
      expect(createdCorrections[0].items.create[0].deltaQuantity.toString()).toBe('5');
    });
  });

  // ---------------------------------------------------------------------------
  // CASO C: Corrección de despacho a la baja (100 -> 95, stock aumenta 5)
  // ---------------------------------------------------------------------------
  describe('Caso C: Corrección de despacho a la baja (100 -> 95)', () => {
    it('debe actualizar el despacho a 95 y restituir 5 piezas al inventario sin crear devoluciones', async () => {
      const mockDispatchId = 'dsp-uuid-caso-c';
      const mockLineId = 'line-dsp-caso-c';

      let storedDispatchedQty = 100;
      const createdMovements: any[] = [];

      const prismaMock: any = {
        $transaction: jest.fn(async (cb) => cb(prismaMock)),
        dispatchHeader: {
          findUnique: jest.fn().mockImplementation(() =>
            Promise.resolve({
              id: mockDispatchId,
              invoiceNumber: 'F-2002',
              status: DispatchStatus.COMPLETED,
              dispatchDetails: [
                {
                  id: mockLineId,
                  productId: prodId,
                  quantityDispatched: storedDispatchedQty,
                  quantityReturnedAccumulated: 0,
                  dimensions: '45x48',
                  product: { id: prodId, name: 'Polín 45x48' },
                },
              ],
              returnHeaders: [],
            }),
          ),
        },
        dispatchDetail: {
          update: jest.fn().mockImplementation(({ data }) => {
            storedDispatchedQty = data.quantityDispatched;
            return Promise.resolve({ id: mockLineId, quantityDispatched: storedDispatchedQty });
          }),
        },
        inventoryMovement: {
          create: jest.fn().mockImplementation(({ data }) => {
            const mov = { id: `mov-dsp-${createdMovements.length + 1}`, ...data };
            createdMovements.push(mov);
            return Promise.resolve(mov);
          }),
        },
        quantityCorrection: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'corr-caso-c' }),
        },
        auditLog: {
          create: jest.fn().mockResolvedValue({ id: 'audit-caso-c' }),
        },
      };

      const ledgerMock: any = {
        getAvailableStock: jest.fn().mockResolvedValue(20),
      };

      const dispatchesService = new DispatchesService(prismaMock, ledgerMock);

      const result = await dispatchesService.correctQuantity(
        mockDispatchId,
        {
          reason: reasonValid,
          items: [{ lineId: mockLineId, quantity: 95 }],
        },
        userId,
      );

      expect(result.success).toBe(true);
      expect(storedDispatchedQty).toBe(95);

      // Movimiento compensatorio en el ledger debe ser POSITIVO (+5) para reincorporar stock
      expect(createdMovements).toHaveLength(1);
      expect(createdMovements[0].movementType).toBe(MovementType.CORRECTION);
      expect(createdMovements[0].deltaQuantity).toBe(5);
    });
  });

  // ---------------------------------------------------------------------------
  // CASO D: Corrección de ingreso de madera (No genera movimientos en polines)
  // ---------------------------------------------------------------------------
  describe('Caso D: Corrección de ingreso de madera', () => {
    it('debe actualizar cantidades de madera sin generar movimientos en el ledger de polines', async () => {
      const mockReceiptId = 'wr-uuid-caso-d';

      const prismaMock: any = {
        $transaction: jest.fn(async (cb) => cb(prismaMock)),
        woodReceipt: {
          findUnique: jest.fn().mockResolvedValue({
            id: mockReceiptId,
            lotNumber: 'LT-131026-01',
            quantity: new Prisma.Decimal(1200.5),
            unit: 'PIE_TABLAR',
            yugosQuantity: null,
            reglasQuantity: null,
            woodType: { name: WoodTypeEnum.TIMBRE },
            species: { name: 'PINO' },
            supplier: { name: 'Maderas del Norte' },
            productionWoodReceipts: [],
          }),
          update: jest.fn().mockImplementation(({ data }) =>
            Promise.resolve({ id: mockReceiptId, ...data }),
          ),
        },
        quantityCorrection: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'corr-caso-d' }),
        },
        auditLog: {
          create: jest.fn().mockResolvedValue({ id: 'audit-caso-d' }),
        },
        inventoryMovement: {
          create: jest.fn(),
        },
      };

      const woodReceiptsService = new WoodReceiptsService(prismaMock);

      const result = await woodReceiptsService.correctQuantity(
        mockReceiptId,
        {
          reason: reasonValid,
          quantity: 1250.75,
        },
        userId,
      );

      expect(result.success).toBe(true);
      // El ledger de polines terminados NO debe haber sido alterado
      expect(prismaMock.inventoryMovement.create).not.toHaveBeenCalled();
      expect(prismaMock.woodReceipt.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { quantity: new Prisma.Decimal(1250.75) },
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // CASO E: Correcciones sucesivas (50 -> 55 -> 53, delta neto +3)
  // ---------------------------------------------------------------------------
  describe('Caso E: Correcciones sucesivas (50 -> 55 -> 53)', () => {
    it('debe encadenar correcciones consecutivas con efecto neto exacto de +3 sin duplicaciones', async () => {
      const mockProductionId = 'dp-uuid-caso-e';
      const mockLineId = 'line-uuid-caso-e';

      let currentQty = 50;
      const ledgerDeltas: number[] = [];

      const prismaMock: any = {
        $transaction: jest.fn(async (cb) => cb(prismaMock)),
        dailyProduction: {
          findUnique: jest.fn().mockImplementation(() =>
            Promise.resolve({
              id: mockProductionId,
              productionLot: 'LT-131026-W42',
              quantityProduced: currentQty,
              isInitialInventory: false,
              productionDetails: [
                {
                  id: mockLineId,
                  dailyProductionId: mockProductionId,
                  productId: prodId,
                  quantityProduced: currentQty,
                  product: { id: prodId, name: 'Polín 45x48', dimensions: '45x48' },
                },
              ],
            }),
          ),
          update: jest.fn().mockImplementation(({ data }) => {
            currentQty = data.quantityProduced;
            return Promise.resolve({ id: mockProductionId, quantityProduced: currentQty });
          }),
        },
        productionDetail: {
          findMany: jest.fn().mockImplementation(() =>
            Promise.resolve([{ id: mockLineId, quantityProduced: currentQty }]),
          ),
          update: jest.fn().mockImplementation(({ data }) => {
            currentQty = data.quantityProduced;
            return Promise.resolve({ id: mockLineId, quantityProduced: currentQty });
          }),
        },
        fumigationDetail: {
          aggregate: jest.fn().mockResolvedValue({ _sum: { quantityFumigated: 0 } }),
        },
        dispatchDetail: {
          findMany: jest.fn().mockResolvedValue([]),
        },
        inventoryMovement: {
          create: jest.fn().mockImplementation(({ data }) => {
            ledgerDeltas.push(data.deltaQuantity);
            return Promise.resolve({ id: 'mov-e', ...data });
          }),
        },
        quantityCorrection: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'corr-e' }),
        },
        auditLog: {
          create: jest.fn().mockResolvedValue({ id: 'audit-e' }),
        },
      };

      const ledgerMock: any = {
        getAvailableStock: jest.fn().mockResolvedValue(100),
      };

      const dailyProdService = new DailyProductionService(prismaMock, ledgerMock);

      // Corrección 1: 50 -> 55
      await dailyProdService.correctQuantity(
        mockProductionId,
        {
          reason: 'Primera corrección por ajuste de conteo de entrada en estiba',
          items: [{ lineId: mockLineId, quantity: 55 }],
        },
        userId,
      );
      expect(currentQty).toBe(55);
      expect(ledgerDeltas).toEqual([5]); // +5

      // Corrección 2: 55 -> 53
      await dailyProdService.correctQuantity(
        mockProductionId,
        {
          reason: 'Segunda corrección por descarte posterior de 2 piezas rajadas',
          items: [{ lineId: mockLineId, quantity: 53 }],
        },
        userId,
      );
      expect(currentQty).toBe(53);
      expect(ledgerDeltas).toEqual([5, -2]); // +5 y luego -2

      // Efecto neto acumulado en el ledger: 5 + (-2) = +3
      const netLedgerEffect = ledgerDeltas.reduce((sum, d) => sum + d, 0);
      expect(netLedgerEffect).toBe(3);
    });
  });

  // ---------------------------------------------------------------------------
  // CASO F: Fallo a mitad de la transacción (Rollback atómico total)
  // ---------------------------------------------------------------------------
  describe('Caso F: Fallo a mitad de la transacción', () => {
    it('debe revertir todas las mutaciones si la inserción en audit_logs o ledger falla', async () => {
      const mockProductionId = 'dp-uuid-caso-f';
      const mockLineId = 'line-uuid-caso-f';

      let transactionRolledBack = false;

      const prismaMock: any = {
        $transaction: jest.fn(async (cb) => {
          try {
            return await cb(prismaMock);
          } catch (error) {
            transactionRolledBack = true;
            throw error;
          }
        }),
        dailyProduction: {
          findUnique: jest.fn().mockResolvedValue({
            id: mockProductionId,
            productionLot: 'LT-131026-W42',
            quantityProduced: 100,
            isInitialInventory: false,
            productionDetails: [
              {
                id: mockLineId,
                dailyProductionId: mockProductionId,
                productId: prodId,
                quantityProduced: 100,
                product: { id: prodId, name: 'Polín 45x48', dimensions: '45x48' },
              },
            ],
          }),
          update: jest.fn(),
        },
        productionDetail: {
          findMany: jest.fn().mockResolvedValue([{ id: mockLineId, quantityProduced: 110 }]),
          update: jest.fn(),
        },
        fumigationDetail: {
          aggregate: jest.fn().mockResolvedValue({ _sum: { quantityFumigated: 0 } }),
        },
        dispatchDetail: {
          findMany: jest.fn().mockResolvedValue([]),
        },
        inventoryMovement: {
          create: jest.fn().mockRejectedValue(new Error('PostgreSQL connection drop on ledger write')),
        },
        quantityCorrection: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      };

      const ledgerMock: any = {
        getAvailableStock: jest.fn().mockResolvedValue(100),
      };

      const dailyProdService = new DailyProductionService(prismaMock, ledgerMock);

      await expect(
        dailyProdService.correctQuantity(
          mockProductionId,
          {
            reason: reasonValid,
            items: [{ lineId: mockLineId, quantity: 110 }],
          },
          userId,
        ),
      ).rejects.toThrow('PostgreSQL connection drop on ledger write');

      expect(transactionRolledBack).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // CASO G: Concurrencia y stock insuficiente
  // ---------------------------------------------------------------------------
  describe('Caso G: Concurrencia y stock insuficiente para reducción', () => {
    it('debe rechazar reducción si el stock disponible ya fue consumido concurrentemente', async () => {
      const mockProductionId = 'dp-uuid-caso-g';
      const mockLineId = 'line-uuid-caso-g';

      const prismaMock: any = {
        $transaction: jest.fn(async (cb) => cb(prismaMock)),
        dailyProduction: {
          findUnique: jest.fn().mockResolvedValue({
            id: mockProductionId,
            productionLot: 'LT-131026-W42',
            quantityProduced: 100,
            isInitialInventory: false,
            productionDetails: [
              {
                id: mockLineId,
                dailyProductionId: mockProductionId,
                productId: prodId,
                quantityProduced: 100,
                product: { id: prodId, name: 'Polín 45x48', dimensions: '45x48' },
              },
            ],
          }),
        },
        fumigationDetail: {
          aggregate: jest.fn().mockResolvedValue({ _sum: { quantityFumigated: 0 } }),
        },
        dispatchDetail: {
          findMany: jest.fn().mockResolvedValue([]),
        },
        quantityCorrection: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      };

      // El stock disponible actual en bodega es 10 piezas
      // Se intenta reducir la producción en 30 piezas (de 100 a 70)
      const ledgerMock: any = {
        getAvailableStock: jest.fn().mockResolvedValue(10),
      };

      const dailyProdService = new DailyProductionService(prismaMock, ledgerMock);

      await expect(
        dailyProdService.correctQuantity(
          mockProductionId,
          {
            reason: reasonValid,
            items: [{ lineId: mockLineId, quantity: 70 }],
          },
          userId,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ---------------------------------------------------------------------------
  // CASO H: Reintento e idempotencia
  // ---------------------------------------------------------------------------
  describe('Caso H: Reintento e idempotencia con idempotencyKey', () => {
    it('debe responder con la corrección previa y no crear movimientos duplicados en reintentos', async () => {
      const mockProductionId = 'dp-uuid-caso-h';
      const mockLineId = 'line-uuid-caso-h';
      const idempotencyKey = 'IDEMP-KEY-TEST-2026';

      const existingCorrection = {
        id: 'corr-idempotent-1',
        module: CorrectionModule.DAILY_PRODUCTION,
        idempotencyKey,
        reason: reasonValid,
        items: [
          {
            id: 'item-corr-1',
            fieldName: 'quantityProduced',
            previousQuantity: new Prisma.Decimal(100),
            newQuantity: new Prisma.Decimal(120),
            deltaQuantity: new Prisma.Decimal(20),
          },
        ],
      };

      const prismaMock: any = {
        quantityCorrection: {
          findUnique: jest.fn().mockImplementation(({ where }) => {
            if (where.idempotencyKey === idempotencyKey) {
              return Promise.resolve(existingCorrection);
            }
            return Promise.resolve(null);
          }),
        },
        dailyProduction: {
          findUnique: jest.fn().mockResolvedValue({
            id: mockProductionId,
            productionLot: 'LT-131026-W42',
            productionDate: new Date(),
            quantityProduced: 120,
            productionDetails: [],
          }),
        },
        inventoryMovement: {
          create: jest.fn(),
        },
      };

      const ledgerMock: any = {
        getAvailableStock: jest.fn().mockResolvedValue(100),
      };

      const dailyProdService = new DailyProductionService(prismaMock, ledgerMock);

      const result = await dailyProdService.correctQuantity(
        mockProductionId,
        {
          reason: reasonValid,
          idempotencyKey,
          items: [{ lineId: mockLineId, quantity: 120 }],
        },
        userId,
      );

      expect(result.success).toBe(true);
      expect((result as any).message).toContain('Operación idempotente');
      expect(result.correction.id).toBe('corr-idempotent-1');
      // No se llamó al create del ledger (cero movimientos duplicados)
      expect(prismaMock.inventoryMovement.create).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // CASO I: Rectificación de Producto en Producción Diaria (45x48 -> 45x47)
  // ---------------------------------------------------------------------------
  describe('Caso I: Rectificación de Producto en Producción Diaria (100 pcs 45x48 -> 100 pcs 45x47)', () => {
    it('debe revertir 100 pcs del producto saliente (-100) y aplicar 100 pcs al entrante (+100)', async () => {
      const mockProductionId = 'dp-uuid-caso-i';
      const mockLineId = 'line-dp-caso-i';
      const prodA = 'prod-45x48-id';
      const prodB = 'prod-45x47-id';

      const createdMovements: any[] = [];
      const createdCorrections: any[] = [];
      let currentLineProd = prodA;
      let currentLineQty = 100;

      const prismaMock: any = {
        $transaction: jest.fn(async (cb) => cb(prismaMock)),
        dailyProduction: {
          findUnique: jest.fn().mockResolvedValue({
            id: mockProductionId,
            productionLot: 'LT-131026-W42',
            productionDate: new Date(),
            quantityProduced: 100,
            productionDetails: [
              {
                id: mockLineId,
                productId: prodA,
                quantityProduced: 100,
                product: { id: prodA, name: 'Polín 45x48', dimensions: '45x48' },
              },
            ],
          }),
          update: jest.fn().mockImplementation(({ data }) => Promise.resolve(data)),
        },
        product: {
          findUnique: jest.fn().mockImplementation(({ where: { id } }) => {
            if (id === prodB) {
              return Promise.resolve({
                id: prodB,
                name: 'Polín 45x47',
                dimensions: '45x47',
                isActive: true,
              });
            }
            return Promise.resolve(null);
          }),
        },
        fumigationDetail: {
          aggregate: jest.fn().mockResolvedValue({ _sum: { quantityFumigated: 0 } }),
        },
        dispatchDetail: {
          findMany: jest.fn().mockResolvedValue([]),
        },
        productionDetail: {
          findMany: jest.fn().mockResolvedValue([
            { id: mockLineId, productId: prodB, quantityProduced: 100 },
          ]),
          update: jest.fn().mockImplementation(({ data }) => {
            currentLineProd = data.productId;
            currentLineQty = data.quantityProduced;
            return Promise.resolve({ id: mockLineId, ...data });
          }),
        },
        inventoryMovement: {
          create: jest.fn().mockImplementation(({ data }) => {
            createdMovements.push(data);
            return Promise.resolve({ id: `mov-${createdMovements.length}`, ...data });
          }),
        },
        quantityCorrection: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockImplementation(({ data }) => {
            createdCorrections.push(data);
            return Promise.resolve({ id: 'corr-i', ...data });
          }),
        },
        auditLog: {
          create: jest.fn().mockResolvedValue({ id: 'audit-i' }),
        },
      };

      const ledgerMock: any = {
        getAvailableStock: jest.fn().mockResolvedValue(200),
      };

      const dailyProdService = new DailyProductionService(prismaMock, ledgerMock);

      const result = await dailyProdService.correctQuantity(
        mockProductionId,
        {
          reason: 'Corrección de tipificación: polín 45x48 corregido a 45x47 según inventario',
          items: [{ lineId: mockLineId, productId: prodB, quantity: 100 }],
        },
        userId,
      );

      expect(result.success).toBe(true);
      expect(currentLineProd).toBe(prodB);
      expect(currentLineQty).toBe(100);

      // Verificación de los 2 movimientos compensatorios atómicos
      expect(createdMovements).toHaveLength(2);
      // Movimiento 1: Deducción del producto saliente (-100 pcs en prodA)
      expect(createdMovements[0].productId).toBe(prodA);
      expect(createdMovements[0].deltaQuantity).toBe(-100);
      expect(createdMovements[0].movementType).toBe(MovementType.CORRECTION);

      // Movimiento 2: Adición del producto entrante (+100 pcs en prodB)
      expect(createdMovements[1].productId).toBe(prodB);
      expect(createdMovements[1].deltaQuantity).toBe(100);
      expect(createdMovements[1].movementType).toBe(MovementType.CORRECTION);

      // Auditoría inmutable registra los dos items
      expect(createdCorrections).toHaveLength(1);
      expect(createdCorrections[0].items.create).toHaveLength(2);
      expect(createdCorrections[0].items.create[0].productId).toBe(prodA);
      expect(createdCorrections[0].items.create[1].productId).toBe(prodB);
    });
  });

  // ---------------------------------------------------------------------------
  // CASO J: Rectificación de Producto en Despacho (45x48 -> 45x47)
  // ---------------------------------------------------------------------------
  describe('Caso J: Rectificación de Producto en Despacho (50 pcs 45x48 -> 50 pcs 45x47)', () => {
    it('debe restituir 50 pcs a 45x48 (+50) y descontar 50 pcs de 45x47 (-50)', async () => {
      const mockDispatchId = 'dsp-uuid-caso-j';
      const mockLineId = 'line-dsp-caso-j';
      const prodA = 'prod-45x48-id';
      const prodB = 'prod-45x47-id';

      const createdMovements: any[] = [];
      const createdCorrections: any[] = [];

      const prismaMock: any = {
        $transaction: jest.fn(async (cb) => cb(prismaMock)),
        dispatchHeader: {
          findUnique: jest.fn().mockResolvedValue({
            id: mockDispatchId,
            invoiceNumber: 'F-7019',
            dispatchDate: new Date(),
            status: DispatchStatus.COMPLETED,
            dispatchDetails: [
              {
                id: mockLineId,
                productId: prodA,
                quantityDispatched: 50,
                dimensions: '45x48',
                quantityReturnedAccumulated: 0,
                product: { id: prodA, name: 'Polín 45x48', dimensions: '45x48' },
              },
            ],
            returnHeaders: [],
          }),
        },
        product: {
          findUnique: jest.fn().mockImplementation(({ where: { id } }) => {
            if (id === prodB) {
              return Promise.resolve({
                id: prodB,
                name: 'Polín 45x47',
                dimensions: '45x47',
                isActive: true,
              });
            }
            return Promise.resolve(null);
          }),
        },
        dispatchDetail: {
          update: jest.fn().mockResolvedValue({ id: mockLineId, productId: prodB, dimensions: '45x47', quantityDispatched: 50 }),
        },
        inventoryMovement: {
          create: jest.fn().mockImplementation(({ data }) => {
            createdMovements.push(data);
            return Promise.resolve({ id: `mov-dsp-${createdMovements.length}`, ...data });
          }),
        },
        quantityCorrection: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockImplementation(({ data }) => {
            createdCorrections.push(data);
            return Promise.resolve({ id: 'corr-j', ...data });
          }),
        },
        auditLog: {
          create: jest.fn().mockResolvedValue({ id: 'audit-j' }),
        },
      };

      const ledgerMock: any = {
        getAvailableStock: jest.fn().mockResolvedValue(120), // 120 pcs de stock disponible en 45x47
      };

      const dispatchesService = new DispatchesService(prismaMock, ledgerMock);

      const result = await dispatchesService.correctQuantity(
        mockDispatchId,
        {
          reason: 'Corrección de tipificación: se despachó físicamente 45x47 en lugar de 45x48 según verificación de remisión',
          items: [{ lineId: mockLineId, productId: prodB, quantity: 50 }],
        },
        userId,
      );

      expect(result.success).toBe(true);

      // Verificación de los 2 movimientos compensatorios en despacho
      expect(createdMovements).toHaveLength(2);
      // Movimiento 1: Restitución a inventario de Producto A (+50 pcs a prodA)
      expect(createdMovements[0].productId).toBe(prodA);
      expect(createdMovements[0].deltaQuantity).toBe(50);
      expect(createdMovements[0].movementType).toBe(MovementType.CORRECTION);

      // Movimiento 2: Deducción de inventario de Producto B (-50 pcs de prodB)
      expect(createdMovements[1].productId).toBe(prodB);
      expect(createdMovements[1].deltaQuantity).toBe(-50);
      expect(createdMovements[1].movementType).toBe(MovementType.CORRECTION);

      // Auditoría
      expect(createdCorrections).toHaveLength(1);
      expect(createdCorrections[0].items.create).toHaveLength(2);
      expect(createdCorrections[0].items.create[0].productId).toBe(prodA);
      expect(createdCorrections[0].items.create[1].productId).toBe(prodB);
    });
  });

  // ---------------------------------------------------------------------------
  // CASO K: Rollback Transaccional en Rectificación de Producto
  // ---------------------------------------------------------------------------
  describe('Caso K: Rollback Transaccional si falla cualquier paso de la transacción', () => {
    it('debe abortar la transacción completa y no alterar ningún producto si falla la persistencia', async () => {
      const mockDispatchId = 'dsp-uuid-caso-k';
      const mockLineId = 'line-dsp-caso-k';
      const prodA = 'prod-45x48-id';
      const prodB = 'prod-45x47-id';

      const prismaMock: any = {
        $transaction: jest.fn(async (cb) => {
          // El callback simula la transacción de Prisma que arroja error
          return cb(prismaMock);
        }),
        dispatchHeader: {
          findUnique: jest.fn().mockResolvedValue({
            id: mockDispatchId,
            invoiceNumber: 'F-8899',
            dispatchDate: new Date(),
            status: DispatchStatus.COMPLETED,
            dispatchDetails: [
              {
                id: mockLineId,
                productId: prodA,
                quantityDispatched: 50,
                dimensions: '45x48',
                quantityReturnedAccumulated: 0,
                product: { id: prodA, name: 'Polín 45x48', dimensions: '45x48' },
              },
            ],
            returnHeaders: [],
          }),
        },
        product: {
          findUnique: jest.fn().mockResolvedValue({
            id: prodB,
            name: 'Polín 45x47',
            dimensions: '45x47',
            isActive: true,
          }),
        },
        inventoryMovement: {
          // Falla en el segundo movimiento
          create: jest
            .fn()
            .mockResolvedValueOnce({ id: 'mov-1' })
            .mockRejectedValueOnce(new Error('PostgreSQL deadlock timeout error')),
        },
      };

      const ledgerMock: any = {
        getAvailableStock: jest.fn().mockResolvedValue(100),
      };

      const dispatchesService = new DispatchesService(prismaMock, ledgerMock);

      await expect(
        dispatchesService.correctQuantity(
          mockDispatchId,
          {
            reason: 'Intento de rectificación donde falla la transacción a mitad de ejecución',
            items: [{ lineId: mockLineId, productId: prodB, quantity: 50 }],
          },
          userId,
        ),
      ).rejects.toThrow('PostgreSQL deadlock timeout error');
    });
  });
});
