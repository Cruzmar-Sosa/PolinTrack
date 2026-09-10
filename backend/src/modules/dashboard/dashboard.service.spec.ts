import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../../database/prisma.service';

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: any;

  const mockProducts = [
    { id: 'p-1', name: 'Polín 45x48', dimensions: '45x48', isActive: true },
    { id: 'p-2', name: 'Polín 45x47', dimensions: '45x47', isActive: true },
  ];

  const mockMovementSums = [
    { productId: 'p-1', _sum: { deltaQuantity: 2400 } },
    { productId: 'p-2', _sum: { deltaQuantity: 2000 } },
  ];

  const mockWoodReceipts = [
    {
      id: 'wr-1',
      quantity: 45800.25,
      unit: 'PIE_TABLAR',
      woodType: { name: 'TIMBRE' },
      receiptDate: new Date('2026-09-02'),
    },
    {
      id: 'wr-2',
      quantity: 1200,
      unit: 'PIEZA',
      woodType: { name: 'PROCESADA' },
      receiptDate: new Date('2026-09-02'),
    },
  ];

  const mockClientCenters = [
    { id: 'cc-1', name: 'Planta 1', isActive: true },
    { id: 'cc-2', name: 'Planta 2', isActive: true },
    { id: 'cc-3', name: 'Planta Camanica', isActive: true },
  ];

  const mockDispatchDetails = [
    { quantityDispatched: 3500, dispatchHeader: { clientCenterId: 'cc-1' } },
    { quantityDispatched: 4000, dispatchHeader: { clientCenterId: 'cc-2' } },
    { quantityDispatched: 3500, dispatchHeader: { clientCenterId: 'cc-3' } },
  ];

  beforeEach(async () => {
    prisma = {
      product: { findMany: jest.fn().mockResolvedValue(mockProducts) },
      inventoryMovement: { groupBy: jest.fn().mockResolvedValue(mockMovementSums) },
      woodReceipt: { findMany: jest.fn().mockResolvedValue(mockWoodReceipts) },
      dispatchDetail: { findMany: jest.fn().mockResolvedValue(mockDispatchDetails) },
      clientCenter: { findMany: jest.fn().mockResolvedValue(mockClientCenters) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  describe('getKpis (EP-DSH-01)', () => {
    it('debe calcular con exactitud los 5 KPIs canónicos en tiempo real', async () => {
      const result = await service.getKpis({});

      expect(result.success).toBe(true);
      const kpis = result.data;

      // KPI 1: Inventario Actual
      expect(kpis.kpi1_currentInventory.totalPieces).toBe(4400);
      expect(kpis.kpi1_currentInventory.byProduct).toHaveLength(2);
      expect(kpis.kpi1_currentInventory.byProduct[0].stock).toBe(2400);
      expect(kpis.kpi1_currentInventory.byProduct[1].stock).toBe(2000);

      // KPI 2: Entradas de Madera
      expect(kpis.kpi2_woodReceipts.timbrePieTablarTotal).toBe(45800.25);
      expect(kpis.kpi2_woodReceipts.procesadaPiecesTotal).toBe(1200);

      // KPI 3: Salidas de Polines
      expect(kpis.kpi3_polinesDispatched.totalPieces).toBe(11000);

      // KPI 4: Madera Despachada Equivalente
      expect(kpis.kpi4_woodDispatchedEquivalent.totalDispatchedEquivalent).toBe(11000);

      // KPI 5: Salidas por Centro Cliente
      expect(kpis.kpi5_dispatchesByClientCenter).toHaveLength(3);
      expect(kpis.kpi5_dispatchesByClientCenter[0]).toEqual({
        centerName: 'Planta 1',
        pieces: 3500,
      });
      expect(kpis.kpi5_dispatchesByClientCenter[1]).toEqual({
        centerName: 'Planta 2',
        pieces: 4000,
      });
      expect(kpis.kpi5_dispatchesByClientCenter[2]).toEqual({
        centerName: 'Planta Camanica',
        pieces: 3500,
      });
    });

    it('debe rechazar con BadRequestException (400) si startDate > endDate (RN-007)', async () => {
      await expect(
        service.getKpis({
          startDate: '2026-09-30',
          endDate: '2026-09-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe filtrar correctamente cuando se proporciona un rango de fechas válido', async () => {
      const result = await service.getKpis({
        startDate: '2026-09-01',
        endDate: '2026-09-15',
      });

      expect(result.success).toBe(true);
      expect(prisma.woodReceipt.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            receiptDate: expect.any(Object),
          }),
        }),
      );
    });
  });

  describe('Inmutabilidad (Read-Only)', () => {
    it('no debe exponer métodos de mutación (create, update, delete, patch)', () => {
      expect((service as any).create).toBeUndefined();
      expect((service as any).update).toBeUndefined();
      expect((service as any).delete).toBeUndefined();
      expect((service as any).patch).toBeUndefined();
    });
  });
});
