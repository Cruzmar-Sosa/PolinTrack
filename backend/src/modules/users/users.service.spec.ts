import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RoleType } from '@prisma/client';
import { UsersService } from './users.service';
import { PrismaService } from '../../database/prisma.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: any;
  let configService: any;
  let mockSupabaseAdmin: any;

  const mockAdminId = '8f02fd0b-a581-486d-8b05-6d1f641688f3';
  const mockUserId = '11111111-2222-3333-4444-555555555555';
  const mockAuthUserId = 'auth-uuid-9999-8888-777766665555';

  const mockUser = {
    id: mockUserId,
    email: 'operador@polintrack.com',
    fullName: 'Juan Pérez',
    role: RoleType.CONSULTA,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockSupabaseAdmin = {
      auth: {
        admin: {
          createUser: jest.fn().mockResolvedValue({
            data: { user: { id: mockAuthUserId } },
            error: null,
          }),
          updateUserById: jest.fn().mockResolvedValue({ error: null }),
          deleteUser: jest.fn().mockResolvedValue({ error: null }),
        },
      },
    };

    prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([mockUser]),
        count: jest.fn().mockResolvedValue(1),
        findUnique: jest.fn(),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({
          ...mockUser,
          id: data.id,
          email: data.email,
          fullName: data.fullName,
          role: data.role,
        })),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({
          ...mockUser,
          ...data,
        })),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };

    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'SUPABASE_URL') return 'https://mock.supabase.co';
        if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'mock-service-role-key';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    // Inject the mock Supabase Admin client
    (service as any).supabaseAdmin = mockSupabaseAdmin;
  });

  describe('findAll', () => {
    it('should return paginated users list without password_hash', async () => {
      const result = await service.findAll({ page: 1, limit: 10 });
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].email).toBe(mockUser.email);
      expect((result.data[0] as any).passwordHash).toBeUndefined();
      expect(result.meta.total).toBe(1);
    });

    it('should filter by role when provided', async () => {
      await service.findAll({ role: RoleType.ADMIN });
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ role: RoleType.ADMIN }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return user when found', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      const result = await service.findOne(mockUserId);
      expect(result.success).toBe(true);
      expect(result.data.id).toBe(mockUserId);
    });

    it('should throw NotFoundException when user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.findOne('non-existent-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create (Atomic Identity & Operational Profile)', () => {
    it('should throw ConflictException if email is already in database', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      await expect(
        service.create(
          {
            email: mockUser.email,
            password: 'PolinTrack2026!Password',
            fullName: 'Test',
            role: RoleType.CONSULTA,
          },
          mockAdminId,
        ),
      ).rejects.toThrow(ConflictException);
      expect(mockSupabaseAdmin.auth.admin.createUser).not.toHaveBeenCalled();
    });

    it('should create identity in Supabase Auth first, then operational profile with identical UUID', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.create(
        {
          email: 'nuevo@polintrack.com',
          password: 'PolinTrack2026!Password',
          fullName: 'Nuevo Usuario',
          role: RoleType.CONTABILIDAD,
        },
        mockAdminId,
      );

      expect(mockSupabaseAdmin.auth.admin.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'nuevo@polintrack.com',
          email_confirm: true,
        }),
      );

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            id: mockAuthUserId, // Exactly matches Supabase Auth UUID
            email: 'nuevo@polintrack.com',
            role: RoleType.CONTABILIDAD,
            passwordHash: 'supabase_managed_auth_identity',
          }),
        }),
      );

      expect(result.data.id).toBe(mockAuthUserId);
    });

    it('should fail-closed if Supabase Auth identity creation fails without creating DB record', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      mockSupabaseAdmin.auth.admin.createUser.mockResolvedValue({
        data: null,
        error: { message: 'Invalid API key or network error' },
      });

      await expect(
        service.create(
          {
            email: 'fail@polintrack.com',
            password: 'PolinTrack2026!Password',
            fullName: 'Fail User',
            role: RoleType.CONSULTA,
          },
          mockAdminId,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('should execute compensating rollback deleting auth.users identity if database create fails', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockRejectedValue(new Error('PostgreSQL connection dropped'));

      await expect(
        service.create(
          {
            email: 'rollback@polintrack.com',
            password: 'PolinTrack2026!Password',
            fullName: 'Rollback User',
            role: RoleType.CONSULTA,
          },
          mockAdminId,
        ),
      ).rejects.toThrow('PostgreSQL connection dropped');

      // Compensating deleteUser must be called with the authUserId
      expect(mockSupabaseAdmin.auth.admin.deleteUser).toHaveBeenCalledWith(mockAuthUserId);
    });
  });

  describe('update (Password and Profile Management)', () => {
    it('should delegate password update to Supabase Auth and never touch public.users.password_hash', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.update(
        mockUserId,
        {
          fullName: 'Juan Actualizado',
          role: RoleType.CONTABILIDAD,
          password: 'NewSecurePassword2026!',
        },
        mockAdminId,
      );

      expect(mockSupabaseAdmin.auth.admin.updateUserById).toHaveBeenCalledWith(
        mockUserId,
        { password: 'NewSecurePassword2026!' },
      );

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockUserId },
          data: {
            fullName: 'Juan Actualizado',
            role: RoleType.CONTABILIDAD,
          },
        }),
      );

      expect(result.data.fullName).toBe('Juan Actualizado');
    });

    it('should throw BadRequestException if Supabase Auth password update fails', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      mockSupabaseAdmin.auth.admin.updateUserById.mockResolvedValue({
        error: { message: 'Password is too weak or expired' },
      });

      await expect(
        service.update(
          mockUserId,
          { password: 'weak' },
          mockAdminId,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('updateStatus', () => {
    it('should throw BadRequestException if admin tries to deactivate themselves', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...mockUser, id: mockAdminId });
      await expect(
        service.updateStatus(mockAdminId, { isActive: false }, mockAdminId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update user status and record AuditLog', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue({
        id: mockUserId,
        isActive: false,
        updatedAt: new Date(),
      });

      const result = await service.updateStatus(mockUserId, { isActive: false }, mockAdminId);
      expect(result.success).toBe(true);
      expect(result.data.isActive).toBe(false);
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tableName: 'users',
            recordId: mockUserId,
            action: 'UPDATE_STATUS',
            userId: mockAdminId,
          }),
        }),
      );
    });
  });
});
