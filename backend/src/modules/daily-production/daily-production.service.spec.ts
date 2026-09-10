import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MovementType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { InventoryLedgerService } from '../inventory/inventory-ledger.service';
import { DailyProductionService } from './daily-production.service';
import { getISOWeek } from './utils/iso-week.util';

describe('DailyProductionService (Unit Tests)', () => {
  let service: DailyProductionService;
  let prisma: any;
  let ledgerService: any;

  const mockProduct1 = {
    id: 'prod-uuid-1',
    name: 'Polín 45x48',
    dimensions: '45x48',
    isActive: true,
  };

  const mockProduct2 = {
    id: 'prod-uuid-2',
    name: 'Polín 45x47',
    dimensions: '45x47',
    isActive: true,
  };

  const mockProduct3 = {
    id: 'prod-uuid-3',
    name: 'Polín 120x80',
    dimensions: '120x80',
    isActive: true,
  };

  const mockWoodReceipt1 = {
    id: 'wood-uuid-1',
    lotNumber: 'LT-010926-01',
  };

  const mockWoodReceipt2 = {
    id: 'wood-uuid-2',
    lotNumber: 'LT-010926-02',
  };

  beforeEach(async () => {
    prisma = {
      product: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      woodReceipt: {
        findMany: jest.fn(),
      },
      dailyProduction: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
      },
      productionDetail: {
        createMany: jest.fn(),
        findMany: jest.fn(),
      },
      productionWoodReceipt: {
        createMany: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => {
        return cb(prisma);
      }),
    };

    ledgerService = {
      recordMovement: jest.fn().mockResolvedValue({
        id: 'mov-1',
        deltaQuantity: 500,
        runningBalance: 500,
      }),
      getAvailableStock: jest.fn().mockResolvedValue(500),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DailyProductionService,
        { provide: PrismaService, useValue: prisma },
        { provide: InventoryLedgerService, useValue: ledgerService },
      ],
    }).compile();

    service = module.get<DailyProductionService>(DailyProductionService);
  });

  describe('1. ISO 8601 Week Calculation (getISOWeek)', () => {
    it('calculates standard week correctly for 2026-08-31 (Week 36)', () => {
      const result = getISOWeek('2026-08-31');
      expect(result.isoWeek).toBe(36);
      expect(result.isoYear).toBe(2026);
    });

    it('calculates standard week correctly for 2026-01-01 (Week 1)', () => {
      const result = getISOWeek('2026-01-01');
      expect(result.isoWeek).toBe(1);
      expect(result.isoYear).toBe(2026);
    });

    it('calculates boundary week correctly for 2025-12-31 (Week 1 of 2026)', () => {
      const result = getISOWeek('2025-12-31');
      expect(result.isoWeek).toBe(1);
      expect(result.isoYear).toBe(2026);
    });

    it('calculates end-of-year week correctly for 2026-12-31 (Week 53)', () => {
      const result = getISOWeek('2026-12-31');
      expect(result.isoWeek).toBe(53);
      expect(result.isoYear).toBe(2026);
    });
  });

  describe('2. Lot Generation Strategy (RN-009, D-019)', () => {
    it('generates canonical lot LT-DDMMYY-WXX when no production exists for that date', async () => {
      prisma.dailyProduction.findUnique.mockResolvedValue(null);

      const result = await service.generateProductionLot('2026-09-02', prisma);
      expect(result.productionLot).toBe('LT-020926-W36');
      expect(result.isoWeek).toBe(36);
    });

    it('generates canonical lot LT-DDMMYY-WXX for a different week correctly', async () => {
      prisma.dailyProduction.findUnique.mockResolvedValue(null);

      const result = await service.generateProductionLot('2026-09-07', prisma); // Monday = W37
      expect(result.productionLot).toBe('LT-070926-W37');
      expect(result.isoWeek).toBe(37);
    });

    it('allows different dates within the same ISO week without collision (03/09/2026 vs 04/09/2026 in W36)', async () => {
      // 03/09/2026 does not exist -> valid
      prisma.dailyProduction.findUnique.mockResolvedValueOnce(null);
      const res1 = await service.generateProductionLot('2026-09-03', prisma);
      expect(res1.productionLot).toBe('LT-030926-W36');
      expect(res1.isoWeek).toBe(36);

      // 04/09/2026 does not exist -> valid
      prisma.dailyProduction.findUnique.mockResolvedValueOnce(null);
      const res2 = await service.generateProductionLot('2026-09-04', prisma);
      expect(res2.productionLot).toBe('LT-040926-W36');
      expect(res2.isoWeek).toBe(36);

      // Both have distinct canonical lot strings
      expect(res1.productionLot).not.toBe(res2.productionLot);
    });

    it('allows multiple productions on the same date with the same canonical lot (TSK-20.3 repeatable lot)', async () => {
      const res1 = await service.generateProductionLot('2026-09-04', prisma);
      const res2 = await service.generateProductionLot('2026-09-04', prisma);

      expect(res1.productionLot).toBe('LT-040926-W36');
      expect(res2.productionLot).toBe('LT-040926-W36');
      expect(res1.productionLot).toBe(res2.productionLot);
    });

    it('does NOT generate sequential suffixes (-01, -02, etc.) under any circumstance (D-019, TSK-20.3)', async () => {
      const result = await service.generateProductionLot('2026-09-04', prisma);
      expect(result.productionLot).toBe('LT-040926-W36');
      expect(result.productionLot).toMatch(/^LT-\d{6}-W\d{2}$/);
      expect(result.productionLot).not.toMatch(/-0[1-9]$/);
    });
  });

  describe('3. Validation Rules', () => {
    it('rejects empty product list with MISSING_PRODUCTS', async () => {
      await expect(
        service.create(
          {
            products: [],
            productionDate: '2026-09-02',
          },
          'user-uuid-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects quantityProduced <= 0 with INVALID_QUANTITY (FA-01)', async () => {
      await expect(
        service.create(
          {
            products: [{ productId: 'prod-uuid-1', quantityProduced: 0 }],
            productionDate: '2026-09-02',
          },
          'user-uuid-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects duplicate products within the same daily production', async () => {
      await expect(
        service.create(
          {
            products: [
              { productId: 'prod-uuid-1', quantityProduced: 100 },
              { productId: 'prod-uuid-1', quantityProduced: 200 },
            ],
            productionDate: '2026-09-02',
          },
          'user-uuid-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects future productionDate with FUTURE_DATE_NOT_ALLOWED', async () => {
      await expect(
        service.create(
          {
            products: [{ productId: 'prod-uuid-1', quantityProduced: 100 }],
            productionDate: '2099-12-31',
          },
          'user-uuid-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects non-existent product with RESOURCE_NOT_FOUND (404)', async () => {
      prisma.product.findMany.mockResolvedValue([]); // Returns 0 products for 1 requested

      await expect(
        service.create(
          {
            products: [
              { productId: 'non-existent-product', quantityProduced: 100 },
            ],
            productionDate: '2026-09-02',
          },
          'user-uuid-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects non-existent wood receipt in woodReceiptIds with RESOURCE_NOT_FOUND (404)', async () => {
      prisma.product.findMany.mockResolvedValue([mockProduct1]);
      prisma.woodReceipt.findMany.mockResolvedValue([]); // 0 found

      await expect(
        service.create(
          {
            products: [{ productId: 'prod-uuid-1', quantityProduced: 100 }],
            productionDate: '2026-09-02',
            woodReceiptIds: ['missing-wood-uuid'],
          },
          'user-uuid-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects invalid date range startDate > endDate on findAll (RN-007)', async () => {
      await expect(
        service.findAll({
          startDate: '2026-09-20',
          endDate: '2026-09-10',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('4. Multi-Product Creation & Ledger Integration (TSK-20.2)', () => {
    it('creates daily production with multiple products, increments inventory ledger per product and writes audit log', async () => {
      prisma.product.findMany.mockResolvedValue([
        mockProduct1,
        mockProduct2,
        mockProduct3,
      ]);
      prisma.woodReceipt.findMany.mockResolvedValue([
        mockWoodReceipt1,
        mockWoodReceipt2,
      ]);
      prisma.dailyProduction.findUnique.mockResolvedValue(null);

      const mockCreatedProduction = {
        id: 'prod-order-1',
        productionLot: 'LT-040926-W36',
        productionDate: new Date('2026-09-04T00:00:00.000Z'),
        isoWeek: 36,
        createdBy: {
          id: 'user-1',
          fullName: 'Operador',
          email: 'op@polintrack.com',
        },
      };
      prisma.dailyProduction.create.mockResolvedValue(mockCreatedProduction);

      const mockDetails = [
        {
          id: 'detail-1',
          dailyProductionId: 'prod-order-1',
          productId: mockProduct1.id,
          quantityProduced: 100,
          product: mockProduct1,
        },
        {
          id: 'detail-2',
          dailyProductionId: 'prod-order-1',
          productId: mockProduct2.id,
          quantityProduced: 80,
          product: mockProduct2,
        },
        {
          id: 'detail-3',
          dailyProductionId: 'prod-order-1',
          productId: mockProduct3.id,
          quantityProduced: 30,
          product: mockProduct3,
        },
      ];
      prisma.productionDetail.findMany.mockResolvedValue(mockDetails);

      const result = await service.create(
        {
          productionDate: '2026-09-04',
          products: [
            { productId: mockProduct1.id, quantityProduced: 100 },
            { productId: mockProduct2.id, quantityProduced: 80 },
            { productId: mockProduct3.id, quantityProduced: 30 },
          ],
          woodReceiptIds: [mockWoodReceipt1.id, mockWoodReceipt2.id],
        },
        'user-1',
      );

      // Verify production lot and week
      expect(result.productionLot).toBe('LT-040926-W36');
      expect(result.isoWeek).toBe(36);
      expect(result.totalQuantityProduced).toBe(210);
      expect(result.productionDetails).toHaveLength(3);

      // Verify details creation in DB
      expect(prisma.productionDetail.createMany).toHaveBeenCalledWith({
        data: [
          {
            dailyProductionId: 'prod-order-1',
            productId: mockProduct1.id,
            quantityProduced: 100,
          },
          {
            dailyProductionId: 'prod-order-1',
            productId: mockProduct2.id,
            quantityProduced: 80,
          },
          {
            dailyProductionId: 'prod-order-1',
            productId: mockProduct3.id,
            quantityProduced: 30,
          },
        ],
      });

      // Verify M:N wood receipt links inserted
      expect(prisma.productionWoodReceipt.createMany).toHaveBeenCalledWith({
        data: [
          {
            dailyProductionId: 'prod-order-1',
            woodReceiptId: mockWoodReceipt1.id,
          },
          {
            dailyProductionId: 'prod-order-1',
            woodReceiptId: mockWoodReceipt2.id,
          },
        ],
        skipDuplicates: true,
      });

      // Verify ledger increment called for EACH of the 3 products
      expect(ledgerService.recordMovement).toHaveBeenCalledTimes(3);
      expect(ledgerService.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: mockProduct1.id,
          movementType: MovementType.PRODUCTION,
          quantity: 100,
          referenceTable: 'daily_productions',
          referenceId: 'prod-order-1',
        }),
        prisma,
      );
      expect(ledgerService.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: mockProduct2.id,
          movementType: MovementType.PRODUCTION,
          quantity: 80,
          referenceTable: 'daily_productions',
          referenceId: 'prod-order-1',
        }),
        prisma,
      );
      expect(ledgerService.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: mockProduct3.id,
          movementType: MovementType.PRODUCTION,
          quantity: 30,
          referenceTable: 'daily_productions',
          referenceId: 'prod-order-1',
        }),
        prisma,
      );

      // Verify AuditLog inserted
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tableName: 'daily_productions',
          recordId: 'prod-order-1',
          action: 'INSERT',
        }),
      });
    });

    it('supports backwards-compatible single product payload', async () => {
      prisma.product.findMany.mockResolvedValue([mockProduct1]);
      prisma.dailyProduction.findUnique.mockResolvedValue(null);

      const mockCreatedProduction = {
        id: 'prod-order-legacy',
        productionLot: 'LT-020926-W36',
        productionDate: new Date('2026-09-02T00:00:00.000Z'),
        isoWeek: 36,
        createdBy: { id: 'user-1', fullName: 'Operador', email: 'op@polintrack.com' },
      };
      prisma.dailyProduction.create.mockResolvedValue(mockCreatedProduction);
      prisma.productionDetail.findMany.mockResolvedValue([
        {
          id: 'detail-leg',
          dailyProductionId: 'prod-order-legacy',
          productId: mockProduct1.id,
          quantityProduced: 500,
          product: mockProduct1,
        },
      ]);

      const result = await service.create(
        {
          productId: mockProduct1.id,
          quantityProduced: 500,
          productionDate: '2026-09-02',
        },
        'user-1',
      );

      expect(result.productionLot).toBe('LT-020926-W36');
      expect(result.quantityProduced).toBe(500);
      expect(result.productId).toBe(mockProduct1.id);
    });
  });

  describe('5. Immutability Guarantees (RN-001)', () => {
    it('service does not expose update or delete methods', () => {
      expect((service as any).update).toBeUndefined();
      expect((service as any).delete).toBeUndefined();
      expect((service as any).remove).toBeUndefined();
    });
  });
});
