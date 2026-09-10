import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { PrismaService } from '../../database/prisma.service';

describe('ReportsService', () => {
  let service: ReportsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      woodReceipt: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'wr-1',
            receiptDate: new Date('2026-09-02'),
            receiptTime: new Date('1970-01-01T08:30:00.000Z'),
            supplier: { name: 'Maderas del Norte S.A.' },
            species: { name: 'TECA' },
            woodType: { name: 'TIMBRE' },
            quantity: 12500.5,
            unit: 'PIE_TABLAR',
            woodStatus: 'Óptima',
            lotNumber: 'LT-020926-01',
            guideNumber: 'G-100',
            createdBy: { fullName: 'Carlos Supervisor' },
          },
        ]),
      },
      dispatchDetail: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'dd-1',
            quantityDispatched: 1000,
            quantityReturnedAccumulated: 50,
            product: { name: 'Polín 45x48', dimensions: '45x48' },
            dailyProduction: { productionLot: 'LT-020926-W36' },
            dispatchHeader: {
              dispatchDate: new Date('2026-09-03'),
              dispatchTime: new Date('1970-01-01T10:00:00.000Z'),
              invoiceNumber: 'F-1002',
              vehicleInfo: 'M-12345',
              driverName: 'Marcos Rivera',
              status: 'RETURNED_PARTIAL',
              observations: 'Conforme',
              clientCenter: { name: 'Planta 2' },
            },
          },
        ]),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'p-1', name: 'Polín 45x48', dimensions: '45x48', isActive: true },
        ]),
      },
      inventoryMovement: {
        groupBy: jest.fn().mockResolvedValue([
          { productId: 'p-1', movementType: 'PRODUCTION', _sum: { deltaQuantity: 5000 } },
          { productId: 'p-1', movementType: 'DISPATCH', _sum: { deltaQuantity: -3500 } },
          { productId: 'p-1', movementType: 'RETURN', _sum: { deltaQuantity: 200 } },
          { productId: 'p-1', movementType: 'ADJUSTMENT', _sum: { deltaQuantity: 50 } },
        ]),
      },
      dailyProduction: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'dp-1',
            productionDate: new Date('2026-09-02'),
            productionLot: 'LT-020926-W36',
            isoWeek: 36,
            quantityProduced: 1500,
            product: { name: 'Polín 45x48', dimensions: '45x48' },
            createdBy: { fullName: 'Supervisor Producción' },
            productionWoodReceipts: [
              { woodReceipt: { lotNumber: 'LT-010926-01' } },
            ],
          },
        ]),
      },
      fumigation: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'fum-1',
            fumigationDate: new Date('2026-09-02'),
            fumigationTime: new Date('1970-01-01T14:00:00.000Z'),
            certificateNumber: 'OIRSA-NIC-2026-9901',
            pdfFileName: 'OIRSA-NIC-2026-9901.pdf',
            fileSizeBytes: 102400,
            dailyProduction: { productionLot: 'LT-020926-W36' },
            registeredBy: { fullName: 'Inspector Fitosanitario' },
          },
        ]),
      },
      clientCenter: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'cc-1', name: 'Planta 1' },
          { id: 'cc-2', name: 'Planta 2' },
        ]),
      },
      dispatchHeader: {
        findMany: jest.fn().mockResolvedValue([
          {
            clientCenterId: 'cc-1',
            invoiceNumber: 'F-1001',
            dispatchDetails: [
              { quantityDispatched: 500, returnDetails: [{ quantityReturned: 50 }] },
            ],
          },
        ]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
  });

  describe('Regla RN-007 (Validación Estricta de Rango de Fechas)', () => {
    it('debe rechazar con HTTP 400 Bad Request si startDate > endDate en cualquier reporte', async () => {
      const invalidQuery = {
        startDate: '2026-09-30',
        endDate: '2026-09-01',
      };

      await expect(service.getWoodReceiptsReport(invalidQuery)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.getDispatchesReport(invalidQuery)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.getDailyProductionsReport(invalidQuery)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.getFumigationsReport(invalidQuery)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.getDistributionCentersReport(invalidQuery)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('debe incluir el mensaje normativo exacto ante violación de RN-007', async () => {
      try {
        await service.getWoodReceiptsReport({
          startDate: '2026-09-30',
          endDate: '2026-09-01',
        });
        fail('Se esperaba BadRequestException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(BadRequestException);
        expect(err.getResponse().message).toBe(
          'La fecha inicial no puede ser posterior a la fecha final',
        );
      }
    });
  });

  describe('Reporte 1: Ingresos de Madera (EP-REP-01)', () => {
    it('debe retornar lista paginada de ingresos con metadatos', async () => {
      const result = await service.getWoodReceiptsReport({
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        lotNumber: 'LT-020926-01',
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].lotNumber).toBe('LT-020926-01');
      expect(result.data[0].supplierName).toBe('Maderas del Norte S.A.');
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });
  });

  describe('Reporte 2: Salidas y Despachos (EP-REP-02)', () => {
    it('debe retornar lista paginada de despachos con cliente y cantidades', async () => {
      const result = await service.getDispatchesReport({
        startDate: '2026-09-01',
        endDate: '2026-09-30',
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].invoiceNumber).toBe('F-1002');
      expect(result.data[0].clientCenterName).toBe('Planta 2');
      expect(result.data[0].quantityDispatched).toBe(1000);
      expect(result.data[0].quantityReturnedAccumulated).toBe(50);
    });
  });

  describe('Reporte 3: Inventario Operativo Consolidado (EP-REP-03)', () => {
    it('debe calcular balance de producción, despachos, retornos, ajustes y stock disponible', async () => {
      const result = await service.getInventoryReport({});

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      const item = result.data[0];
      expect(item.productName).toBe('Polín 45x48');
      expect(item.totalProduced).toBe(5000);
      expect(item.totalDispatched).toBe(3500);
      expect(item.totalReturned).toBe(200);
      expect(item.netAdjustments).toBe(50);
      // 5000 - 3500 + 200 + 50 = 1750
      expect(item.currentAvailableStock).toBe(1750);
      expect(result.summary.totalAvailableStock).toBe(1750);
    });

    it('debe aceptar parámetros de fecha (startDate, endDate, asOfDate) y filtrar correctamente', async () => {
      const result = await service.getInventoryReport({
        startDate: '2026-09-01',
        endDate: '2026-09-09',
        asOfDate: '2026-09-09',
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(prisma.inventoryMovement.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            timestamp: expect.any(Object),
          }),
        }),
      );
    });

    it('debe lanzar BadRequestException (RN-007) si startDate es posterior a endDate/asOfDate', async () => {
      await expect(
        service.getInventoryReport({
          startDate: '2026-09-15',
          endDate: '2026-09-09',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Reporte 4: Producción Diaria por Semana ISO (EP-REP-04)', () => {
    it('debe retornar lista de jornadas con semana ISO y lotes de madera vinculados', async () => {
      const result = await service.getDailyProductionsReport({
        isoWeek: 36,
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].productionLot).toBe('LT-020926-W36');
      expect(result.data[0].isoWeek).toBe(36);
      expect(result.data[0].woodReceiptLots).toEqual(['LT-010926-01']);
    });
  });

  describe('Reporte 5: Fumigaciones y Certificados OIRSA (EP-REP-05)', () => {
    it('debe retornar lista de tratamientos con enlace de descarga del certificado', async () => {
      const result = await service.getFumigationsReport({});

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].certificateNumber).toBe('OIRSA-NIC-2026-9901');
      expect(result.data[0].certificateDownloadUrl).toBe(
        '/api/v1/fumigations/fum-1/certificate-url',
      );
    });
  });

  describe('Reporte 6: Movimientos por Centro de Distribución (EP-REP-06)', () => {
    it('debe desglosar movimientos hacia las plantas cliente con saldo neto entregado', async () => {
      const result = await service.getDistributionCentersReport({});

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      const planta1 = result.data.find((c) => c.clientCenterName === 'Planta 1');
      expect(planta1).toBeDefined();
      expect(planta1?.totalDispatched).toBe(500);
      expect(planta1?.totalReturned).toBe(50);
      expect(planta1?.netDelivered).toBe(450);
      expect(planta1?.invoicesCount).toBe(1);
    });
  });

  describe('Inmutabilidad (Read-Only)', () => {
    it('no debe exponer métodos de mutación', () => {
      expect((service as any).create).toBeUndefined();
      expect((service as any).update).toBeUndefined();
      expect((service as any).delete).toBeUndefined();
      expect((service as any).patch).toBeUndefined();
    });
  });
});
