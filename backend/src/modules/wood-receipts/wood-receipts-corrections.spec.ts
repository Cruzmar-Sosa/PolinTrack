import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { WoodTypeEnum, CorrectionModule, Prisma } from '@prisma/client';
import { WoodReceiptsService } from './wood-receipts.service';

describe('WoodReceiptsService - Quantity Corrections', () => {
  let service: WoodReceiptsService;
  let prismaMock: any;

  const mockUserId = '8f02fd0b-a581-486d-8b05-6d1f641688f3';
  const mockReceiptId = '9b02fd0b-a581-486d-8b05-6d1f641688f4';

  const mockTimbreReceipt = {
    id: mockReceiptId,
    lotNumber: 'LT-131026-01',
    quantity: new Prisma.Decimal(100.5),
    yugosQuantity: null,
    reglasQuantity: null,
    woodType: { name: WoodTypeEnum.TIMBRE, defaultUnit: 'PIE_TABLAR' },
    species: { name: 'TECA' },
    supplier: { name: 'Maderas El Bosque' },
    productionWoodReceipts: [],
  };

  const mockProcesadaReceipt = {
    id: mockReceiptId,
    lotNumber: 'LT-131026-02',
    quantity: new Prisma.Decimal(150),
    yugosQuantity: 50,
    reglasQuantity: 100,
    woodType: { name: WoodTypeEnum.PROCESADA, defaultUnit: 'PIEZAS' },
    species: { name: 'PINO' },
    supplier: { name: 'Maderas Los Pinos' },
    productionWoodReceipts: [
      { dailyProduction: { productionLot: 'LT-131026-W42' } },
    ],
  };

  beforeEach(() => {
    prismaMock = {
      $transaction: jest.fn((callback) => callback(prismaMock)),
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
      woodReceipt: {
        findUnique: jest.fn().mockImplementation(({ where: { id } }) => {
          if (id === mockReceiptId) return Promise.resolve(mockTimbreReceipt);
          return Promise.resolve(null);
        }),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ ...mockTimbreReceipt, ...data }),
        ),
      },
    };

    service = new WoodReceiptsService(prismaMock as any);
  });

  it('should successfully correct TIMBRE quantity with decimal precision', async () => {
    const dto = {
      reason: 'Ajuste por recubicación en patio verificada con supervisor',
      quantity: 125.75,
    };

    const result = await service.correctQuantity(mockReceiptId, dto, mockUserId);

    expect(result.success).toBe(true);
    expect(prismaMock.woodReceipt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: mockReceiptId },
        data: { quantity: new Prisma.Decimal(125.75) },
      }),
    );
    expect(prismaMock.quantityCorrection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          module: CorrectionModule.WOOD_RECEIPT,
          recordId: mockReceiptId,
          recordCode: 'LT-131026-01',
          reason: dto.reason,
          correctedById: mockUserId,
        }),
      }),
    );
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tableName: 'wood_receipts',
          action: 'CORRECTION',
        }),
      }),
    );
  });

  it('should successfully correct PROCESADA yugos and reglas and derive total on server', async () => {
    prismaMock.woodReceipt.findUnique.mockResolvedValue(mockProcesadaReceipt);
    prismaMock.woodReceipt.update.mockImplementation(({ data }) =>
      Promise.resolve({ ...mockProcesadaReceipt, ...data }),
    );

    const dto = {
      reason: 'Conteo físico rectificado al desembarcar camión de proveedor',
      yugosQuantity: 60,
      reglasQuantity: 120,
    };

    const result = await service.correctQuantity(mockReceiptId, dto, mockUserId);

    expect(result.success).toBe(true);
    // Derived total: 60 + 120 = 180
    expect(prismaMock.woodReceipt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quantity: new Prisma.Decimal(180),
          yugosQuantity: 60,
          reglasQuantity: 120,
        }),
      }),
    );
  });

  it('should reject PROCESADA correction if sum of yugos and reglas is zero', async () => {
    prismaMock.woodReceipt.findUnique.mockResolvedValue(mockProcesadaReceipt);

    const dto = {
      reason: 'Intento de anulación poniendo ceros en desglose',
      yugosQuantity: 0,
      reglasQuantity: 0,
    };

    await expect(
      service.correctQuantity(mockReceiptId, dto, mockUserId),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject correction if reason is generic or insufficient', async () => {
    const dto = {
      reason: 'error de dedo',
      quantity: 110,
    };

    await expect(
      service.correctQuantity(mockReceiptId, dto, mockUserId),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject correction if new quantity is identical to existing quantity', async () => {
    const dto = {
      reason: 'Corrección sin cambios de valores reales en el registro',
      quantity: 100.5,
    };

    await expect(
      service.correctQuantity(mockReceiptId, dto, mockUserId),
    ).rejects.toThrow(BadRequestException);
  });

  it('should support idempotency when idempotencyKey is already recorded', async () => {
    const existingCorrection = {
      id: 'existing-corr-uuid',
      idempotencyKey: 'key-123',
      reason: 'Previo',
    };
    prismaMock.quantityCorrection.findUnique.mockResolvedValue(existingCorrection);

    const dto = {
      idempotencyKey: 'key-123',
      reason: 'Intento repetido por reintento de cliente de red',
      quantity: 120,
    };

    const result = await service.correctQuantity(mockReceiptId, dto, mockUserId);

    expect(result.success).toBe(true);
    expect((result as any).message).toContain('idempotente');
    expect(prismaMock.woodReceipt.update).not.toHaveBeenCalled();
  });

  it('should reject if idempotency key was previously used for a different wood receipt', async () => {
    prismaMock.quantityCorrection.findUnique.mockResolvedValue({
      id: 'existing-corr-uuid',
      recordId: 'other-receipt-id',
      idempotencyKey: 'key-diff',
    });

    const dto = {
      idempotencyKey: 'key-diff',
      reason: 'Intento repetido con clave de otro ingreso de madera',
      quantity: 120,
    };

    await expect(
      service.correctQuantity(mockReceiptId, dto, mockUserId),
    ).rejects.toThrow(ConflictException);
  });

  it('should return correction context including linked productions warning if referenced', async () => {
    prismaMock.woodReceipt.findUnique.mockResolvedValue(mockProcesadaReceipt);

    const context = await service.getCorrectionContext(mockReceiptId);

    expect(context.success).toBe(true);
    expect(context.data.id).toBe(mockReceiptId);
    expect(context.data.linkedProductionsCount).toBe(1);
    expect(context.data.woodTypeName).toBe(WoodTypeEnum.PROCESADA);
  });
});
