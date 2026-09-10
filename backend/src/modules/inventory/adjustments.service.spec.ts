import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdjustmentsService } from './adjustments.service';
import { PrismaService } from '../../database/prisma.service';
import { InventoryLedgerService } from './inventory-ledger.service';
import { AdjustmentType, MovementType, ReasonType } from '@prisma/client';

describe('AdjustmentsService', () => {
  let service: AdjustmentsService;
  let prisma: any;
  let ledgerService: any;

  const mockAdminUser = {
    id: 'admin-uuid-1',
    email: 'admin@polintrack.com',
    role: 'ADMIN',
  };

  const mockProduct = {
    id: 'prod-uuid-1',
    name: 'Polín Industrial 3x3x8',
    dimensions: '3" x 3" x 8\'',
  };

  const validIncrementDto = {
    productId: 'prod-uuid-1',
    adjustmentType: AdjustmentType.INCREMENT,
    quantity: 50,
    reasonType: ReasonType.ERROR_INGRESO,
    reasonNotes: 'Conteo físico en patio detectó 50 piezas adicionales',
  };

  const validDecrementDto = {
    productId: 'prod-uuid-1',
    adjustmentType: AdjustmentType.DECREMENT,
    quantity: 30,
    reasonType: ReasonType.CUSTOM,
    reasonNotes: 'Descarte físico por daño biológico severo en patio',
  };

  beforeEach(async () => {
    prisma = {
      product: {
        findUnique: jest.fn(),
      },
      inventoryAdjustment: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn((callback) => callback(prisma)),
    };

    ledgerService = {
      getAvailableStock: jest.fn(),
      recordMovement: jest.fn().mockResolvedValue({ id: 'mov-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdjustmentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: InventoryLedgerService, useValue: ledgerService },
      ],
    }).compile();

    service = module.get<AdjustmentsService>(AdjustmentsService);
  });

  describe('create - Validaciones Previas', () => {
    it('debe rechazar si el producto no existe en el catálogo (404 Not Found)', async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(service.create(validIncrementDto, mockAdminUser)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.create(validIncrementDto, mockAdminUser)).rejects.toThrow(
        /no existe en el catálogo/,
      );
    });

    it('debe rechazar si reasonType es CUSTOM y reasonNotes no tiene al menos 10 caracteres (FA-03 / 400 Bad Request)', async () => {
      prisma.product.findUnique.mockResolvedValue(mockProduct);

      const invalidCustomDto = {
        ...validDecrementDto,
        reasonNotes: 'corto', // menos de 10 caracteres
      };

      await expect(service.create(invalidCustomDto, mockAdminUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(invalidCustomDto, mockAdminUser)).rejects.toThrow(
        /mínimo 10 caracteres/,
      );
    });
  });

  describe('create - Regla de Stock No Negativo (FA-02)', () => {
    it('debe rechazar si un decremento excede el stock disponible actual (400 Bad Request)', async () => {
      prisma.product.findUnique.mockResolvedValue(mockProduct);
      // Stock actual en ledger = 20 piezas
      ledgerService.getAvailableStock.mockResolvedValue(20);

      // Solicitamos decrementar 30 (20 - 30 = -10 < 0)
      await expect(service.create(validDecrementDto, mockAdminUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(validDecrementDto, mockAdminUser)).rejects.toThrow(
        /no puede dejar el stock del producto en negativo/,
      );
    });
  });

  describe('create - Flujo Exitoso, Ledger, Snapshots y Auditoría', () => {
    it('debe ejecutar un ajuste INCREMENT (+N), registrar previousStock y newStock, emitir movimiento y auditoría', async () => {
      prisma.product.findUnique.mockResolvedValue(mockProduct);
      ledgerService.getAvailableStock.mockResolvedValue(100);

      const mockAdjustment = {
        id: 'adj-uuid-1',
        productId: 'prod-uuid-1',
        adjustmentType: AdjustmentType.INCREMENT,
        quantity: 50,
        previousStock: 100,
        newStock: 150,
        reasonType: ReasonType.ERROR_INGRESO,
        reasonNotes: validIncrementDto.reasonNotes,
        executedById: mockAdminUser.id,
      };

      prisma.inventoryAdjustment.create.mockResolvedValue(mockAdjustment);
      prisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });

      jest.spyOn(service, 'findOne').mockResolvedValue({
        success: true,
        data: {
          ...mockAdjustment,
          product: mockProduct,
          executedBy: mockAdminUser,
        } as any,
      });

      const result = await service.create(validIncrementDto, mockAdminUser);

      expect(result.success).toBe(true);

      // Verificación de bloqueo pesimista
      expect(prisma.$queryRaw).toHaveBeenCalled();

      // Verificación de snapshots fotográficos (RN-004A)
      expect(prisma.inventoryAdjustment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          productId: 'prod-uuid-1',
          adjustmentType: AdjustmentType.INCREMENT,
          quantity: 50,
          previousStock: 100,
          newStock: 150,
          executedById: mockAdminUser.id,
        }),
      });

      // Verificación de emisión de movimiento en el ledger append-only (RN-010)
      expect(ledgerService.recordMovement).toHaveBeenCalledWith(
        {
          productId: 'prod-uuid-1',
          movementType: MovementType.ADJUSTMENT,
          quantity: 50,
          isAdjustmentDecrement: false,
          referenceTable: 'inventory_adjustments',
          referenceId: 'adj-uuid-1',
          performedById: mockAdminUser.id,
        },
        prisma,
      );

      // Verificación de AuditLog
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: mockAdminUser.id,
          action: 'CREATE',
          tableName: 'inventory_adjustments',
          recordId: 'adj-uuid-1',
        }),
      });
    });

    it('debe ejecutar un ajuste DECREMENT (-N), registrar previousStock y newStock, emitir movimiento y auditoría', async () => {
      prisma.product.findUnique.mockResolvedValue(mockProduct);
      ledgerService.getAvailableStock.mockResolvedValue(100);

      const mockAdjustment = {
        id: 'adj-uuid-2',
        productId: 'prod-uuid-1',
        adjustmentType: AdjustmentType.DECREMENT,
        quantity: 30,
        previousStock: 100,
        newStock: 70,
        reasonType: ReasonType.CUSTOM,
        reasonNotes: validDecrementDto.reasonNotes,
        executedById: mockAdminUser.id,
      };

      prisma.inventoryAdjustment.create.mockResolvedValue(mockAdjustment);
      prisma.auditLog.create.mockResolvedValue({ id: 'audit-2' });

      jest.spyOn(service, 'findOne').mockResolvedValue({
        success: true,
        data: {
          ...mockAdjustment,
          product: mockProduct,
          executedBy: mockAdminUser,
        } as any,
      });

      const result = await service.create(validDecrementDto, mockAdminUser);

      expect(result.success).toBe(true);

      // Verificación de snapshots fotográficos (RN-004A)
      expect(prisma.inventoryAdjustment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          productId: 'prod-uuid-1',
          adjustmentType: AdjustmentType.DECREMENT,
          quantity: 30,
          previousStock: 100,
          newStock: 70,
          executedById: mockAdminUser.id,
        }),
      });

      // Verificación de emisión de movimiento con isAdjustmentDecrement: true
      expect(ledgerService.recordMovement).toHaveBeenCalledWith(
        {
          productId: 'prod-uuid-1',
          movementType: MovementType.ADJUSTMENT,
          quantity: 30,
          isAdjustmentDecrement: true,
          referenceTable: 'inventory_adjustments',
          referenceId: 'adj-uuid-2',
          performedById: mockAdminUser.id,
        },
        prisma,
      );
    });
  });

  describe('TSK-ADJ-DELTA — Soporte de Valores Negativos y Delta Directo (Casos Canónicos)', () => {
    beforeEach(() => {
      prisma.product.findUnique.mockResolvedValue(mockProduct);
      prisma.inventoryAdjustment.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'adj-test-id', ...data }),
      );
      prisma.auditLog.create.mockResolvedValue({ id: 'audit-test-id' });
      jest.spyOn(service, 'findOne').mockImplementation((id: string) =>
        Promise.resolve({
          success: true,
          data: { id, productId: 'prod-uuid-1' } as any,
        }),
      );
    });

    // Test 1: Ajuste con valor negativo válido (ej. -50 sobre 350 -> newStock = 300)
    it('Test 1: debe procesar ajuste con valor negativo válido (-50 sobre 350 -> newStock = 300)', async () => {
      ledgerService.getAvailableStock.mockResolvedValue(350);

      const dto = {
        productId: 'prod-uuid-1',
        adjustmentType: AdjustmentType.DECREMENT,
        quantity: -50,
        reasonType: ReasonType.ERROR_INGRESO,
      };

      const result = await service.create(dto as any, mockAdminUser);
      expect(result.success).toBe(true);

      expect(prisma.inventoryAdjustment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          adjustmentType: AdjustmentType.DECREMENT,
          quantity: 50,
          previousStock: 350,
          newStock: 300,
        }),
      });

      expect(ledgerService.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          quantity: 50,
          isAdjustmentDecrement: true,
        }),
        prisma,
      );
    });

    // Test 2: Ajuste que lleva el stock exactamente a 0 (ej. -350 sobre 350 -> newStock = 0)
    it('Test 2: debe permitir ajuste que lleva el patio exactamente a cero (-350 sobre 350 -> newStock = 0)', async () => {
      ledgerService.getAvailableStock.mockResolvedValue(350);

      const dto = {
        productId: 'prod-uuid-1',
        adjustmentType: AdjustmentType.DECREMENT,
        quantity: -350,
        reasonType: ReasonType.ERROR_INGRESO,
      };

      const result = await service.create(dto as any, mockAdminUser);
      expect(result.success).toBe(true);

      expect(prisma.inventoryAdjustment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          adjustmentType: AdjustmentType.DECREMENT,
          quantity: 350,
          previousStock: 350,
          newStock: 0,
        }),
      });
    });

    // Test 3: Rechazo si el ajuste genera saldo negativo (ej. -351 sobre 350 -> 400 Bad Request)
    it('Test 3: debe rechazar con 400 Bad Request si el ajuste genera saldo negativo (-351 sobre 350 -> -1)', async () => {
      ledgerService.getAvailableStock.mockResolvedValue(350);

      const dto = {
        productId: 'prod-uuid-1',
        adjustmentType: AdjustmentType.DECREMENT,
        quantity: -351,
        reasonType: ReasonType.ERROR_INGRESO,
      };

      await expect(service.create(dto as any, mockAdminUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(dto as any, mockAdminUser)).rejects.toThrow(
        /Stock insuficiente.*decremento solicitado: 351|no puede dejar el stock/i,
      );
    });

    // Test 4: Ajuste positivo directo (ej. 50 sobre 350 -> newStock = 400)
    it('Test 4: debe procesar ajuste positivo directo (50 sobre 350 -> newStock = 400)', async () => {
      ledgerService.getAvailableStock.mockResolvedValue(350);

      const dto = {
        productId: 'prod-uuid-1',
        adjustmentType: AdjustmentType.INCREMENT,
        quantity: 50,
        reasonType: ReasonType.ERROR_INGRESO,
      };

      const result = await service.create(dto as any, mockAdminUser);
      expect(result.success).toBe(true);

      expect(prisma.inventoryAdjustment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          adjustmentType: AdjustmentType.INCREMENT,
          quantity: 50,
          previousStock: 350,
          newStock: 400,
        }),
      });
    });

    // Test 5: Prevención de doble negación si quantity es negativo y type es DECREMENT (--50 -> +50)
    it('Test 5: debe evitar error de doble negación cuando quantity es negativo (-50 no debe sumar)', async () => {
      ledgerService.getAvailableStock.mockResolvedValue(350);

      const dto = {
        productId: 'prod-uuid-1',
        adjustmentType: AdjustmentType.DECREMENT,
        quantity: -50,
        reasonType: ReasonType.ERROR_INGRESO,
      };

      await service.create(dto as any, mockAdminUser);

      expect(prisma.inventoryAdjustment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          previousStock: 350,
          newStock: 300, // Nunca 400
        }),
      });
    });
  });

  describe('findAll - Consultas paginadas', () => {
    it('debe listar ajustes paginados', async () => {
      prisma.inventoryAdjustment.count.mockResolvedValue(1);
      prisma.inventoryAdjustment.findMany.mockResolvedValue([
        {
          id: 'adj-1',
          quantity: 50,
          previousStock: 100,
          newStock: 150,
        },
      ]);

      const result = await service.findAll({ page: 1, limit: 10 });
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('findOne - Consulta por ID', () => {
    it('debe lanzar NotFoundException si el ajuste no existe', async () => {
      prisma.inventoryAdjustment.findUnique.mockResolvedValue(null);

      await expect(service.findOne('non-existent-uuid')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('Inmutabilidad (RN-001)', () => {
    it('no debe exponer métodos de actualización ni eliminación sobre Ajustes (PUT/PATCH/DELETE prohibidos)', () => {
      expect((service as any).update).toBeUndefined();
      expect((service as any).patch).toBeUndefined();
      expect((service as any).delete).toBeUndefined();
      expect((service as any).remove).toBeUndefined();
    });
  });
});
