import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MovementType } from '@prisma/client';
import { InventoryLedgerService } from './inventory-ledger.service';
import { PrismaService } from '../../database/prisma.service';

describe('InventoryLedgerService', () => {
  let service: InventoryLedgerService;
  let prisma: any;

  const mockUserId = '8f02fd0b-a581-486d-8b05-6d1f641688f3';
  const mockProductId = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
  const mockReferenceId = '9ba7b810-9dad-11d1-80b4-00c04fd430c9';

  const mockProduct = {
    id: mockProductId,
    name: 'Polín 45x48',
    dimensions: '45x48',
    isActive: true,
  };

  const mockUser = {
    id: mockUserId,
    email: 'operador@polintrack.com',
    fullName: 'Operador Planta',
  };

  beforeEach(async () => {
    prisma = {
      product: {
        findUnique: jest.fn().mockResolvedValue(mockProduct),
        findMany: jest.fn().mockResolvedValue([mockProduct]),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue(mockUser),
      },
      inventoryMovement: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'mov-uuid-1',
            ...data,
            timestamp: new Date(),
          }),
        ),
        aggregate: jest.fn().mockResolvedValue({
          _sum: { deltaQuantity: 100 },
        }),
        groupBy: jest.fn().mockResolvedValue([
          {
            productId: mockProductId,
            movementType: MovementType.PRODUCTION,
            _sum: { deltaQuantity: 500 },
          },
          {
            productId: mockProductId,
            movementType: MovementType.DISPATCH,
            _sum: { deltaQuantity: -400 },
          },
        ]),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'mov-uuid-1',
            productId: mockProductId,
            movementType: MovementType.PRODUCTION,
            deltaQuantity: 500,
            referenceTable: 'daily_productions',
            referenceId: mockReferenceId,
            timestamp: new Date(),
            product: { name: 'Polín 45x48', dimensions: '45x48' },
            performedBy: {
              id: mockUserId,
              fullName: 'Operador Planta',
              email: 'operador@polintrack.com',
            },
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryLedgerService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<InventoryLedgerService>(InventoryLedgerService);
  });

  describe('recordMovement (Append-Only Ledger Entry)', () => {
    it('should record PRODUCTION movement with positive deltaQuantity (+N)', async () => {
      const result = await service.recordMovement({
        productId: mockProductId,
        movementType: MovementType.PRODUCTION,
        quantity: 250,
        referenceTable: 'daily_productions',
        referenceId: mockReferenceId,
        performedById: mockUserId,
      });

      expect(result.deltaQuantity).toBe(250);
      expect(prisma.inventoryMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            productId: mockProductId,
            movementType: MovementType.PRODUCTION,
            deltaQuantity: 250,
            referenceTable: 'daily_productions',
          }),
        }),
      );
    });

    it('should record DISPATCH movement with negative deltaQuantity (-N) when stock is sufficient (RN-002)', async () => {
      prisma.inventoryMovement.aggregate.mockResolvedValue({
        _sum: { deltaQuantity: 300 }, // Available stock = 300
      });

      const result = await service.recordMovement({
        productId: mockProductId,
        movementType: MovementType.DISPATCH,
        quantity: 200, // Requested <= Available
        referenceTable: 'dispatch_details',
        referenceId: mockReferenceId,
        performedById: mockUserId,
      });

      expect(result.deltaQuantity).toBe(-200);
      expect(prisma.inventoryMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deltaQuantity: -200,
            movementType: MovementType.DISPATCH,
          }),
        }),
      );
    });

    it('should throw BadRequestException (INSUFFICIENT_STOCK) when dispatch exceeds available stock (RN-002)', async () => {
      prisma.inventoryMovement.aggregate.mockResolvedValue({
        _sum: { deltaQuantity: 100 }, // Available stock = 100
      });

      await expect(
        service.recordMovement({
          productId: mockProductId,
          movementType: MovementType.DISPATCH,
          quantity: 150, // Requested 150 > Available 100
          referenceTable: 'dispatch_details',
          referenceId: mockReferenceId,
          performedById: mockUserId,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
    });

    it('should record RETURN movement with positive deltaQuantity (+N, RN-013)', async () => {
      const result = await service.recordMovement({
        productId: mockProductId,
        movementType: MovementType.RETURN,
        quantity: 50,
        referenceTable: 'return_details',
        referenceId: mockReferenceId,
        performedById: mockUserId,
      });

      expect(result.deltaQuantity).toBe(50);
      expect(prisma.inventoryMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deltaQuantity: 50,
            movementType: MovementType.RETURN,
          }),
        }),
      );
    });

    it('should record ADJUSTMENT decrement (-N) and validate stock does not go negative (RN-004A)', async () => {
      prisma.inventoryMovement.aggregate.mockResolvedValue({
        _sum: { deltaQuantity: 80 },
      });

      const result = await service.recordMovement({
        productId: mockProductId,
        movementType: MovementType.ADJUSTMENT,
        quantity: 30,
        isAdjustmentDecrement: true,
        referenceTable: 'inventory_adjustments',
        referenceId: mockReferenceId,
        performedById: mockUserId,
      });

      expect(result.deltaQuantity).toBe(-30);
    });

    it('should throw BadRequestException if ADJUSTMENT decrement exceeds stock (RN-004A)', async () => {
      prisma.inventoryMovement.aggregate.mockResolvedValue({
        _sum: { deltaQuantity: 20 },
      });

      await expect(
        service.recordMovement({
          productId: mockProductId,
          movementType: MovementType.ADJUSTMENT,
          quantity: 50,
          isAdjustmentDecrement: true,
          referenceTable: 'inventory_adjustments',
          referenceId: mockReferenceId,
          performedById: mockUserId,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if quantity is negative or zero', async () => {
      await expect(
        service.recordMovement({
          productId: mockProductId,
          movementType: MovementType.PRODUCTION,
          quantity: 0,
          referenceTable: 'daily_productions',
          referenceId: mockReferenceId,
          performedById: mockUserId,
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.recordMovement({
          productId: mockProductId,
          movementType: MovementType.PRODUCTION,
          quantity: -10,
          referenceTable: 'daily_productions',
          referenceId: mockReferenceId,
          performedById: mockUserId,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if product does not exist', async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(
        service.recordMovement({
          productId: 'non-existent-product',
          movementType: MovementType.PRODUCTION,
          quantity: 100,
          referenceTable: 'daily_productions',
          referenceId: mockReferenceId,
          performedById: mockUserId,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getAvailableStock (RN-010 Delta Aggregation)', () => {
    it('should sum all deltaQuantities for product', async () => {
      prisma.inventoryMovement.aggregate.mockResolvedValue({
        _sum: { deltaQuantity: 1250 },
      });

      const stock = await service.getAvailableStock(mockProductId);
      expect(stock).toBe(1250);
      expect(prisma.inventoryMovement.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { productId: mockProductId },
          _sum: { deltaQuantity: true },
        }),
      );
    });

    it('should return 0 if no movements exist for product', async () => {
      prisma.inventoryMovement.aggregate.mockResolvedValue({
        _sum: { deltaQuantity: null },
      });

      const stock = await service.getAvailableStock(mockProductId);
      expect(stock).toBe(0);
    });
  });

  describe('getStockBalance (EP-INV-01 Consolidated Balance)', () => {
    it('should calculate availableStock as produced - dispatched + returned + adjustments', async () => {
      const balance = await service.getStockBalance();
      expect(balance).toHaveLength(1);
      const prodStock = balance[0];
      expect(prodStock.productId).toBe(mockProductId);
      expect(prodStock.producedQuantity).toBe(500);
      expect(prodStock.dispatchedQuantity).toBe(400);
      // Available = 500 - 400 = 100
      expect(prodStock.availableStock).toBe(100);
    });
  });

  describe('getKardexMovements (EP-INV-02 Read-Only Kardex)', () => {
    it('should return paginated list of movements with details', async () => {
      const result = await service.getKardexMovements({ page: 1, limit: 10 });
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].movementType).toBe(MovementType.PRODUCTION);
      expect(result.data[0].product.dimensions).toBe('45x48');
      expect(result.meta.total).toBe(1);
    });
  });

  describe('Immutability & Domain Boundary Verification', () => {
    it('should NOT have updateMovement or deleteMovement methods (strictly append-only)', () => {
      expect((service as any).updateMovement).toBeUndefined();
      expect((service as any).deleteMovement).toBeUndefined();
      expect((service as any).removeMovement).toBeUndefined();
    });
  });
});
