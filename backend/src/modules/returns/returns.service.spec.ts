import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ReturnsService } from './returns.service';
import { PrismaService } from '../../database/prisma.service';
import { InventoryLedgerService } from '../inventory/inventory-ledger.service';
import { DispatchStatus, MovementType, ReturnTypeEnum } from '@prisma/client';

describe('ReturnsService', () => {
  let service: ReturnsService;
  let prisma: any;
  let ledgerService: any;

  const mockUser = {
    id: 'user-uuid-1',
    email: 'contabilidad@polintrack.com',
    role: 'CONTABILIDAD',
  };

  const mockProduct = {
    id: 'prod-uuid-1',
    name: 'Polín Industrial 3x3x8',
    dimensions: '3" x 3" x 8\'',
  };

  const mockDispatchHeader = {
    id: 'disp-uuid-1',
    invoiceNumber: 'F-90210',
    dispatchDate: new Date('2026-09-02T00:00:00.000Z'),
    clientCenterId: 'center-uuid-1',
    clientCenter: { name: 'Planta 2 - Matagalpa' },
    status: DispatchStatus.COMPLETED,
    dispatchDetails: [
      {
        id: 'det-uuid-1',
        dispatchHeaderId: 'disp-uuid-1',
        productId: 'prod-uuid-1',
        quantityDispatched: 100,
        quantityReturnedAccumulated: 0,
        dimensions: '3" x 3" x 8\'',
        product: mockProduct,
      },
    ],
  };

  const validDto = {
    dispatchHeaderId: 'disp-uuid-1',
    returnDate: '2026-09-03',
    reason: 'Rechazo de calidad en Planta 2 por humedad',
    observations: 'Piezas inspeccionadas',
    details: [
      {
        dispatchDetailId: 'det-uuid-1',
        quantityReturned: 30,
      },
    ],
  };

  beforeEach(async () => {
    prisma = {
      dispatchHeader: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      dispatchDetail: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
      returnHeader: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      returnDetail: {
        create: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn((callback) => callback(prisma)),
    };

    ledgerService = {
      recordMovement: jest.fn().mockResolvedValue({ id: 'mov-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReturnsService,
        { provide: PrismaService, useValue: prisma },
        { provide: InventoryLedgerService, useValue: ledgerService },
      ],
    }).compile();

    service = module.get<ReturnsService>(ReturnsService);
  });

  describe('create - Validaciones Previas y Cronología', () => {
    it('debe rechazar si el despacho original no existe (404 Not Found)', async () => {
      prisma.dispatchHeader.findUnique.mockResolvedValue(null);

      await expect(service.create(validDto, mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('debe permitir devolución si la fecha de devolución es el mismo día calendario del despacho (returnDate == dispatchDate)', async () => {
      prisma.dispatchHeader.findUnique.mockResolvedValue(mockDispatchHeader);
      prisma.dispatchDetail.findMany.mockResolvedValue([
        {
          id: 'det-uuid-1',
          dispatchHeaderId: 'disp-uuid-1',
          productId: 'prod-uuid-1',
          quantityDispatched: 100,
          quantityReturnedAccumulated: 0,
          product: mockProduct,
        },
      ]);
      prisma.returnHeader.create.mockResolvedValue({
        id: 'ret-uuid-same-day',
        returnDate: new Date('2026-09-02T00:00:00.000Z'),
        returnType: ReturnTypeEnum.PARCIAL,
        dispatchHeaderId: 'disp-uuid-1',
      });
      prisma.returnDetail.create.mockResolvedValue({ id: 'ret-det-1' });
      prisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'ret-uuid-same-day' } as any);

      const sameDayDto = {
        ...validDto,
        returnDate: '2026-09-02', // Mismo día calendario que el despacho (2026-09-02)
      };

      const result = await service.create(sameDayDto, mockUser);
      expect(result).toBeDefined();
    });

    it('debe permitir devolución el mismo día calendario aun cuando dispatchDate contenga timestamp con hora (ej. 15:30 UTC)', async () => {
      const dispatchWithTime = {
        ...mockDispatchHeader,
        dispatchDate: new Date('2026-09-02T15:30:45.123Z'),
      };
      prisma.dispatchHeader.findUnique.mockResolvedValue(dispatchWithTime);
      prisma.dispatchDetail.findMany.mockResolvedValue([
        {
          id: 'det-uuid-1',
          dispatchHeaderId: 'disp-uuid-1',
          productId: 'prod-uuid-1',
          quantityDispatched: 100,
          quantityReturnedAccumulated: 0,
          product: mockProduct,
        },
      ]);
      prisma.returnHeader.create.mockResolvedValue({
        id: 'ret-uuid-same-day-time',
        returnDate: new Date('2026-09-02T00:00:00.000Z'),
        returnType: ReturnTypeEnum.PARCIAL,
        dispatchHeaderId: 'disp-uuid-1',
      });
      prisma.returnDetail.create.mockResolvedValue({ id: 'ret-det-1' });
      prisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'ret-uuid-same-day-time' } as any);

      const sameDayDto = {
        ...validDto,
        returnDate: '2026-09-02',
      };

      const result = await service.create(sameDayDto, mockUser);
      expect(result).toBeDefined();
    });

    it('debe rechazar si la fecha de devolución es anterior al despacho (FA-02 / 400 Bad Request)', async () => {
      prisma.dispatchHeader.findUnique.mockResolvedValue(mockDispatchHeader);

      const invalidDateDto = {
        ...validDto,
        returnDate: '2026-09-01', // Despacho fue el 2026-09-02
      };

      await expect(service.create(invalidDateDto, mockUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(invalidDateDto, mockUser)).rejects.toThrow(
        /no puede ser anterior a la fecha original del despacho/,
      );
    });

    it('debe rechazar si la línea de detalle no pertenece al despacho original (400 Bad Request)', async () => {
      prisma.dispatchHeader.findUnique.mockResolvedValue(mockDispatchHeader);

      const foreignDetailDto = {
        ...validDto,
        details: [
          {
            dispatchDetailId: 'foreign-det-uuid',
            quantityReturned: 10,
          },
        ],
      };

      await expect(service.create(foreignDetailDto, mockUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(foreignDetailDto, mockUser)).rejects.toThrow(
        /no pertenece al despacho/,
      );
    });
  });

  describe('create - Regla Inquebrantable de Límite Máximo (RN-013, D-020)', () => {
    it('debe rechazar si la cantidad devuelta supera el remanente disponible de la línea', async () => {
      prisma.dispatchHeader.findUnique.mockResolvedValue(mockDispatchHeader);

      // Línea con 100 despachados y 80 ya devueltos previamente. Remanente = 20.
      prisma.dispatchDetail.findMany.mockResolvedValue([
        {
          id: 'det-uuid-1',
          dispatchHeaderId: 'disp-uuid-1',
          productId: 'prod-uuid-1',
          quantityDispatched: 100,
          quantityReturnedAccumulated: 80,
          product: mockProduct,
        },
      ]);

      // Solicitamos devolver 25 (25 > 20)
      const excessReturnDto = {
        ...validDto,
        details: [
          {
            dispatchDetailId: 'det-uuid-1',
            quantityReturned: 25,
          },
        ],
      };

      await expect(service.create(excessReturnDto, mockUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(excessReturnDto, mockUser)).rejects.toThrow(
        /supera el remanente despachado disponible \(20\)/,
      );
    });
  });

  describe('create - Flujo Exitoso, Ledger, Inmutabilidad y Auditoría', () => {
    it('debe registrar devolución parcial, incrementar quantityReturnedAccumulated, emitir movimiento RETURN (+N) y actualizar status', async () => {
      prisma.dispatchHeader.findUnique.mockResolvedValue(mockDispatchHeader);
      prisma.dispatchDetail.findMany.mockResolvedValue([
        {
          id: 'det-uuid-1',
          dispatchHeaderId: 'disp-uuid-1',
          productId: 'prod-uuid-1',
          quantityDispatched: 100,
          quantityReturnedAccumulated: 0,
          product: mockProduct,
        },
      ]);

      const mockReturnHeader = {
        id: 'ret-uuid-1',
        dispatchHeaderId: 'disp-uuid-1',
        returnDate: new Date('2026-09-03T00:00:00.000Z'),
        returnType: ReturnTypeEnum.PARCIAL,
        reason: validDto.reason,
        observations: validDto.observations,
        registeredById: mockUser.id,
      };

      const mockReturnDetail = {
        id: 'ret-det-1',
        returnHeaderId: 'ret-uuid-1',
        dispatchDetailId: 'det-uuid-1',
        productId: 'prod-uuid-1',
        quantityReturned: 30,
      };

      prisma.returnHeader.create.mockResolvedValue(mockReturnHeader);
      prisma.returnDetail.create.mockResolvedValue(mockReturnDetail);
      prisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });

      // Mock findOne
      jest.spyOn(service, 'findOne').mockResolvedValue({
        success: true,
        data: {
          ...mockReturnHeader,
          dispatchHeader: mockDispatchHeader,
          returnDetails: [mockReturnDetail],
        } as any,
      });

      const result = await service.create(validDto, mockUser);

      expect(result.success).toBe(true);

      // Verificación de bloqueo pesimista ordenado
      expect(prisma.$queryRaw).toHaveBeenCalled();

      // Verificación de creación de ReturnHeader con tipo PARCIAL
      expect(prisma.returnHeader.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          dispatchHeaderId: 'disp-uuid-1',
          returnType: ReturnTypeEnum.PARCIAL,
          reason: validDto.reason,
          registeredById: mockUser.id,
        }),
      });

      // Verificación de ReturnDetail
      expect(prisma.returnDetail.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          returnHeaderId: 'ret-uuid-1',
          dispatchDetailId: 'det-uuid-1',
          productId: 'prod-uuid-1',
          quantityReturned: 30,
        }),
      });

      // Verificación de que DispatchDetail incrementa quantityReturnedAccumulated sin tocar quantityDispatched (RN-001)
      expect(prisma.dispatchDetail.update).toHaveBeenCalledWith({
        where: { id: 'det-uuid-1' },
        data: {
          quantityReturnedAccumulated: {
            increment: 30,
          },
        },
      });

      // Verificación de integración con InventoryLedgerService (RN-010, MovementType.RETURN, +30)
      expect(ledgerService.recordMovement).toHaveBeenCalledWith(
        {
          productId: 'prod-uuid-1',
          movementType: MovementType.RETURN,
          quantity: 30,
          referenceTable: 'return_details',
          referenceId: 'ret-det-1',
          performedById: mockUser.id,
        },
        prisma,
      );

      // Verificación de actualización de status en DispatchHeader a RETURNED_PARTIAL
      expect(prisma.dispatchHeader.update).toHaveBeenCalledWith({
        where: { id: 'disp-uuid-1' },
        data: {
          status: DispatchStatus.RETURNED_PARTIAL,
        },
      });

      // Verificación de AuditLog
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: mockUser.id,
          action: 'CREATE',
          tableName: 'return_headers',
          recordId: 'ret-uuid-1',
        }),
      });
    });

    it('debe registrar devolución total cuando se devuelve el 100% de lo despachado y marcar RETURNED_TOTAL', async () => {
      prisma.dispatchHeader.findUnique.mockResolvedValue(mockDispatchHeader);
      prisma.dispatchDetail.findMany.mockResolvedValue([
        {
          id: 'det-uuid-1',
          dispatchHeaderId: 'disp-uuid-1',
          productId: 'prod-uuid-1',
          quantityDispatched: 100,
          quantityReturnedAccumulated: 0,
          product: mockProduct,
        },
      ]);

      const totalReturnDto = {
        ...validDto,
        details: [
          {
            dispatchDetailId: 'det-uuid-1',
            quantityReturned: 100, // 100% devuelto
          },
        ],
      };

      prisma.returnHeader.create.mockResolvedValue({
        id: 'ret-uuid-total',
        returnType: ReturnTypeEnum.TOTAL,
      });
      prisma.returnDetail.create.mockResolvedValue({ id: 'ret-det-total' });
      prisma.auditLog.create.mockResolvedValue({ id: 'audit-total' });

      jest.spyOn(service, 'findOne').mockResolvedValue({
        success: true,
        data: { id: 'ret-uuid-total', returnType: ReturnTypeEnum.TOTAL } as any,
      });

      await service.create(totalReturnDto, mockUser);

      // Verificación de tipo TOTAL y status RETURNED_TOTAL
      expect(prisma.returnHeader.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          returnType: ReturnTypeEnum.TOTAL,
        }),
      });

      expect(prisma.dispatchHeader.update).toHaveBeenCalledWith({
        where: { id: 'disp-uuid-1' },
        data: {
          status: DispatchStatus.RETURNED_TOTAL,
        },
      });
    });
  });

  describe('findAll - Consultas paginadas y filtros', () => {
    it('debe devolver la lista paginada de devoluciones con planta cliente resuelta', async () => {
      prisma.returnHeader.count.mockResolvedValue(1);
      prisma.returnHeader.findMany.mockResolvedValue([
        {
          id: 'ret-1',
          returnDate: new Date('2026-09-03'),
          returnType: ReturnTypeEnum.PARCIAL,
          dispatchHeader: {
            id: 'disp-1',
            invoiceNumber: 'F-90210',
            dispatchDate: new Date('2026-09-02'),
            clientCenter: { id: 'center-1', name: 'Planta 2 - Matagalpa', location: 'Matagalpa' },
          },
        },
      ]);

      const result = await service.findAll({ page: 1, limit: 10 });
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.data[0].dispatchHeader?.clientCenter?.name).toBe('Planta 2 - Matagalpa');
      expect(result.data[0].clientCenter?.name).toBe('Planta 2 - Matagalpa');
      expect(result.data[0].dispatchHeader?.clientCenterName).toBe('Planta 2 - Matagalpa');
    });
  });

  describe('findOne - Consulta por ID', () => {
    it('debe devolver la devolución con los datos de planta cliente resueltos', async () => {
      prisma.returnHeader.findUnique.mockResolvedValue({
        id: 'ret-1',
        returnDate: new Date('2026-09-03'),
        returnType: ReturnTypeEnum.PARCIAL,
        dispatchHeader: {
          id: 'disp-1',
          invoiceNumber: 'F-90210',
          dispatchDate: new Date('2026-09-02'),
          status: DispatchStatus.RETURNED_PARTIAL,
          clientCenter: { id: 'center-1', name: 'Planta 2 - Matagalpa', location: 'Matagalpa' },
        },
        registeredBy: { id: 'user-1', fullName: 'Ana Contabilidad', email: 'ana@polintrack.com' },
        returnDetails: [],
      });

      const result = await service.findOne('ret-1');
      expect(result.success).toBe(true);
      expect(result.data.id).toBe('ret-1');
      expect(result.data.dispatchHeader.clientCenter?.name).toBe('Planta 2 - Matagalpa');
      expect(result.data.clientCenter?.name).toBe('Planta 2 - Matagalpa');
      expect(result.data.dispatchHeader.clientCenterName).toBe('Planta 2 - Matagalpa');
    });

    it('debe lanzar NotFoundException si la devolución no existe', async () => {
      prisma.returnHeader.findUnique.mockResolvedValue(null);

      await expect(service.findOne('non-existent-uuid')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('Inmutabilidad (RN-001)', () => {
    it('no debe exponer métodos de actualización ni eliminación sobre Returns (PUT/PATCH/DELETE prohibidos)', () => {
      expect((service as any).update).toBeUndefined();
      expect((service as any).patch).toBeUndefined();
      expect((service as any).delete).toBeUndefined();
      expect((service as any).remove).toBeUndefined();
    });
  });
});
