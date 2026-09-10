import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UnitOfMeasure, WoodSpeciesEnum, WoodTypeEnum } from '@prisma/client';
import { WoodReceiptsService } from './wood-receipts.service';
import { PrismaService } from '../../database/prisma.service';

describe('WoodReceiptsService', () => {
  let service: WoodReceiptsService;
  let prisma: any;

  const mockUserId = '8f02fd0b-a581-486d-8b05-6d1f641688f3';
  const mockSupplierId = '594aeb10-8867-4469-a5db-93152720926f';
  const mockSpeciesId = '3ca7b810-9dad-11d1-80b4-00c04fd430c1';
  const mockTimbreTypeId = '4ca7b810-9dad-11d1-80b4-00c04fd430c2';
  const mockProcesadaTypeId = '4ca7b810-9dad-11d1-80b4-00c04fd430c3';

  const mockSupplier = {
    id: mockSupplierId,
    name: 'Maderas El Bosque',
    legalId: 'J-0310001234567',
    isActive: true,
  };

  const mockSpecies = {
    id: mockSpeciesId,
    name: WoodSpeciesEnum.TECA,
    isActive: true,
  };

  const mockTimbreType = {
    id: mockTimbreTypeId,
    name: WoodTypeEnum.TIMBRE,
    defaultUnit: UnitOfMeasure.PIE_TABLAR,
    isActive: true,
  };

  const mockProcesadaType = {
    id: mockProcesadaTypeId,
    name: WoodTypeEnum.PROCESADA,
    defaultUnit: UnitOfMeasure.PIEZAS,
    isActive: true,
  };

  beforeEach(async () => {
    prisma = {
      supplier: {
        findUnique: jest.fn().mockResolvedValue(mockSupplier),
      },
      woodSpecies: {
        findUnique: jest.fn().mockResolvedValue(mockSpecies),
      },
      woodType: {
        findUnique: jest.fn().mockImplementation(({ where: { id } }) => {
          if (id === mockTimbreTypeId) return Promise.resolve(mockTimbreType);
          if (id === mockProcesadaTypeId) return Promise.resolve(mockProcesadaType);
          return Promise.resolve(null);
        }),
      },
      woodReceipt: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockImplementation(({ data, include }) =>
          Promise.resolve({
            id: 'receipt-uuid-1',
            ...data,
            supplier: mockSupplier,
            species: mockSpecies,
            woodType: mockTimbreType,
            createdBy: {
              id: mockUserId,
              fullName: 'Operador Recepción',
              email: 'operador@polintrack.com',
            },
            createdAt: new Date(),
          }),
        ),
        findUnique: jest.fn().mockResolvedValue({
          id: 'receipt-uuid-1',
          lotNumber: 'LT-020926-01',
          supplier: mockSupplier,
          species: mockSpecies,
          woodType: mockTimbreType,
          quantity: 1000,
          unit: UnitOfMeasure.PIE_TABLAR,
        }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-uuid-1' }),
      },
      $transaction: jest.fn().mockImplementation((callback) => callback(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WoodReceiptsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<WoodReceiptsService>(WoodReceiptsService);
  });

  describe('generateLotNumber (RN-009)', () => {
    it('should generate LT-020926-01 when no receipts exist for that date', async () => {
      prisma.woodReceipt.findFirst.mockResolvedValue(null);

      const lot = await service.generateLotNumber('2026-09-02', prisma);
      expect(lot).toBe('LT-020926-01');
    });

    it('should increment to LT-020926-02 when LT-020926-01 already exists', async () => {
      prisma.woodReceipt.findFirst.mockResolvedValue({
        lotNumber: 'LT-020926-01',
      });

      const lot = await service.generateLotNumber('2026-09-02', prisma);
      expect(lot).toBe('LT-020926-02');
    });

    it('should correctly pad two digits for double digit sequence (09 -> 10)', async () => {
      prisma.woodReceipt.findFirst.mockResolvedValue({
        lotNumber: 'LT-020926-09',
      });

      const lot = await service.generateLotNumber('2026-09-02', prisma);
      expect(lot).toBe('LT-020926-10');
    });
  });

  describe('create (UC-REC-01)', () => {
    it('should register wood receipt with TIMBRE and auto-assign PIE_TABLAR (RN-016)', async () => {
      const result = await service.create(
        {
          supplierId: mockSupplierId,
          speciesId: mockSpeciesId,
          woodTypeId: mockTimbreTypeId,
          quantity: 1500.5,
          receiptDate: '2026-09-01',
          receiptTime: '08:30:00',
          guideNumber: 'GUIA-888',
          woodStatus: 'Madera Verde',
        },
        mockUserId,
      );

      expect(result.lotNumber).toBe('LT-010926-01');
      expect(result.unit).toBe(UnitOfMeasure.PIE_TABLAR);
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tableName: 'wood_receipts',
            action: 'INSERT',
            userId: mockUserId,
          }),
        }),
      );
    });

    it('should auto-assign PIEZAS when wood type is PROCESADA with valid Yugos and Reglas (RN-016-B)', async () => {
      const result = await service.create(
        {
          supplierId: mockSupplierId,
          speciesId: mockSpeciesId,
          woodTypeId: mockProcesadaTypeId,
          quantity: 400,
          yugosQuantity: 250,
          reglasQuantity: 150,
          receiptDate: '2026-09-01',
          receiptTime: '10:00',
        },
        mockUserId,
      );

      expect(result.unit).toBe(UnitOfMeasure.PIEZAS);
      expect(result.yugosQuantity).toBe(250);
      expect(result.reglasQuantity).toBe(150);
    });

    it('should create processed wood receipt with only Yugos (RN-016-B)', async () => {
      const result = await service.create(
        {
          supplierId: mockSupplierId,
          speciesId: mockSpeciesId,
          woodTypeId: mockProcesadaTypeId,
          quantity: 100,
          yugosQuantity: 100,
          reglasQuantity: 0,
          receiptDate: '2026-09-01',
          receiptTime: '10:00',
        },
        mockUserId,
      );

      expect(result.unit).toBe(UnitOfMeasure.PIEZAS);
      expect(Number(result.quantity)).toBe(100);
      expect(result.yugosQuantity).toBe(100);
      expect(result.reglasQuantity).toBe(0);
    });

    it('should create processed wood receipt with only Reglas (RN-016-B)', async () => {
      const result = await service.create(
        {
          supplierId: mockSupplierId,
          speciesId: mockSpeciesId,
          woodTypeId: mockProcesadaTypeId,
          quantity: 80,
          yugosQuantity: 0,
          reglasQuantity: 80,
          receiptDate: '2026-09-01',
          receiptTime: '10:00',
        },
        mockUserId,
      );

      expect(result.unit).toBe(UnitOfMeasure.PIEZAS);
      expect(Number(result.quantity)).toBe(80);
      expect(result.yugosQuantity).toBe(0);
      expect(result.reglasQuantity).toBe(80);
    });

    it('should throw BadRequestException if processed wood has neither Yugos nor Reglas > 0 (RN-016-B)', async () => {
      await expect(
        service.create(
          {
            supplierId: mockSupplierId,
            speciesId: mockSpeciesId,
            woodTypeId: mockProcesadaTypeId,
            quantity: 0,
            yugosQuantity: 0,
            reglasQuantity: 0,
            receiptDate: '2026-09-01',
            receiptTime: '10:00',
          },
          mockUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if quantity does not match sum of yugos and reglas (RN-016-B)', async () => {
      await expect(
        service.create(
          {
            supplierId: mockSupplierId,
            speciesId: mockSpeciesId,
            woodTypeId: mockProcesadaTypeId,
            quantity: 200,
            yugosQuantity: 120,
            reglasQuantity: 70, // 120 + 70 = 190 != 200
            receiptDate: '2026-09-01',
            receiptTime: '10:00',
          },
          mockUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if yugosQuantity or reglasQuantity is provided for TIMBRE (RN-016-B)', async () => {
      await expect(
        service.create(
          {
            supplierId: mockSupplierId,
            speciesId: mockSpeciesId,
            woodTypeId: mockTimbreTypeId,
            quantity: 1500,
            yugosQuantity: 50,
            receiptDate: '2026-09-01',
            receiptTime: '10:00',
          },
          mockUserId,
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.create(
          {
            supplierId: mockSupplierId,
            speciesId: mockSpeciesId,
            woodTypeId: mockTimbreTypeId,
            quantity: 1500,
            reglasQuantity: 50,
            receiptDate: '2026-09-01',
            receiptTime: '10:00',
          },
          mockUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if quantity <= 0 (FA-02)', async () => {
      await expect(
        service.create(
          {
            supplierId: mockSupplierId,
            speciesId: mockSpeciesId,
            woodTypeId: mockTimbreTypeId,
            quantity: 0,
            receiptDate: '2026-09-01',
            receiptTime: '10:00',
          },
          mockUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if supplier does not exist or is inactive (FA-01)', async () => {
      prisma.supplier.findUnique.mockResolvedValue(null);

      await expect(
        service.create(
          {
            supplierId: 'non-existent-supplier',
            speciesId: mockSpeciesId,
            woodTypeId: mockTimbreTypeId,
            quantity: 500,
            receiptDate: '2026-09-01',
            receiptTime: '10:00',
          },
          mockUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if species does not exist', async () => {
      prisma.woodSpecies.findUnique.mockResolvedValue(null);

      await expect(
        service.create(
          {
            supplierId: mockSupplierId,
            speciesId: 'non-existent-species',
            woodTypeId: mockTimbreTypeId,
            quantity: 500,
            receiptDate: '2026-09-01',
            receiptTime: '10:00',
          },
          mockUserId,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if receiptDate is in the future (FA-03)', async () => {
      await expect(
        service.create(
          {
            supplierId: mockSupplierId,
            speciesId: mockSpeciesId,
            woodTypeId: mockTimbreTypeId,
            quantity: 500,
            receiptDate: '2099-12-31',
            receiptTime: '10:00',
          },
          mockUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll (UC-REC-02)', () => {
    it('should throw BadRequestException if startDate > endDate (RN-007)', async () => {
      await expect(
        service.findAll({
          startDate: '2026-09-15',
          endDate: '2026-09-10',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return paginated list when query is valid', async () => {
      const result = await service.findAll({
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        page: 1,
        limit: 10,
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
      expect(result.meta.page).toBe(1);
    });
  });

  describe('findOne (UC-REC-02)', () => {
    it('should return wood receipt when found', async () => {
      const result = await service.findOne('receipt-uuid-1');
      expect(result.success).toBe(true);
      expect(result.data.lotNumber).toBe('LT-020926-01');
    });

    it('should throw NotFoundException when not found', async () => {
      prisma.woodReceipt.findUnique.mockResolvedValue(null);

      await expect(service.findOne('invalid-uuid')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('Inmutabilidad (RN-001)', () => {
    it('should NOT have update or delete methods in service', () => {
      expect((service as any).update).toBeUndefined();
      expect((service as any).delete).toBeUndefined();
      expect((service as any).remove).toBeUndefined();
    });
  });
});
