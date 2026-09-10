import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DispatchesService } from './dispatches.service';
import { PrismaService } from '../../database/prisma.service';
import { InventoryLedgerService } from '../inventory/inventory-ledger.service';
import { DispatchStatus, MovementType } from '@prisma/client';

describe('DispatchesService', () => {
  let service: DispatchesService;
  let prisma: any;
  let ledgerService: any;

  const mockUser = {
    id: 'user-uuid-1',
    email: 'admin@polintrack.com',
    role: 'ADMIN',
  };

  const mockClientCenter = {
    id: 'center-uuid-1',
    name: 'Planta 2 - Matagalpa',
    location: 'Matagalpa, Nicaragua',
    isActive: true,
  };

  const mockProduct = {
    id: 'prod-uuid-1',
    name: 'Polín Industrial 3x3x8',
    dimensions: '3" x 3" x 8\'',
    isActive: true,
  };

  const mockDailyProduction = {
    id: 'daily-uuid-1',
    productionLot: 'LT-020926-W36',
    productId: 'prod-uuid-1',
    quantityProduced: 100,
    productionDate: new Date('2026-09-02'),
    isoWeek: 36,
  };

  const validDto = {
    invoiceNumber: 'F-90210',
    clientCenterId: 'center-uuid-1',
    dispatchDate: '2026-09-02',
    dispatchTime: '14:30:00',
    vehicleInfo: 'M-12345',
    driverName: 'Carlos Mendoza',
    observations: 'Entrega prioritaria',
    details: [
      {
        productId: 'prod-uuid-1',
        dailyProductionId: 'daily-uuid-1',
        quantityDispatched: 50,
        dimensions: '3" x 3" x 8\'',
      },
    ],
  };

  beforeEach(async () => {
    prisma = {
      dispatchHeader: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
      },
      dispatchDetail: {
        create: jest.fn(),
      },
      clientCenter: {
        findUnique: jest.fn(),
      },
      product: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      dailyProduction: {
        findMany: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn((callback) => callback(prisma)),
    };

    ledgerService = {
      getAvailableStock: jest.fn().mockResolvedValue(100),
      recordMovement: jest.fn().mockResolvedValue({ id: 'mov-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DispatchesService,
        { provide: PrismaService, useValue: prisma },
        { provide: InventoryLedgerService, useValue: ledgerService },
      ],
    }).compile();

    service = module.get<DispatchesService>(DispatchesService);
  });

  describe('create - Validaciones Previas y Unicidad', () => {
    it('debe rechazar la operación si el número de factura ya existe (409 Conflict / FA-02)', async () => {
      prisma.dispatchHeader.findUnique.mockResolvedValue({ id: 'existing-id' });

      await expect(service.create(validDto, mockUser)).rejects.toThrow(ConflictException);
      await expect(service.create(validDto, mockUser)).rejects.toThrow(
        /ya se encuentra registrado/,
      );
    });

    it('debe rechazar la operación si el centro cliente no existe (404 Not Found)', async () => {
      prisma.dispatchHeader.findUnique.mockResolvedValue(null);
      prisma.clientCenter.findUnique.mockResolvedValue(null);

      await expect(service.create(validDto, mockUser)).rejects.toThrow(NotFoundException);
    });

    it('debe rechazar la operación si el centro cliente está inactivo (400 Bad Request)', async () => {
      prisma.dispatchHeader.findUnique.mockResolvedValue(null);
      prisma.clientCenter.findUnique.mockResolvedValue({
        ...mockClientCenter,
        isActive: false,
      });

      await expect(service.create(validDto, mockUser)).rejects.toThrow(BadRequestException);
      await expect(service.create(validDto, mockUser)).rejects.toThrow(/se encuentra inactivo/);
    });

    it('debe rechazar si algún producto en las líneas no existe (404 Not Found)', async () => {
      prisma.dispatchHeader.findUnique.mockResolvedValue(null);
      prisma.clientCenter.findUnique.mockResolvedValue(mockClientCenter);
      prisma.product.findMany.mockResolvedValue([]); // Producto no encontrado

      await expect(service.create(validDto, mockUser)).rejects.toThrow(NotFoundException);
    });

    it('debe rechazar si el dailyProduction no corresponde al producto de la línea (400 Bad Request)', async () => {
      prisma.dispatchHeader.findUnique.mockResolvedValue(null);
      prisma.clientCenter.findUnique.mockResolvedValue(mockClientCenter);
      prisma.product.findMany.mockResolvedValue([mockProduct]);
      prisma.dailyProduction.findMany.mockResolvedValue([
        {
          ...mockDailyProduction,
          productId: 'different-product-uuid',
        },
      ]);

      await expect(service.create(validDto, mockUser)).rejects.toThrow(BadRequestException);
      await expect(service.create(validDto, mockUser)).rejects.toThrow(
        /no corresponde al producto/,
      );
    });
  });

  describe('create - Control de Concurrencia y Validación Estricta de Stock (RN-002)', () => {
    it('debe rechazar la operación si el stock disponible es menor a la cantidad solicitada (RN-002)', async () => {
      prisma.dispatchHeader.findUnique.mockResolvedValue(null);
      prisma.clientCenter.findUnique.mockResolvedValue(mockClientCenter);
      prisma.product.findMany.mockResolvedValue([mockProduct]);
      prisma.dailyProduction.findMany.mockResolvedValue([mockDailyProduction]);

      // Stock disponible = 30, pero solicitamos 50
      ledgerService.getAvailableStock.mockResolvedValue(30);

      await expect(service.create(validDto, mockUser)).rejects.toThrow(BadRequestException);
      await expect(service.create(validDto, mockUser)).rejects.toThrow(
        /Stock insuficiente para despachar el producto/,
      );
    });

    it('debe consolidar la demanda multi-línea del mismo producto y rechazar si la suma excede el stock disponible', async () => {
      prisma.dispatchHeader.findUnique.mockResolvedValue(null);
      prisma.clientCenter.findUnique.mockResolvedValue(mockClientCenter);
      prisma.product.findMany.mockResolvedValue([mockProduct]);
      prisma.dailyProduction.findMany.mockResolvedValue([mockDailyProduction]);

      // Stock disponible = 60
      ledgerService.getAvailableStock.mockResolvedValue(60);

      // Despacho con 2 líneas del mismo producto (40 + 30 = 70 piezas demandadas)
      const multiLineDto = {
        ...validDto,
        details: [
          {
            productId: 'prod-uuid-1',
            dailyProductionId: 'daily-uuid-1',
            quantityDispatched: 40,
            dimensions: '3" x 3" x 8\'',
          },
          {
            productId: 'prod-uuid-1',
            dailyProductionId: 'daily-uuid-1',
            quantityDispatched: 30,
            dimensions: '3" x 3" x 8\'',
          },
        ],
      };

      await expect(service.create(multiLineDto, mockUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(multiLineDto, mockUser)).rejects.toThrow(
        /Solicitado: 70, Disponible actual: 60/,
      );
    });
  });

  describe('create - Flujo Exitoso, Ledger y Auditoría', () => {
    it('debe ejecutar bloqueo pesimista, crear cabecera, detalles, registrar en ledger y auditLog', async () => {
      prisma.dispatchHeader.findUnique.mockResolvedValue(null);
      prisma.clientCenter.findUnique.mockResolvedValue(mockClientCenter);
      prisma.product.findMany.mockResolvedValue([mockProduct]);
      prisma.dailyProduction.findMany.mockResolvedValue([mockDailyProduction]);

      // Stock disponible = 100, solicitamos 50
      ledgerService.getAvailableStock.mockResolvedValue(100);

      const mockHeader = {
        id: 'disp-uuid-1',
        invoiceNumber: 'F-90210',
        dispatchDate: new Date('2026-09-02T00:00:00.000Z'),
        dispatchTime: new Date('1970-01-01T14:30:00.000Z'),
        clientCenterId: mockClientCenter.id,
        status: DispatchStatus.COMPLETED,
        createdById: mockUser.id,
      };

      const mockDetail = {
        id: 'det-uuid-1',
        dispatchHeaderId: 'disp-uuid-1',
        productId: mockProduct.id,
        dailyProductionId: mockDailyProduction.id,
        quantityDispatched: 50,
        dimensions: mockProduct.dimensions,
        quantityReturnedAccumulated: 0,
      };

      prisma.dispatchHeader.create.mockResolvedValue(mockHeader);
      prisma.dispatchDetail.create.mockResolvedValue(mockDetail);
      prisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });

      // Mock para findOne final
      jest.spyOn(service, 'findOne').mockResolvedValue({
        success: true,
        data: {
          ...mockHeader,
          clientCenter: mockClientCenter,
          dispatchDetails: [mockDetail],
        } as any,
      });

      const result = await service.create(validDto, mockUser);

      expect(result.success).toBe(true);

      // Verificación de bloqueo pesimista ordenado
      expect(prisma.$queryRaw).toHaveBeenCalled();

      // Verificación de cabecera y detalle
      expect(prisma.dispatchHeader.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          invoiceNumber: 'F-90210',
          clientCenterId: mockClientCenter.id,
          status: DispatchStatus.COMPLETED,
          createdById: mockUser.id,
        }),
      });

      expect(prisma.dispatchDetail.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          dispatchHeaderId: 'disp-uuid-1',
          productId: mockProduct.id,
          dailyProductionId: mockDailyProduction.id,
          quantityDispatched: 50,
          quantityReturnedAccumulated: 0,
        }),
      });

      // Verificación de integración con InventoryLedgerService (RN-010)
      expect(ledgerService.recordMovement).toHaveBeenCalledWith(
        {
          productId: mockProduct.id,
          movementType: MovementType.DISPATCH,
          quantity: 50,
          referenceTable: 'dispatch_details',
          referenceId: 'det-uuid-1',
          performedById: mockUser.id,
        },
        prisma,
      );

      // Verificación de AuditLog
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: mockUser.id,
          action: 'CREATE',
          tableName: 'dispatch_headers',
          recordId: 'disp-uuid-1',
        }),
      });
    });

    it('debe despachar exitosamente desde un lote multiproducto (ProductionDetail) si el producto está en el lote (Caso 2)', async () => {
      const mockProd2 = {
        id: 'prod-uuid-2',
        name: 'Polín 48x64',
        dimensions: '48" x 64"',
        isActive: true,
      };

      const multiProductDailyProd = {
        id: 'daily-multi-1',
        productionLot: 'LT-050926-W36',
        productionDate: new Date('2026-09-05'),
        isoWeek: 36,
        productionDetails: [
          { productId: 'prod-uuid-1', quantityProduced: 50 },
          { productId: 'prod-uuid-2', quantityProduced: 30 },
        ],
      };

      prisma.dispatchHeader.findUnique.mockResolvedValue(null);
      prisma.clientCenter.findUnique.mockResolvedValue(mockClientCenter);
      prisma.product.findMany.mockResolvedValue([mockProduct, mockProd2]);
      prisma.dailyProduction.findMany.mockResolvedValue([multiProductDailyProd]);
      ledgerService.getAvailableStock.mockResolvedValue(100);

      const mockHeader = {
        id: 'disp-uuid-2',
        invoiceNumber: 'F-90211',
        dispatchDate: new Date('2026-09-05T00:00:00.000Z'),
        dispatchTime: new Date('1970-01-01T14:30:00.000Z'),
        clientCenterId: mockClientCenter.id,
        status: DispatchStatus.COMPLETED,
        createdById: mockUser.id,
      };

      prisma.dispatchHeader.create.mockResolvedValue(mockHeader);
      prisma.dispatchDetail.create.mockResolvedValue({ id: 'det-uuid-2' });
      prisma.auditLog.create.mockResolvedValue({ id: 'audit-2' });
      jest.spyOn(service, 'findOne').mockResolvedValue({ success: true, data: mockHeader } as any);

      const dto = {
        ...validDto,
        invoiceNumber: 'F-90211',
        details: [
          {
            productId: 'prod-uuid-2',
            dailyProductionId: 'daily-multi-1',
            quantityDispatched: 15,
            dimensions: '48" x 64"',
          },
        ],
      };

      const result = await service.create(dto, mockUser);
      expect(result.success).toBe(true);
    });

    it('debe rechazar si un producto no pertenece a la lista de productionDetails del lote (Caso 3)', async () => {
      const multiProductDailyProd = {
        id: 'daily-multi-1',
        productionLot: 'LT-050926-W36',
        productionDate: new Date('2026-09-05'),
        isoWeek: 36,
        productionDetails: [
          { productId: 'prod-uuid-1', quantityProduced: 50 },
          { productId: 'prod-uuid-2', quantityProduced: 30 },
        ],
      };

      const foreignProduct = {
        id: 'prod-uuid-999',
        name: 'Polín Extraño',
        dimensions: '50x50',
        isActive: true,
      };

      prisma.dispatchHeader.findUnique.mockResolvedValue(null);
      prisma.clientCenter.findUnique.mockResolvedValue(mockClientCenter);
      prisma.product.findMany.mockResolvedValue([foreignProduct]);
      prisma.dailyProduction.findMany.mockResolvedValue([multiProductDailyProd]);

      const invalidDto = {
        ...validDto,
        details: [
          {
            productId: 'prod-uuid-999',
            dailyProductionId: 'daily-multi-1',
            quantityDispatched: 10,
          },
        ],
      };

      await expect(service.create(invalidDto, mockUser)).rejects.toThrow(BadRequestException);
      await expect(service.create(invalidDto, mockUser)).rejects.toThrow(/no corresponde al producto/);
    });

    it('debe procesar correctamente producciones con el mismo productionLot visible diferenciadas por su ID (Caso 9)', async () => {
      const mockProd2 = {
        id: 'prod-uuid-2',
        name: 'Polín 48x64',
        dimensions: '48" x 64"',
        isActive: true,
      };

      // Dos registros distintos con la misma nomenclatura visible LT-050926-W36
      const dp1 = {
        id: 'daily-uuid-A',
        productionLot: 'LT-050926-W36',
        productId: 'prod-uuid-1',
        productionDate: new Date('2026-09-05'),
        isoWeek: 36,
        productionDetails: [{ productId: 'prod-uuid-1', quantityProduced: 50 }],
      };

      const dp2 = {
        id: 'daily-uuid-B',
        productionLot: 'LT-050926-W36',
        productId: 'prod-uuid-2',
        productionDate: new Date('2026-09-05'),
        isoWeek: 36,
        productionDetails: [{ productId: 'prod-uuid-2', quantityProduced: 30 }],
      };

      prisma.dispatchHeader.findUnique.mockResolvedValue(null);
      prisma.clientCenter.findUnique.mockResolvedValue(mockClientCenter);
      prisma.product.findMany.mockResolvedValue([mockProduct, mockProd2]);
      prisma.dailyProduction.findMany.mockResolvedValue([dp1, dp2]);
      ledgerService.getAvailableStock.mockResolvedValue(100);

      const mockHeader = {
        id: 'disp-uuid-3',
        invoiceNumber: 'F-90212',
        status: DispatchStatus.COMPLETED,
      };

      prisma.dispatchHeader.create.mockResolvedValue(mockHeader);
      prisma.dispatchDetail.create.mockResolvedValue({ id: 'det-uuid-3' });
      prisma.auditLog.create.mockResolvedValue({ id: 'audit-3' });
      jest.spyOn(service, 'findOne').mockResolvedValue({ success: true, data: mockHeader } as any);

      const dto = {
        ...validDto,
        invoiceNumber: 'F-90212',
        details: [
          {
            productId: 'prod-uuid-1',
            dailyProductionId: 'daily-uuid-A',
            quantityDispatched: 20,
          },
          {
            productId: 'prod-uuid-2',
            dailyProductionId: 'daily-uuid-B',
            quantityDispatched: 15,
          },
        ],
      };

      const result = await service.create(dto, mockUser);
      expect(result.success).toBe(true);
      expect(prisma.dispatchDetail.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          dailyProductionId: 'daily-uuid-A',
          productId: 'prod-uuid-1',
        }),
      });
      expect(prisma.dispatchDetail.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          dailyProductionId: 'daily-uuid-B',
          productId: 'prod-uuid-2',
        }),
      });
    });

    it('debe permitir despachar una cantidad superior a la registrada en la producción si el stock en inventario es suficiente (Caso 6 backend)', async () => {
      // Producción = 50, Despacho = 60, pero Stock disponible en ledger = 100
      const dp = {
        id: 'daily-uuid-1',
        productionLot: 'LT-050926-W36',
        productId: 'prod-uuid-1',
        quantityProduced: 50,
        productionDate: new Date('2026-09-05'),
        isoWeek: 36,
        productionDetails: [{ productId: 'prod-uuid-1', quantityProduced: 50 }],
      };

      prisma.dispatchHeader.findUnique.mockResolvedValue(null);
      prisma.clientCenter.findUnique.mockResolvedValue(mockClientCenter);
      prisma.product.findMany.mockResolvedValue([mockProduct]);
      prisma.dailyProduction.findMany.mockResolvedValue([dp]);
      ledgerService.getAvailableStock.mockResolvedValue(100); // Stock suficiente en kardex

      const mockHeader = { id: 'disp-uuid-4', invoiceNumber: 'F-90213', status: DispatchStatus.COMPLETED };
      prisma.dispatchHeader.create.mockResolvedValue(mockHeader);
      prisma.dispatchDetail.create.mockResolvedValue({ id: 'det-uuid-4' });
      prisma.auditLog.create.mockResolvedValue({ id: 'audit-4' });
      jest.spyOn(service, 'findOne').mockResolvedValue({ success: true, data: mockHeader } as any);

      const dto = {
        ...validDto,
        invoiceNumber: 'F-90213',
        details: [
          {
            productId: 'prod-uuid-1',
            dailyProductionId: 'daily-uuid-1',
            quantityDispatched: 60, // 60 > 50
          },
        ],
      };

      const result = await service.create(dto, mockUser);
      expect(result.success).toBe(true);
    });
  });

  describe('findAll - Consultas paginadas y filtros', () => {
    it('debe devolver la lista paginada de despachos', async () => {
      prisma.dispatchHeader.count.mockResolvedValue(1);
      prisma.dispatchHeader.findMany.mockResolvedValue([
        {
          id: 'disp-1',
          invoiceNumber: 'F-90210',
          dispatchDate: new Date('2026-09-02'),
          status: DispatchStatus.COMPLETED,
        },
      ]);

      const result = await service.findAll({ page: 1, limit: 10 });
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('findOne - Consulta por ID', () => {
    it('debe lanzar NotFoundException si el despacho no existe', async () => {
      prisma.dispatchHeader.findUnique.mockResolvedValue(null);

      await expect(service.findOne('non-existent-uuid')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('Inmutabilidad (RN-001)', () => {
    it('no debe exponer métodos de actualización ni eliminación (PUT/PATCH/DELETE prohibidos)', () => {
      expect((service as any).update).toBeUndefined();
      expect((service as any).patch).toBeUndefined();
      expect((service as any).delete).toBeUndefined();
      expect((service as any).remove).toBeUndefined();
    });
  });
});
