import { Test, TestingModule } from '@nestjs/testing';
import { CatalogsService } from './catalogs.service';
import { PrismaService } from '../../database/prisma.service';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { UnitOfMeasure } from '@prisma/client';

describe('CatalogsService (Master Data Administration)', () => {
  let service: CatalogsService;
  let prisma: any;

  const mockAdminId = '8f02fd0b-a581-486d-8b05-6d1f641688f3';

  beforeEach(async () => {
    prisma = {
      clientCenter: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      product: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      woodSpecies: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      woodType: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<CatalogsService>(CatalogsService);
  });

  describe('Centros de Destino / Plantas Cliente', () => {
    it('should create a new client center and record audit log', async () => {
      prisma.clientCenter.findUnique.mockResolvedValue(null);
      const mockCreated = {
        id: 'cc-123',
        name: 'Planta 8 — León Norte',
        location: 'León',
        isActive: true,
      };
      prisma.clientCenter.create.mockResolvedValue(mockCreated);

      const result = await service.createClientCenter(
        { name: 'Planta 8 — León Norte', location: 'León' },
        mockAdminId,
      );

      expect(prisma.clientCenter.create).toHaveBeenCalledWith({
        data: {
          name: 'Planta 8 — León Norte',
          location: 'León',
          isActive: true,
        },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tableName: 'client_centers',
            recordId: 'cc-123',
            action: 'INSERT',
          }),
        }),
      );
      expect(result.id).toBe('cc-123');
    });

    it('should throw ConflictException if client center name is duplicate', async () => {
      prisma.clientCenter.findUnique.mockResolvedValue({ id: 'cc-existing', name: 'Planta 1' });

      await expect(
        service.createClientCenter({ name: 'Planta 1' }, mockAdminId),
      ).rejects.toThrow(ConflictException);
    });

    it('should update client center and record audit log', async () => {
      prisma.clientCenter.findUnique
        .mockResolvedValueOnce({ id: 'cc-1', name: 'Planta 1', location: 'Chinandega' })
        .mockResolvedValueOnce(null); // No duplicate for new name
      prisma.clientCenter.update.mockResolvedValue({
        id: 'cc-1',
        name: 'Planta 1 Renovada',
        location: 'Chinandega Sur',
        isActive: true,
      });

      const result = await service.updateClientCenter(
        'cc-1',
        { name: 'Planta 1 Renovada', location: 'Chinandega Sur' },
        mockAdminId,
      );

      expect(prisma.clientCenter.update).toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tableName: 'client_centers',
            action: 'CORRECTION',
          }),
        }),
      );
      expect(result.name).toBe('Planta 1 Renovada');
    });

    it('should toggle active status of client center', async () => {
      prisma.clientCenter.findUnique.mockResolvedValue({ id: 'cc-1', name: 'Planta 1', isActive: true });
      prisma.clientCenter.update.mockResolvedValue({ id: 'cc-1', name: 'Planta 1', isActive: false });

      const result = await service.updateClientCenterStatus('cc-1', false, mockAdminId);
      expect(result.isActive).toBe(false);
    });
  });

  describe('Productos / Polines Normalizados', () => {
    it('should create a new product and record audit log', async () => {
      prisma.product.findUnique.mockResolvedValue(null);
      const mockProd = { id: 'prod-1', name: 'Polín 50x50', dimensions: '50x50', isActive: true };
      prisma.product.create.mockResolvedValue(mockProd);

      const result = await service.createProduct(
        { name: 'Polín 50x50', dimensions: '50x50' },
        mockAdminId,
      );

      expect(prisma.product.create).toHaveBeenCalledWith({
        data: { name: 'Polín 50x50', dimensions: '50x50', isActive: true },
      });
      expect(result.name).toBe('Polín 50x50');
    });

    it('should throw ConflictException on duplicate product name', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: 'prod-existing', name: 'Polín 45x48' });

      await expect(
        service.createProduct({ name: 'Polín 45x48', dimensions: '45x48' }, mockAdminId),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('Especies de Madera y Tipos de Madera', () => {
    it('should create a new wood species and record audit log', async () => {
      prisma.woodSpecies.findUnique.mockResolvedValue(null);
      const mockCreated = { id: 'spec-new', name: 'TECA', isActive: true };
      prisma.woodSpecies.create.mockResolvedValue(mockCreated);

      const result = await service.createWoodSpecies(
        { name: 'TECA' as any },
        mockAdminId,
      );

      expect(prisma.woodSpecies.create).toHaveBeenCalledWith({
        data: { name: 'TECA', isActive: true },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tableName: 'wood_species',
            action: 'INSERT',
          }),
        }),
      );
      expect(result.id).toBe('spec-new');
    });

    it('should throw ConflictException on duplicate wood species name', async () => {
      prisma.woodSpecies.findUnique.mockResolvedValue({ id: 'spec-1', name: 'PINO' });

      await expect(
        service.createWoodSpecies({ name: 'PINO' as any }, mockAdminId),
      ).rejects.toThrow(ConflictException);
    });

    it('should toggle wood species active status', async () => {
      prisma.woodSpecies.findUnique.mockResolvedValue({ id: 'spec-1', name: 'PINO', isActive: true });
      prisma.woodSpecies.update.mockResolvedValue({ id: 'spec-1', name: 'PINO', isActive: false });

      const result = await service.updateWoodSpeciesStatus('spec-1', false, mockAdminId);
      expect(result.isActive).toBe(false);
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tableName: 'wood_species',
            action: 'CORRECTION',
          }),
        }),
      );
    });

    it('should update wood type description and default unit', async () => {
      prisma.woodType.findUnique.mockResolvedValue({
        id: 'type-1',
        name: 'TIMBRE',
        defaultUnit: UnitOfMeasure.PIE_TABLAR,
        description: 'Madera en rollo',
      });
      prisma.woodType.update.mockResolvedValue({
        id: 'type-1',
        name: 'TIMBRE',
        defaultUnit: UnitOfMeasure.PIE_TABLAR,
        description: 'Madera rolliza aserrada',
      });

      const result = await service.updateWoodType(
        'type-1',
        { description: 'Madera rolliza aserrada' },
        mockAdminId,
      );

      expect(result.description).toBe('Madera rolliza aserrada');
    });
  });
});
