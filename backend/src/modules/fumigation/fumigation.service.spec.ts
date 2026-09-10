import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FumigationService } from './fumigation.service';
import { SupabaseStorageService } from './supabase-storage.service';
import { PrismaService } from '../../database/prisma.service';

describe('FumigationService', () => {
  let service: FumigationService;
  let prisma: any;
  let storageService: any;

  const mockUser = {
    id: 'user-uuid-1',
    email: 'admin@polintrack.com',
    role: 'ADMIN',
  };

  const mockDailyProduction1 = {
    id: 'prod-uuid-1',
    productionLot: 'LT-020926-W36',
    productId: null,
    quantityProduced: 100,
    productionDate: new Date('2026-09-02'),
    isoWeek: 36,
    productionDetails: [
      {
        id: 'detail-uuid-1',
        productId: 'product-uuid-1',
        quantityProduced: 60,
        product: { id: 'product-uuid-1', name: 'Polín 45x48', dimensions: '45x48' },
      },
      {
        id: 'detail-uuid-2',
        productId: 'product-uuid-2',
        quantityProduced: 40,
        product: { id: 'product-uuid-2', name: 'Polín 45x47', dimensions: '45x47' },
      },
    ],
  };

  const mockDailyProduction2 = {
    id: 'prod-uuid-2',
    productionLot: 'LT-030926-W36',
    productId: null,
    quantityProduced: 80,
    productionDate: new Date('2026-09-03'),
    isoWeek: 36,
    productionDetails: [
      {
        id: 'detail-uuid-3',
        productId: 'product-uuid-3',
        quantityProduced: 80,
        product: { id: 'product-uuid-3', name: 'Polín 48x54', dimensions: '48x54' },
      },
    ],
  };

  const validPdfBuffer = Buffer.from('%PDF-1.4 Mock valid PDF content for OIRSA certificate');

  const createMockFile = (overrides?: Partial<Express.Multer.File>): Express.Multer.File => ({
    fieldname: 'file',
    originalname: 'OIRSA-CERT-2026-001.pdf',
    encoding: '7bit',
    mimetype: 'application/pdf',
    size: validPdfBuffer.length,
    buffer: validPdfBuffer,
    destination: '',
    filename: '',
    path: '',
    stream: null as any,
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      dailyProduction: {
        findUnique: jest.fn(),
      },
      fumigation: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      inventoryMovement: {
        create: jest.fn(),
      },
    };

    storageService = {
      uploadFile: jest.fn().mockResolvedValue({ path: 'certificates/2026/09/sample.pdf' }),
      createSignedUrl: jest.fn().mockResolvedValue({
        downloadUrl: 'https://supabase.co/signed-url-test',
        signedUrl: 'https://supabase.co/signed-url-test',
        expiresInSeconds: 900,
      }),
      deleteFile: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FumigationService,
        { provide: PrismaService, useValue: prisma },
        { provide: SupabaseStorageService, useValue: storageService },
      ],
    }).compile();

    service = module.get<FumigationService>(FumigationService);
  });

  describe('create - Validaciones de archivo PDF', () => {
    it('debe rechazar la operación si no se envía archivo adjunto', async () => {
      const dto = {
        lots: [{ dailyProductionId: 'prod-uuid-1', productIds: ['product-uuid-1'] }],
        fumigationDate: '2026-09-02',
        fumigationTime: '14:30',
        certificateNumber: 'OIRSA-123',
      };

      await expect(service.create(dto, null as any, mockUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('debe rechazar la operación si el archivo excede los 10 MB', async () => {
      const dto = {
        lots: [{ dailyProductionId: 'prod-uuid-1', productIds: ['product-uuid-1'] }],
        fumigationDate: '2026-09-02',
        fumigationTime: '14:30',
        certificateNumber: 'OIRSA-123',
      };

      const oversizedFile = createMockFile({
        size: 11 * 1024 * 1024,
      });

      await expect(service.create(dto, oversizedFile, mockUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(dto, oversizedFile, mockUser)).rejects.toThrow(
        /excede el tamaño máximo permitido de 10 MB/,
      );
    });

    it('debe rechazar la operación si el archivo no tiene MIME application/pdf', async () => {
      const dto = {
        lots: [{ dailyProductionId: 'prod-uuid-1', productIds: ['product-uuid-1'] }],
        fumigationDate: '2026-09-02',
        fumigationTime: '14:30',
        certificateNumber: 'OIRSA-123',
      };

      const invalidMimeFile = createMockFile({
        mimetype: 'image/jpeg',
        originalname: 'certificate.jpg',
      });

      await expect(service.create(dto, invalidMimeFile, mockUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('debe rechazar la operación si el buffer no contiene magic bytes %PDF-', async () => {
      const dto = {
        lots: [{ dailyProductionId: 'prod-uuid-1', productIds: ['product-uuid-1'] }],
        fumigationDate: '2026-09-02',
        fumigationTime: '14:30',
        certificateNumber: 'OIRSA-123',
      };

      const corruptPdfFile = createMockFile({
        buffer: Buffer.from('NOT_A_REAL_PDF_HEADER_CONTENT'),
      });

      await expect(service.create(dto, corruptPdfFile, mockUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(dto, corruptPdfFile, mockUser)).rejects.toThrow(
        /cabecera corrupta o inválida/,
      );
    });
  });

  describe('create - Validaciones de Dominio Multi-Lote y Productos (RN-FUM-MULTI)', () => {
    it('debe rechazar si no se proporciona ni lots ni dailyProductionId', async () => {
      const dto = {
        fumigationDate: '2026-09-02',
        fumigationTime: '14:30',
        certificateNumber: 'OIRSA-123',
      };

      await expect(service.create(dto, createMockFile(), mockUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('debe lanzar NotFoundException si alguna orden de producción no existe', async () => {
      prisma.dailyProduction.findUnique.mockResolvedValue(null);

      const dto = {
        lots: [{ dailyProductionId: 'non-existent-uuid', productIds: ['prod-1'] }],
        fumigationDate: '2026-09-02',
        fumigationTime: '14:30',
        certificateNumber: 'OIRSA-123',
      };

      await expect(service.create(dto, createMockFile(), mockUser)).rejects.toThrow(
        NotFoundException,
      );
      expect(storageService.uploadFile).not.toHaveBeenCalled();
    });

    it('debe rechazar si un lote tiene lista vacía de productIds (lote sin productos)', async () => {
      const dto = {
        lots: [{ dailyProductionId: 'prod-uuid-1', productIds: [] }],
        fumigationDate: '2026-09-02',
        fumigationTime: '14:30',
        certificateNumber: 'OIRSA-123',
      };

      await expect(service.create(dto, createMockFile(), mockUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(dto, createMockFile(), mockUser)).rejects.toThrow(
        /Debe seleccionar al menos un producto tratado/,
      );
    });

    it('debe rechazar con 400 si un productId no pertenece a la orden de producción diaria', async () => {
      prisma.dailyProduction.findUnique.mockResolvedValue(mockDailyProduction1);

      const dto = {
        lots: [
          {
            dailyProductionId: mockDailyProduction1.id,
            productIds: ['foreign-product-uuid-999'], // No pertenece a LT-020926-W36
          },
        ],
        fumigationDate: '2026-09-02',
        fumigationTime: '14:30',
        certificateNumber: 'OIRSA-123',
      };

      await expect(service.create(dto, createMockFile(), mockUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(dto, createMockFile(), mockUser)).rejects.toThrow(
        /no pertenece a la orden de producción/,
      );
    });
  });

  describe('create - Flujo Exitoso Multi-Lote, Inmutabilidad y Auditoría', () => {
    it('debe registrar exitosamente un tratamiento multi-lote con selección granular de productos', async () => {
      prisma.dailyProduction.findUnique
        .mockResolvedValueOnce(mockDailyProduction1)
        .mockResolvedValueOnce(mockDailyProduction2);

      const mockCreatedFumigation = {
        id: 'fumigation-uuid-multi',
        dailyProductionId: mockDailyProduction1.id,
        fumigationDate: new Date('2026-09-02T00:00:00.000Z'),
        fumigationTime: new Date('1970-01-01T14:30:00.000Z'),
        certificateNumber: 'OIRSA-2026-MULTI-01',
        observations: 'Tratamiento fitosanitario multi-lote exitoso',
        pdfFilePath: 'certificates/2026/09/sample.pdf',
        pdfFileName: 'OIRSA-CERT-2026-001.pdf',
        fileSizeBytes: validPdfBuffer.length,
        registeredById: mockUser.id,
        details: [
          {
            id: 'fdetail-1',
            dailyProductionId: mockDailyProduction1.id,
            productId: 'product-uuid-1',
            productionDetailId: 'detail-uuid-1',
          },
          {
            id: 'fdetail-2',
            dailyProductionId: mockDailyProduction2.id,
            productId: 'product-uuid-3',
            productionDetailId: 'detail-uuid-3',
          },
        ],
      };

      prisma.fumigation.create.mockResolvedValue(mockCreatedFumigation);
      prisma.auditLog.create.mockResolvedValue({ id: 'audit-uuid-1' });

      const dto = {
        lots: [
          {
            dailyProductionId: mockDailyProduction1.id,
            productIds: ['product-uuid-1'], // Selección parcial: solo 1 de los 2 productos
          },
          {
            dailyProductionId: mockDailyProduction2.id,
            productIds: ['product-uuid-3'],
          },
        ],
        fumigationDate: '2026-09-02',
        fumigationTime: '14:30',
        certificateNumber: 'OIRSA-2026-MULTI-01',
        observations: 'Tratamiento fitosanitario multi-lote exitoso',
      };

      const result = await service.create(dto, createMockFile(), mockUser);

      expect(result.success).toBe(true);
      expect(storageService.uploadFile).toHaveBeenCalledWith(
        expect.stringMatching(/^certificates\/2026\/09\/.+\.pdf$/),
        validPdfBuffer,
        'application/pdf',
      );
      expect(prisma.fumigation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            certificateNumber: 'OIRSA-2026-MULTI-01',
            details: {
              create: expect.arrayContaining([
                expect.objectContaining({
                  dailyProductionId: mockDailyProduction1.id,
                  productId: 'product-uuid-1',
                  productionDetailId: 'detail-uuid-1',
                }),
                expect.objectContaining({
                  dailyProductionId: mockDailyProduction2.id,
                  productId: 'product-uuid-3',
                  productionDetailId: 'detail-uuid-3',
                }),
              ]),
            },
          }),
        }),
      );

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: mockUser.id,
          action: 'CREATE',
          tableName: 'fumigations',
          recordId: mockCreatedFumigation.id,
        }),
      });

      // INVARIANTE CRÍTICA RN-011: Fumigación NO genera movimiento de inventario
      expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
    });

    it('debe mantener compatibilidad hacia atrás cuando se envía dailyProductionId sin lots', async () => {
      prisma.dailyProduction.findUnique.mockResolvedValue(mockDailyProduction1);
      prisma.fumigation.create.mockResolvedValue({
        id: 'fum-legacy',
        dailyProductionId: mockDailyProduction1.id,
      });
      prisma.auditLog.create.mockResolvedValue({ id: 'audit-legacy' });

      const dto = {
        dailyProductionId: mockDailyProduction1.id,
        fumigationDate: '2026-09-02',
        fumigationTime: '14:30',
        certificateNumber: 'OIRSA-LEGACY-001',
      };

      const result = await service.create(dto, createMockFile(), mockUser);
      expect(result.success).toBe(true);
      expect(prisma.fumigation.create).toHaveBeenCalled();
    });
  });

  describe('create - Two-Phase Compensation (Compensating Delete)', () => {
    it('debe ejecutar deleteFile en storage si la persistencia en PostgreSQL falla', async () => {
      prisma.dailyProduction.findUnique.mockResolvedValue(mockDailyProduction1);
      prisma.fumigation.create.mockRejectedValue(new Error('PostgreSQL connection timeout'));

      const dto = {
        lots: [{ dailyProductionId: mockDailyProduction1.id, productIds: ['product-uuid-1'] }],
        fumigationDate: '2026-09-02',
        fumigationTime: '14:30',
        certificateNumber: 'OIRSA-123',
      };

      await expect(service.create(dto, createMockFile(), mockUser)).rejects.toThrow(
        /Error al registrar el evento de fumigación en la base de datos/,
      );

      // Verificación de borrado compensatorio
      expect(storageService.deleteFile).toHaveBeenCalledTimes(1);
      expect(storageService.deleteFile).toHaveBeenCalledWith(
        expect.stringMatching(/^certificates\/2026\/09\/.+\.pdf$/),
      );
    });
  });

  describe('findAll - Consultas paginadas y filtradas', () => {
    it('debe devolver la lista paginada de fumigaciones', async () => {
      prisma.fumigation.count.mockResolvedValue(1);
      prisma.fumigation.findMany.mockResolvedValue([
        {
          id: 'fum-1',
          dailyProductionId: 'prod-1',
          certificateNumber: 'OIRSA-100',
          fumigationDate: new Date('2026-09-02'),
          details: [
            {
              dailyProductionId: 'prod-1',
              productId: 'product-uuid-1',
            },
          ],
        },
      ]);

      const result = await service.findAll({ page: 1, limit: 10 });
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.totalPages).toBe(1);
    });
  });

  describe('getCertificateSignedUrl - Signed URL con TTL de 15 minutos (900s)', () => {
    it('debe generar una URL firmada con vigencia exacta de 900 segundos', async () => {
      prisma.fumigation.findUnique.mockResolvedValue({
        id: 'fum-uuid-1',
        pdfFilePath: 'certificates/2026/09/cert-uuid.pdf',
      });

      const result = await service.getCertificateSignedUrl('fum-uuid-1');

      expect(result.success).toBe(true);
      expect(storageService.createSignedUrl).toHaveBeenCalledWith(
        'certificates/2026/09/cert-uuid.pdf',
        900,
      );
      expect(result.data.expiresInSeconds).toBe(900);
      expect(result.data.downloadUrl).toBe('https://supabase.co/signed-url-test');
    });

    it('debe lanzar NotFoundException si el registro de fumigación no existe', async () => {
      prisma.fumigation.findUnique.mockResolvedValue(null);

      await expect(
        service.getCertificateSignedUrl('non-existent-uuid'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
