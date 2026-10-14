import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { MovementType, CorrectionModule, Prisma } from '@prisma/client';
import { DailyProductionService } from './daily-production.service';

describe('DailyProductionService - Quantity Corrections', () => {
  let service: DailyProductionService;
  let prismaMock: any;
  let ledgerMock: any;

  const mockUserId = '8f02fd0b-a581-486d-8b05-6d1f641688f3';
  const mockProdId = '7b02fd0b-a581-486d-8b05-6d1f641688f2';
  const mockLine1Id = 'line-uuid-1';
  const mockProductId = 'prod-uuid-1';

  const mockProduction = {
    id: mockProdId,
    productionLot: 'LT-131026-W42',
    productionDate: new Date('2026-10-13'),
    isoWeek: 42,
    quantityProduced: 200,
    isInitialInventory: false,
    productionDetails: [
      {
        id: mockLine1Id,
        dailyProductionId: mockProdId,
        productId: mockProductId,
        quantityProduced: 200,
        product: { id: mockProductId, name: 'Polín 45x48', dimensions: '45x48' },
      },
    ],
  };

  beforeEach(() => {
    ledgerMock = {
      getAvailableStock: jest.fn().mockResolvedValue(500),
    };

    prismaMock = {
      $transaction: jest.fn((callback) => callback(prismaMock)),
      dailyProduction: {
        findUnique: jest.fn().mockImplementation(({ where: { id } }) => {
          if (id === mockProdId) return Promise.resolve(mockProduction);
          return Promise.resolve(null);
        }),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ ...mockProduction, ...data }),
        ),
      },
      productionDetail: {
        findMany: jest.fn().mockResolvedValue([
          { id: mockLine1Id, quantityProduced: 180 },
        ]),
        update: jest.fn().mockResolvedValue({ id: mockLine1Id, quantityProduced: 180 }),
      },
      fumigationDetail: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { quantityFumigated: 50 },
        }),
      },
      dispatchDetail: {
        findMany: jest.fn().mockResolvedValue([
          {
            quantityDispatched: 100,
            returnDetails: [{ quantityReturned: 10 }], // net dispatched: 90
          },
        ]),
      },
      inventoryMovement: {
        create: jest.fn().mockResolvedValue({ id: 'mov-corr-1' }),
      },
      quantityCorrection: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: 'corr-uuid-1', ...data }),
        ),
        findMany: jest.fn().mockResolvedValue([]),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-uuid-1' }),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([
          { id: mockProductId, name: 'Polín 45x48', dimensions: '45x48' },
          { id: 'prod-uuid-2', name: 'Polín 45x47', dimensions: '45x47' },
        ]),
        findUnique: jest.fn().mockImplementation(({ where: { id } }) => {
          if (id === 'prod-uuid-2') {
            return Promise.resolve({
              id: 'prod-uuid-2',
              name: 'Polín 45x47',
              dimensions: '45x47',
              isActive: true,
            });
          }
          if (id === mockProductId) {
            return Promise.resolve({
              id: mockProductId,
              name: 'Polín 45x48',
              dimensions: '45x48',
              isActive: true,
            });
          }
          return Promise.resolve(null);
        }),
      },
    };

    service = new DailyProductionService(prismaMock as any, ledgerMock as any);
  });

  it('should successfully correct production quantity within allowed boundaries', async () => {
    const dto = {
      reason: 'Ajuste tras recuento de piezas defectuosas retiradas de estiba',
      items: [{ lineId: mockLine1Id, quantity: 180 }],
    };

    const result = await service.correctQuantity(mockProdId, dto, mockUserId);

    expect(result.success).toBe(true);
    expect(result.data.quantityProduced).toBe(180);
    // Verified compensatory movement created with delta -20
    expect(prismaMock.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          movementType: MovementType.CORRECTION,
          deltaQuantity: -20,
          productId: mockProductId,
          referenceTable: 'daily_productions',
          referenceId: mockProdId,
        }),
      }),
    );
    expect(prismaMock.quantityCorrection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          module: CorrectionModule.DAILY_PRODUCTION,
          recordCode: 'LT-131026-W42',
        }),
      }),
    );
  });

  it('should successfully reclassify product measure from 45x48 to 45x47 and create two compensatory movements', async () => {
    // When reclassifying product, outgoing product must not have fumigations or net dispatches in that lote
    prismaMock.fumigationDetail.aggregate.mockResolvedValue({
      _sum: { quantityFumigated: 0 },
    });
    prismaMock.dispatchDetail.findMany.mockResolvedValue([]);
    prismaMock.productionDetail.findMany.mockResolvedValue([
      { id: mockLine1Id, productId: 'prod-uuid-2', quantityProduced: 100 },
    ]);

    const dto = {
      reason: 'Corrección de tipificación de medida de polín en aserrío según verificación física',
      items: [
        {
          lineId: mockLine1Id,
          productId: 'prod-uuid-2',
          quantity: 100,
        },
      ],
    };

    const result = await service.correctQuantity(mockProdId, dto, mockUserId);

    expect(result.success).toBe(true);

    // Verify 2 compensatory movements created in ledger
    // Movement 1: Deduct 200 from outgoing product (prod-uuid-1)
    expect(prismaMock.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          movementType: MovementType.CORRECTION,
          productId: mockProductId,
          deltaQuantity: -200,
          referenceTable: 'daily_productions',
          referenceId: mockProdId,
        }),
      }),
    );

    // Movement 2: Add 100 to incoming product (prod-uuid-2)
    expect(prismaMock.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          movementType: MovementType.CORRECTION,
          productId: 'prod-uuid-2',
          deltaQuantity: 100,
          referenceTable: 'daily_productions',
          referenceId: mockProdId,
        }),
      }),
    );

    // Verify production line was updated with new productId
    expect(prismaMock.productionDetail.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: mockLine1Id },
        data: {
          productId: 'prod-uuid-2',
          quantityProduced: 100,
        },
      }),
    );

    // Verify quantityCorrection created with productReclassifications metadata
    expect(prismaMock.quantityCorrection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          module: CorrectionModule.DAILY_PRODUCTION,
          recordCode: 'LT-131026-W42',
          metadata: expect.objectContaining({
            productReclassifications: expect.arrayContaining([
              expect.objectContaining({
                previousProductId: mockProductId,
                newProductId: 'prod-uuid-2',
                previousQuantity: 200,
                newQuantity: 100,
              }),
            ]),
          }),
        }),
      }),
    );
  });

  it('should block product reclassification if original product has active fumigations', async () => {
    // Original product has 50 fumigated pieces
    prismaMock.fumigationDetail.aggregate.mockResolvedValue({
      _sum: { quantityFumigated: 50 },
    });

    const dto = {
      reason: 'Intento de cambio de medida con fumigaciones vigentes',
      items: [
        {
          lineId: mockLine1Id,
          productId: 'prod-uuid-2',
          quantity: 200,
        },
      ],
    };

    await expect(
      service.correctQuantity(mockProdId, dto, mockUserId),
    ).rejects.toThrow(BadRequestException);
  });

  it('should block product reclassification if original product has committed dispatches', async () => {
    prismaMock.fumigationDetail.aggregate.mockResolvedValue({
      _sum: { quantityFumigated: 0 },
    });
    prismaMock.dispatchDetail.findMany.mockResolvedValue([
      {
        quantityDispatched: 50,
        returnDetails: [],
      },
    ]);

    const dto = {
      reason: 'Intento de cambio de medida con despachos comerciales vigentes',
      items: [
        {
          lineId: mockLine1Id,
          productId: 'prod-uuid-2',
          quantity: 200,
        },
      ],
    };

    await expect(
      service.correctQuantity(mockProdId, dto, mockUserId),
    ).rejects.toThrow(BadRequestException);
  });

  it('should block product reclassification if stock of original product is insufficient to deduct', async () => {
    prismaMock.fumigationDetail.aggregate.mockResolvedValue({
      _sum: { quantityFumigated: 0 },
    });
    prismaMock.dispatchDetail.findMany.mockResolvedValue([]);
    // Warehouse stock of outgoing product is only 50 (cannot withdraw 200)
    ledgerMock.getAvailableStock.mockResolvedValue(50);

    const dto = {
      reason: 'Intento de cambio de medida sin stock suficiente para descontar en bodega',
      items: [
        {
          lineId: mockLine1Id,
          productId: 'prod-uuid-2',
          quantity: 200,
        },
      ],
    };

    await expect(
      service.correctQuantity(mockProdId, dto, mockUserId),
    ).rejects.toThrow(BadRequestException);
  });

  it('should block reduction below already fumigated pieces', async () => {
    // totalFumigated is 50. Reducing to 40 must fail.
    const dto = {
      reason: 'Intento de reducir por debajo de piezas fumigadas',
      items: [{ lineId: mockLine1Id, quantity: 40 }],
    };

    await expect(
      service.correctQuantity(mockProdId, dto, mockUserId),
    ).rejects.toThrow(BadRequestException);
  });

  it('should block reduction below net committed dispatches', async () => {
    // netDispatched is 90 (100 - 10). Reducing to 80 must fail.
    const dto = {
      reason: 'Intento de reducir por debajo de despachos netos',
      items: [{ lineId: mockLine1Id, quantity: 80 }],
    };

    await expect(
      service.correctQuantity(mockProdId, dto, mockUserId),
    ).rejects.toThrow(BadRequestException);
  });

  it('should block reduction if current available stock is insufficient', async () => {
    // Current stock is only 5. Trying to reduce by 20 (from 200 to 180) must fail.
    ledgerMock.getAvailableStock.mockResolvedValue(5);

    const dto = {
      reason: 'Ajuste de producción cuando ya no hay stock en bodega',
      items: [{ lineId: mockLine1Id, quantity: 180 }],
    };

    await expect(
      service.correctQuantity(mockProdId, dto, mockUserId),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject correction if production is an initial inventory record', async () => {
    prismaMock.dailyProduction.findUnique.mockResolvedValue({
      ...mockProduction,
      isInitialInventory: true,
    });

    const dto = {
      reason: 'Intento de corrección sobre inventario inicial baseline',
      items: [{ lineId: mockLine1Id, quantity: 180 }],
    };

    await expect(
      service.correctQuantity(mockProdId, dto, mockUserId),
    ).rejects.toThrow(BadRequestException);
  });

  it('should return complete correction context with catalog products and available stock', async () => {
    const context = await service.getCorrectionContext(mockProdId);

    expect(context.success).toBe(true);
    expect(context.data.id).toBe(mockProdId);
    expect(context.data.products).toHaveLength(2);
    expect(context.data.products[0]).toHaveProperty('availableStock');
    expect(context.data.lines).toHaveLength(1);
    expect(context.data.lines[0].minimumAllowedQuantity).toBe(90); // max(50 fumigated, 90 net dispatched)
  });

  it('should reject correction when no actual changes are detected in quantity or product', async () => {
    const dto = {
      reason: 'Sin cambios reales en cantidad ni medida producida',
      items: [{ lineId: mockLine1Id, productId: mockProductId, quantity: 200 }],
    };

    await expect(
      service.correctQuantity(mockProdId, dto, mockUserId),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject if idempotency key was previously used for a different record', async () => {
    prismaMock.quantityCorrection.findUnique.mockResolvedValue({
      id: 'existing-corr-id',
      recordId: 'different-prod-id', // mismatch
      idempotencyKey: 'reused-key',
    });

    const dto = {
      idempotencyKey: 'reused-key',
      reason: 'Intento de reutilización de clave con otro registro',
      items: [{ lineId: mockLine1Id, quantity: 180 }],
    };

    await expect(
      service.correctQuantity(mockProdId, dto, mockUserId),
    ).rejects.toThrow(ConflictException);
  });

  it('should reject when reclassifying product to a measure that already exists in the same production order', async () => {
    prismaMock.dailyProduction.findUnique.mockResolvedValue({
      ...mockProduction,
      productionDetails: [
        {
          id: mockLine1Id,
          productId: mockProductId,
          quantityProduced: 200,
          product: { id: mockProductId, name: 'Polín 45x48', dimensions: '45x48' },
        },
        {
          id: 'line-uuid-2',
          productId: 'prod-uuid-2',
          quantityProduced: 150,
          product: { id: 'prod-uuid-2', name: 'Polín 45x47', dimensions: '45x47' },
        },
      ],
    });

    const dto = {
      reason: 'Intento de cambiar a una medida que ya existe en la orden',
      items: [{ lineId: mockLine1Id, productId: 'prod-uuid-2', quantity: 200 }],
    };

    await expect(
      service.correctQuantity(mockProdId, dto, mockUserId),
    ).rejects.toThrow(BadRequestException);
  });
});
