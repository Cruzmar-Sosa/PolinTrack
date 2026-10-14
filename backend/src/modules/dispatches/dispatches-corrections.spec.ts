import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { MovementType, CorrectionModule, DispatchStatus, Prisma } from '@prisma/client';
import { DispatchesService } from './dispatches.service';

describe('DispatchesService - Quantity Corrections', () => {
  let service: DispatchesService;
  let prismaMock: any;
  let ledgerMock: any;

  const mockUserId = '8f02fd0b-a581-486d-8b05-6d1f641688f3';
  const mockDispatchId = 'dsp-uuid-1';
  const mockLine1Id = 'line-uuid-1';
  const mockProductId = 'prod-uuid-1';

  const mockDispatch = {
    id: mockDispatchId,
    invoiceNumber: 'F-1025',
    dispatchDate: new Date('2026-10-13'),
    status: DispatchStatus.COMPLETED,
    clientCenter: { name: 'Planta 5' },
    dispatchDetails: [
      {
        id: mockLine1Id,
        dispatchHeaderId: mockDispatchId,
        productId: mockProductId,
        quantityDispatched: 500,
        dimensions: '45x48',
        quantityReturnedAccumulated: 50,
        product: { id: mockProductId, name: 'Polín 45x48', dimensions: '45x48' },
        dailyProduction: { productionLot: 'LT-131026-W42' },
      },
    ],
    returnHeaders: [],
  };

  beforeEach(() => {
    ledgerMock = {
      getAvailableStock: jest.fn().mockResolvedValue(100),
    };

    prismaMock = {
      $transaction: jest.fn((callback) => callback(prismaMock)),
      dispatchHeader: {
        findUnique: jest.fn().mockImplementation(({ where: { id } }) => {
          if (id === mockDispatchId) return Promise.resolve(mockDispatch);
          return Promise.resolve(null);
        }),
      },
      dispatchDetail: {
        update: jest.fn().mockResolvedValue({ id: mockLine1Id, quantityDispatched: 520 }),
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

    service = new DispatchesService(prismaMock as any, ledgerMock as any);
  });

  it('should successfully correct dispatch with increment and compensatory decrement in ledger', async () => {
    // Increasing from 500 to 520 (+20 pieces dispatched -> warehouse decreases -20)
    const dto = {
      reason: 'Ajuste de remisión por discrepancia en conteo final durante carga en muelle',
      items: [{ lineId: mockLine1Id, quantity: 520 }],
    };

    const result = await service.correctQuantity(mockDispatchId, dto, mockUserId);

    expect(result.success).toBe(true);
    // Compensatory delta in ledger must be -20
    expect(prismaMock.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          movementType: MovementType.CORRECTION,
          deltaQuantity: -20,
          productId: mockProductId,
          referenceTable: 'dispatch_headers',
          referenceId: mockDispatchId,
        }),
      }),
    );
    expect(prismaMock.dispatchDetail.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: mockLine1Id },
        data: { quantityDispatched: 520 },
      }),
    );
    expect(prismaMock.quantityCorrection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          module: CorrectionModule.DISPATCH,
          recordCode: 'F-1025',
        }),
      }),
    );
  });

  it('should successfully reclassify dispatch product from 45x48 to 45x47 and create two compensatory movements (+prev on old, -new on target)', async () => {
    // Dispatch has 0 accumulated returns for product change test
    prismaMock.dispatchHeader.findUnique.mockResolvedValue({
      ...mockDispatch,
      dispatchDetails: [
        {
          ...mockDispatch.dispatchDetails[0],
          quantityReturnedAccumulated: 0,
        },
      ],
    });
    // Target product stock is 120 (ample for 50 pieces)
    ledgerMock.getAvailableStock.mockResolvedValue(120);

    const dto = {
      reason: 'Corrección de tipificación: se despachó físicamente 45x47 en lugar de 45x48 según verificación de remisión',
      items: [
        {
          lineId: mockLine1Id,
          productId: 'prod-uuid-2',
          quantity: 50,
        },
      ],
    };

    const result = await service.correctQuantity(mockDispatchId, dto, mockUserId);

    expect(result.success).toBe(true);

    // Movement 1: Restitute 500 pieces of old product (prod-uuid-1) back to warehouse
    expect(prismaMock.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          movementType: MovementType.CORRECTION,
          productId: mockProductId,
          deltaQuantity: 500, // +500 restores stock
          referenceTable: 'dispatch_headers',
          referenceId: mockDispatchId,
        }),
      }),
    );

    // Movement 2: Deduct 50 pieces of target product (prod-uuid-2) from warehouse
    expect(prismaMock.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          movementType: MovementType.CORRECTION,
          productId: 'prod-uuid-2',
          deltaQuantity: -50, // -50 deducts stock
          referenceTable: 'dispatch_headers',
          referenceId: mockDispatchId,
        }),
      }),
    );

    // Verify dispatchDetail updated with new product, dimensions, and quantity
    expect(prismaMock.dispatchDetail.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: mockLine1Id },
        data: {
          productId: 'prod-uuid-2',
          dimensions: '45x47',
          quantityDispatched: 50,
        },
      }),
    );

    // Verify metadata in quantityCorrection
    expect(prismaMock.quantityCorrection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          module: CorrectionModule.DISPATCH,
          recordCode: 'F-1025',
          metadata: expect.objectContaining({
            productReclassifications: expect.arrayContaining([
              expect.objectContaining({
                previousProductId: mockProductId,
                newProductId: 'prod-uuid-2',
                previousQuantity: 500,
                newQuantity: 50,
              }),
            ]),
          }),
        }),
      }),
    );
  });

  it('should block product reclassification in dispatch if line has accumulated returns > 0', async () => {
    // mockDispatch has quantityReturnedAccumulated = 50
    const dto = {
      reason: 'Intento de cambio de medida en despacho con devoluciones comerciales acumuladas',
      items: [
        {
          lineId: mockLine1Id,
          productId: 'prod-uuid-2',
          quantity: 50,
        },
      ],
    };

    await expect(
      service.correctQuantity(mockDispatchId, dto, mockUserId),
    ).rejects.toThrow(BadRequestException);
  });

  it('should block product reclassification in dispatch if target product has insufficient stock', async () => {
    prismaMock.dispatchHeader.findUnique.mockResolvedValue({
      ...mockDispatch,
      dispatchDetails: [
        {
          ...mockDispatch.dispatchDetails[0],
          quantityReturnedAccumulated: 0,
        },
      ],
    });
    // Target product stock is only 20, but attempting to dispatch 50
    ledgerMock.getAvailableStock.mockResolvedValue(20);

    const dto = {
      reason: 'Intento de reasignar a medida sin existencias suficientes en bodega',
      items: [
        {
          lineId: mockLine1Id,
          productId: 'prod-uuid-2',
          quantity: 50,
        },
      ],
    };

    await expect(
      service.correctQuantity(mockDispatchId, dto, mockUserId),
    ).rejects.toThrow(BadRequestException);
  });

  it('should successfully correct dispatch with decrement and compensatory increment in ledger', async () => {
    // Decreasing from 500 to 450 (-50 pieces dispatched -> warehouse increases +50)
    const dto = {
      reason: 'Piezas devueltas inmediatamente antes de la salida del camión de planta',
      items: [{ lineId: mockLine1Id, quantity: 450 }],
    };

    const result = await service.correctQuantity(mockDispatchId, dto, mockUserId);

    expect(result.success).toBe(true);
    // Compensatory delta in ledger must be +50
    expect(prismaMock.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          movementType: MovementType.CORRECTION,
          deltaQuantity: 50,
          productId: mockProductId,
        }),
      }),
    );
  });

  it('should block reduction below already accumulated returns', async () => {
    // Accumulated returns is 50. Reducing dispatch to 40 must fail.
    const dto = {
      reason: 'Intento de reducir despacho por debajo de lo ya devuelto',
      items: [{ lineId: mockLine1Id, quantity: 40 }],
    };

    await expect(
      service.correctQuantity(mockDispatchId, dto, mockUserId),
    ).rejects.toThrow(BadRequestException);
  });

  it('should block increment when stock in warehouse is insufficient', async () => {
    // Warehouse stock is 100. Attempting to increment dispatch by 150 (from 500 to 650) must fail.
    ledgerMock.getAvailableStock.mockResolvedValue(100);

    const dto = {
      reason: 'Incremento de despacho sin existencias suficientes en almacén',
      items: [{ lineId: mockLine1Id, quantity: 650 }],
    };

    await expect(
      service.correctQuantity(mockDispatchId, dto, mockUserId),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject correction if dispatch has RETURNED_TOTAL status', async () => {
    prismaMock.dispatchHeader.findUnique.mockResolvedValue({
      ...mockDispatch,
      status: DispatchStatus.RETURNED_TOTAL,
    });

    const dto = {
      reason: 'Intento de modificar un despacho con devolución total',
      items: [{ lineId: mockLine1Id, quantity: 400 }],
    };

    await expect(
      service.correctQuantity(mockDispatchId, dto, mockUserId),
    ).rejects.toThrow(BadRequestException);
  });

  it('should return complete dispatch correction context with active products and available stock', async () => {
    const context = await service.getCorrectionContext(mockDispatchId);

    expect(context.success).toBe(true);
    expect(context.data.id).toBe(mockDispatchId);
    expect(context.data.products).toHaveLength(2);
    expect(context.data.products[0]).toHaveProperty('availableStock');
    expect(context.data.lines).toHaveLength(1);
    expect(context.data.lines[0].minimumAllowedQuantity).toBe(50); // 50 accumulated returns
  });

  it('should reject correction when no actual changes are detected in quantity or product', async () => {
    const dto = {
      reason: 'Sin cambios reales en despacho comercial',
      items: [{ lineId: mockLine1Id, productId: mockProductId, quantity: 500 }],
    };

    await expect(
      service.correctQuantity(mockDispatchId, dto, mockUserId),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject if idempotency key was previously used for a different record', async () => {
    prismaMock.quantityCorrection.findUnique.mockResolvedValue({
      id: 'existing-corr-id',
      recordId: 'different-dispatch-id', // mismatch
      idempotencyKey: 'reused-dsp-key',
    });

    const dto = {
      idempotencyKey: 'reused-dsp-key',
      reason: 'Intento de reutilización de clave con otro despacho',
      items: [{ lineId: mockLine1Id, quantity: 510 }],
    };

    await expect(
      service.correctQuantity(mockDispatchId, dto, mockUserId),
    ).rejects.toThrow(ConflictException);
  });
});
