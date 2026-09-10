import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { PrismaService } from '../../database/prisma.service';

describe('SuppliersService', () => {
  let service: SuppliersService;
  let prisma: any;

  const mockUserId = '8f02fd0b-a581-486d-8b05-6d1f641688f3';
  const mockSupplierId = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

  const mockSupplier = {
    id: mockSupplierId,
    name: 'Maderas del Norte S.A.',
    legalId: 'J-0310000000001',
    phone: '+505 8888-9999',
    notes: 'Proveedor de teca',
    documentUrl: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      supplier: {
        findMany: jest.fn().mockResolvedValue([mockSupplier]),
        count: jest.fn().mockResolvedValue(1),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            ...mockSupplier,
            ...data,
            id: mockSupplierId,
          }),
        ),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            ...mockSupplier,
            ...data,
          }),
        ),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-supplier-1' }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuppliersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<SuppliersService>(SuppliersService);
  });

  describe('findAll', () => {
    it('should return paginated list of suppliers', async () => {
      const result = await service.findAll({ page: 1, limit: 10 });
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe(mockSupplier.name);
      expect(result.meta.total).toBe(1);
    });

    it('should filter by isActive status', async () => {
      await service.findAll({ isActive: true });
      expect(prisma.supplier.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: true }),
        }),
      );
    });

    it('should filter by isActive: true when includeInactive is false', async () => {
      await service.findAll({ includeInactive: false });
      expect(prisma.supplier.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: true }),
        }),
      );
    });

    it('should not filter by isActive when includeInactive is true', async () => {
      await service.findAll({ includeInactive: true });
      expect(prisma.supplier.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ isActive: expect.anything() }),
        }),
      );
    });

    it('should search by text across name, legalId, and phone', async () => {
      await service.findAll({ search: 'Norte' });
      expect(prisma.supplier.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { name: { contains: 'Norte', mode: 'insensitive' } },
            ]),
          }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return supplier by ID when found', async () => {
      prisma.supplier.findUnique.mockResolvedValue(mockSupplier);
      const result = await service.findOne(mockSupplierId);
      expect(result.success).toBe(true);
      expect(result.data.id).toBe(mockSupplierId);
    });

    it('should throw NotFoundException when supplier not found', async () => {
      prisma.supplier.findUnique.mockResolvedValue(null);
      await expect(service.findOne('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('should create supplier and register AuditLog', async () => {
      prisma.supplier.findUnique.mockResolvedValue(null);
      prisma.supplier.findFirst.mockResolvedValue(null);

      const result = await service.create(
        {
          name: '  Maderas del Bosque  ',
          legalId: 'J-9999999',
          phone: '+505 2222-3333',
        },
        mockUserId,
      );

      expect(result.success).toBe(true);
      expect(prisma.supplier.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Maderas del Bosque', // Normalized trimmed name
            legalId: 'J-9999999',
            isActive: true,
          }),
        }),
      );

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tableName: 'suppliers',
            action: 'INSERT',
            userId: mockUserId,
          }),
        }),
      );
    });

    it('should throw ConflictException if supplier name already exists (FA-01)', async () => {
      prisma.supplier.findUnique.mockResolvedValue(mockSupplier);

      await expect(
        service.create(
          {
            name: mockSupplier.name,
            legalId: 'J-9999999',
          },
          mockUserId,
        ),
      ).rejects.toThrow(ConflictException);

      expect(prisma.supplier.create).not.toHaveBeenCalled();
    });

    it('should throw ConflictException (DUPLICATE_RUC) if supplier RUC already exists', async () => {
      prisma.supplier.findUnique.mockResolvedValue(null);
      prisma.supplier.findFirst.mockResolvedValue(mockSupplier);

      try {
        await service.create(
          {
            name: 'Nueva Empresa',
            legalId: mockSupplier.legalId,
          },
          mockUserId,
        );
        fail('Should have thrown ConflictException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(ConflictException);
        expect(err.getResponse().code).toBe('DUPLICATE_RUC');
      }

      expect(prisma.supplier.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update supplier data and register AuditLog', async () => {
      prisma.supplier.findUnique.mockResolvedValue(mockSupplier);

      const result = await service.update(
        mockSupplierId,
        {
          phone: '+505 7777-8888',
          notes: 'Nuevas notas operativas',
        },
        mockUserId,
      );

      expect(result.success).toBe(true);
      expect(prisma.supplier.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockSupplierId },
          data: expect.objectContaining({
            phone: '+505 7777-8888',
            notes: 'Nuevas notas operativas',
          }),
        }),
      );

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tableName: 'suppliers',
            action: 'UPDATE',
            userId: mockUserId,
          }),
        }),
      );
    });

    it('should register UPDATE_STATUS in AuditLog when isActive is modified', async () => {
      prisma.supplier.findUnique.mockResolvedValue(mockSupplier);

      await service.update(
        mockSupplierId,
        {
          isActive: false,
        },
        mockUserId,
      );

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tableName: 'suppliers',
            action: 'UPDATE_STATUS',
            userId: mockUserId,
          }),
        }),
      );
    });

    it('should throw ConflictException if updated name belongs to another supplier', async () => {
      prisma.supplier.findUnique.mockResolvedValue(mockSupplier);
      prisma.supplier.findFirst.mockResolvedValue({
        id: 'other-supplier-uuid',
        name: 'Maderas Ya Existente',
      });

      await expect(
        service.update(
          mockSupplierId,
          { name: 'Maderas Ya Existente' },
          mockUserId,
        ),
      ).rejects.toThrow(ConflictException);

      expect(prisma.supplier.update).not.toHaveBeenCalled();
    });

    it('should throw ConflictException (DUPLICATE_RUC) if updated legalId belongs to another supplier', async () => {
      prisma.supplier.findUnique.mockResolvedValue(mockSupplier);
      prisma.supplier.findFirst.mockResolvedValue({
        id: 'other-supplier-uuid',
        legalId: 'J-8888888',
      });

      try {
        await service.update(
          mockSupplierId,
          { legalId: 'J-8888888' },
          mockUserId,
        );
        fail('Should have thrown ConflictException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(ConflictException);
        expect(err.getResponse().code).toBe('DUPLICATE_RUC');
      }

      expect(prisma.supplier.update).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if supplier to update does not exist', async () => {
      prisma.supplier.findUnique.mockResolvedValue(null);

      await expect(
        service.update('non-existent-id', { name: 'Test' }, mockUserId),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
