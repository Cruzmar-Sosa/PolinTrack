import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { TraceabilityService } from './traceability.service';
import { PrismaService } from '../../database/prisma.service';
import { TraceabilityQueryType } from './dto/query-traceability.dto';

describe('TraceabilityService', () => {
  let service: TraceabilityService;
  let prisma: any;

  const mockProduct = {
    id: 'prod-uuid-1',
    name: 'Polín 45x48',
    dimensions: '45x48',
  };

  const mockSupplier = {
    id: 'sup-uuid-1',
    name: 'Maderas del Norte S.A.',
  };

  const mockSpecies = { id: 'sp-1', name: 'TECA' };
  const mockWoodType = { id: 'wt-1', name: 'TIMBRE' };

  const mockWoodReceipt = {
    id: 'wr-uuid-1',
    lotNumber: 'LT-020926-01',
    supplier: mockSupplier,
    species: mockSpecies,
    woodType: mockWoodType,
    quantity: 12500.5,
    unit: 'PIE_TABLAR',
    receiptDate: new Date('2026-09-02T00:00:00.000Z'),
    createdBy: { fullName: 'Pedro Supervisor' },
  };

  const mockFumigation = {
    id: 'fum-uuid-1',
    certificateNumber: 'OIRSA-NIC-2026-9901',
    fumigationDate: new Date('2026-09-02T00:00:00.000Z'),
  };

  const mockClientCenter = {
    id: 'cc-uuid-1',
    name: 'Planta 2',
  };

  const mockDispatchHeader = {
    id: 'dh-uuid-1',
    invoiceNumber: 'F-1002',
    dispatchDate: new Date('2026-09-02T00:00:00.000Z'),
    driverName: 'Marcos Rivera',
    clientCenter: mockClientCenter,
  };

  const mockReturnHeader = {
    id: 'rh-uuid-1',
    returnDate: new Date('2026-09-03T00:00:00.000Z'),
    returnType: 'PARCIAL',
    reason: 'Rechazo de calidad en Planta 2',
    registeredBy: { fullName: 'Ana Morales' },
  };

  const mockDailyProduction = {
    id: 'dp-uuid-1',
    productionLot: 'LT-020926-W36',
    productionDate: new Date('2026-09-02T00:00:00.000Z'),
    isoWeek: 36,
    quantityProduced: 1500,
    product: mockProduct,
    createdBy: { fullName: 'Carlos Mendoza' },
    productionWoodReceipts: [
      {
        woodReceipt: mockWoodReceipt,
      },
    ],
    fumigations: [mockFumigation],
    dispatchDetails: [
      {
        id: 'dd-uuid-1',
        quantityDispatched: 1000,
        dispatchHeader: mockDispatchHeader,
        returnDetails: [
          {
            id: 'rd-uuid-1',
            quantityReturned: 150,
            returnHeader: mockReturnHeader,
          },
        ],
      },
    ],
  };

  beforeEach(async () => {
    prisma = {
      dailyProduction: {
        findFirst: jest.fn(),
      },
      woodReceipt: {
        findFirst: jest.fn(),
      },
      dispatchHeader: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TraceabilityService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<TraceabilityService>(TraceabilityService);
  });

  describe('traceByProductionLot (LOT_PRODUCTION)', () => {
    it('debe reconstruir exitosamente el árbol genealógico desde un lote de producción', async () => {
      prisma.dailyProduction.findFirst.mockResolvedValue(mockDailyProduction);

      const result = await service.getTraceability({
        queryType: TraceabilityQueryType.LOT_PRODUCTION,
        queryValue: 'LT-020926-W36',
      });

      expect(result.success).toBe(true);
      const data = result.data;

      // 1. Verificación de producción
      expect(data.production).toBeDefined();
      expect(data.production?.lot).toBe('LT-020926-W36');
      expect(data.production?.product).toBe('Polín 45x48');
      expect(data.production?.quantityProduced).toBe(1500);

      // 2. Verificación de materia prima (backward)
      expect(data.rawMaterialOrigin).toHaveLength(1);
      expect(data.rawMaterialOrigin[0].lotNumber).toBe('LT-020926-01');
      expect(data.rawMaterialOrigin[0].supplierName).toBe('Maderas del Norte S.A.');

      // 3. Verificación de fitosanitario (forward)
      expect(data.fumigations).toHaveLength(1);
      expect(data.fumigations[0].certificateNumber).toBe('OIRSA-NIC-2026-9901');

      // 4. Verificación de despachos (forward)
      expect(data.dispatches).toHaveLength(1);
      expect(data.dispatches[0].invoiceNumber).toBe('F-1002');
      expect(data.dispatches[0].quantityDispatched).toBe(1000);

      // 5. Verificación de devoluciones (forward)
      expect(data.returns).toHaveLength(1);
      expect(data.returns[0].quantityReturned).toBe(150);
      expect(data.returns[0].invoiceNumber).toBe('F-1002');

      // 6. Verificación de estado del lote (cálculo de existencia en patio)
      expect(data.currentLotStatus).toEqual({
        initialProduced: 1500,
        currentlyDelivered: 850, // 1000 despachados - 150 devueltos = 850 entregados netos
        availableInYard: 650, // 1500 producidos - 850 entregados = 650 en patio
      });

      // 7. Verificación del grafo visual DAG
      expect(data.graph.nodes.length).toBeGreaterThanOrEqual(4);
      expect(data.graph.edges.length).toBeGreaterThanOrEqual(3);
    });

    it('debe lanzar NotFoundException si el lote de producción no existe (404 Not Found)', async () => {
      prisma.dailyProduction.findFirst.mockResolvedValue(null);

      await expect(
        service.getTraceability({
          queryType: TraceabilityQueryType.LOT_PRODUCTION,
          queryValue: 'LT-INEXISTENTE',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('traceByWoodLot (LOT_WOOD)', () => {
    it('debe reconstruir exitosamente la trazabilidad hacia adelante desde un lote de madera', async () => {
      const woodWithProduction = {
        ...mockWoodReceipt,
        productionWoodReceipts: [
          {
            dailyProduction: mockDailyProduction,
          },
        ],
      };

      prisma.woodReceipt.findFirst.mockResolvedValue(woodWithProduction);

      const result = await service.getTraceability({
        queryType: TraceabilityQueryType.LOT_WOOD,
        queryValue: 'LT-020926-01',
      });

      expect(result.success).toBe(true);
      const data = result.data;

      expect(data.rawMaterialOrigin[0].lotNumber).toBe('LT-020926-01');
      expect(data.production?.lot).toBe('LT-020926-W36');
      expect(data.dispatches).toHaveLength(1);
      expect(data.returns).toHaveLength(1);
    });

    it('debe manejar madera recibida que aún no ha entrado a producción', async () => {
      const unusedWood = {
        ...mockWoodReceipt,
        productionWoodReceipts: [],
      };

      prisma.woodReceipt.findFirst.mockResolvedValue(unusedWood);

      const result = await service.getTraceability({
        queryType: TraceabilityQueryType.LOT_WOOD,
        queryValue: 'LT-020926-01',
      });

      expect(result.success).toBe(true);
      expect(result.data.production).toBeNull();
      expect(result.data.dispatches).toHaveLength(0);
      expect(result.data.returns).toHaveLength(0);
      expect(result.data.currentLotStatus).toBeNull();
    });

    it('debe lanzar NotFoundException si el lote de madera no existe', async () => {
      prisma.woodReceipt.findFirst.mockResolvedValue(null);

      await expect(
        service.getTraceability({
          queryType: TraceabilityQueryType.LOT_WOOD,
          queryValue: 'LT-MADERA-FAKE',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('traceByInvoice (INVOICE)', () => {
    it('debe reconstruir exitosamente la trazabilidad hacia atrás desde una factura de despacho', async () => {
      const dispatchWithRelations = {
        ...mockDispatchHeader,
        createdBy: { fullName: 'Supervisor Despachos' },
        dispatchDetails: [
          {
            id: 'dd-uuid-1',
            quantityDispatched: 1000,
            product: mockProduct,
            dailyProduction: mockDailyProduction,
            returnDetails: [
              {
                id: 'rd-uuid-1',
                quantityReturned: 150,
                returnHeader: mockReturnHeader,
              },
            ],
          },
        ],
      };

      prisma.dispatchHeader.findUnique.mockResolvedValue(dispatchWithRelations);

      const result = await service.getTraceability({
        queryType: TraceabilityQueryType.INVOICE,
        queryValue: 'F-1002',
      });

      expect(result.success).toBe(true);
      const data = result.data;

      expect(data.dispatches[0].invoiceNumber).toBe('F-1002');
      expect(data.production?.lot).toBe('LT-020926-W36');
      expect(data.rawMaterialOrigin[0].lotNumber).toBe('LT-020926-01');
      expect(data.fumigations[0].certificateNumber).toBe('OIRSA-NIC-2026-9901');
      expect(data.returns[0].quantityReturned).toBe(150);
    });

    it('debe lanzar NotFoundException si la factura no existe', async () => {
      prisma.dispatchHeader.findUnique.mockResolvedValue(null);

      await expect(
        service.getTraceability({
          queryType: TraceabilityQueryType.INVOICE,
          queryValue: 'F-INEXISTENTE',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('Validación de queryType inválido', () => {
    it('debe lanzar BadRequestException si el queryType no es soportado', async () => {
      await expect(
        service.getTraceability({
          queryType: 'INVALID_CRITERIA' as any,
          queryValue: 'XYZ',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Inmutabilidad y Operación Read-Only (RN-001)', () => {
    it('no debe exponer métodos de mutación (create, update, delete, patch)', () => {
      expect((service as any).create).toBeUndefined();
      expect((service as any).update).toBeUndefined();
      expect((service as any).patch).toBeUndefined();
      expect((service as any).delete).toBeUndefined();
      expect((service as any).remove).toBeUndefined();
    });
  });
});
