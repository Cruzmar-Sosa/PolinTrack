import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from '../audit.service';
import { PrismaService } from '../../../database/prisma.service';

describe('AuditService', () => {
  let service: AuditService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'uuid-log-1' }),
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'uuid-log-1',
            tableName: 'wood_receipts',
            recordId: 'c1b2c3d4-0000-0000-0000-000000000001',
            action: 'INSERT',
            oldValues: null,
            newValues: { lotNumber: 'LT-010926-01' },
            correctionReason: 'Registro inicial',
            userId: 'a1b2c3d4-0000-0000-0000-000000000001',
            createdAt: new Date('2026-09-03T10:00:00Z'),
            user: {
              fullName: 'Carlos Supervisor',
              email: 'carlos@polintrack.com',
              role: 'ADMIN',
            },
          },
        ]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  describe('recordAuditLog', () => {
    it('debe persistir el log de auditoría sanitizando valores sensibles', async () => {
      await service.recordAuditLog({
        tableName: 'users',
        recordId: 'c1b2c3d4-0000-0000-0000-000000000001',
        action: 'INSERT',
        newValues: {
          fullName: 'Juan Pérez',
          password: 'secret_password_123',
          token: 'auth_token_456',
        },
        userId: 'a1b2c3d4-0000-0000-0000-000000000001',
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tableName: 'users',
            recordId: 'c1b2c3d4-0000-0000-0000-000000000001',
            action: 'INSERT',
            newValues: {
              fullName: 'Juan Pérez',
              password: '[REDACTED]',
              token: '[REDACTED]',
            },
            userId: 'a1b2c3d4-0000-0000-0000-000000000001',
          }),
        }),
      );
    });

    it('invariante de resiliencia: si prisma falla, no debe lanzar excepción', async () => {
      prisma.auditLog.create.mockRejectedValueOnce(
        new Error('PostgreSQL connection drop'),
      );

      await expect(
        service.recordAuditLog({
          tableName: 'suppliers',
          recordId: 'c1b2c3d4-0000-0000-0000-000000000001',
          action: 'INSERT',
          userId: 'a1b2c3d4-0000-0000-0000-000000000001',
        }),
      ).resolves.not.toThrow();
    });

    it('debe omitir el guardado si userId o recordId no son UUID válidos', async () => {
      await service.recordAuditLog({
        tableName: 'suppliers',
        recordId: 'invalid-record-id',
        action: 'INSERT',
        userId: 'invalid-user-id',
      });

      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });
  });

  describe('getAuditLogs', () => {
    it('debe retornar lista paginada de logs con metadatos', async () => {
      const result = await service.getAuditLogs({
        page: 1,
        limit: 10,
        tableName: 'wood_receipts',
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].tableName).toBe('wood_receipts');
      expect(result.data[0].user.fullName).toBe('Carlos Supervisor');
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });
  });
});
