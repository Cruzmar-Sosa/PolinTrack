import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@/database/prisma.service';
import { AuthService } from './auth.service';
import * as bcrypt from 'bcryptjs';

describe('AuthService (QA-06D-02 Security Hardening)', () => {
  let service: AuthService;
  let configService: ConfigService;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const mockUser = {
    id: 'usr-auth-001',
    email: 'test@polintrack.com',
    fullName: 'Usuario Prueba',
    role: 'OPERADOR',
    isActive: true,
    passwordHash: bcrypt.hashSync('Password123!', 10),
    createdAt: new Date(),
  };

  beforeEach(() => {
    configService = {
      get: jest.fn((key: string, defaultVal = '') => {
        if (key === 'SUPABASE_URL') return 'http://127.0.0.1:5433/mock-supabase';
        if (key === 'SUPABASE_ANON_KEY') return 'mock-anon-key';
        return defaultVal;
      }),
    } as unknown as ConfigService;

    prisma = {
      user: {
        findUnique: jest.fn(),
      },
    } as unknown as PrismaService;

    jwtService = {
      sign: jest.fn().mockImplementation((payload) => `signed_jwt_${payload.sub}`),
      verify: jest.fn(),
    } as unknown as JwtService;

    service = new AuthService(configService, prisma, jwtService);

    // Mock supabase client to prevent TCP timeout when offline / in mock QA
    (service as any).supabase = {
      auth: {
        signInWithPassword: jest.fn().mockRejectedValue(new Error('Supabase offline / fallback')),
        refreshSession: jest.fn().mockRejectedValue(new Error('Supabase offline / fallback')),
        signOut: jest.fn().mockResolvedValue({ error: null }),
      },
    };
  });

  describe('Flujo de Login Local (Fallback Bcrypt)', () => {
    it('debe rechazar con INVALID_CREDENTIALS si el usuario no existe', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.login({ email: 'ghost@polintrack.com', password: 'Password123!' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('debe rechazar con USER_INACTIVE si el usuario está inactivo', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        ...mockUser,
        isActive: false,
      });

      try {
        await service.login({ email: mockUser.email, password: 'Password123!' });
        fail('Debería haber lanzado UnauthorizedException');
      } catch (err: any) {
        expect(err.getResponse().code).toBe('USER_INACTIVE');
      }
    });

    it('debe rechazar con INVALID_CREDENTIALS si la contraseña es incorrecta', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      try {
        await service.login({ email: mockUser.email, password: 'WrongPassword!' });
        fail('Debería haber lanzado UnauthorizedException');
      } catch (err: any) {
        expect(err.getResponse().code).toBe('INVALID_CREDENTIALS');
      }
    });

    it('debe iniciar sesión exitosamente con credenciales válidas y emitir JWT legítimo', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const response = await service.login({
        email: mockUser.email,
        password: 'Password123!',
      });

      expect(response.success).toBe(true);
      expect(response.data.user.email).toBe(mockUser.email);
      expect(response.data.accessToken).toBe(`signed_jwt_${mockUser.id}`);
      expect(response.data.refreshToken).toBeDefined();
    });
  });

  describe('Flujo de Refresco de Token', () => {
    it('debe rechazar refresh token inválido o corrupto con TOKEN_INVALID', async () => {
      (jwtService.verify as jest.Mock).mockImplementation(() => {
        throw new Error('Token verification failed');
      });

      await expect(service.refresh('invalid-refresh-token')).rejects.toThrow(UnauthorizedException);
    });

    it('debe emitir nuevo access token cuando el refresh token es válido', async () => {
      (jwtService.verify as jest.Mock).mockReturnValue({ sub: mockUser.id, type: 'refresh' });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const result = await service.refresh('valid-refresh-token');
      expect(result.success).toBe(true);
      expect(result.data.accessToken).toBe(`signed_jwt_${mockUser.id}`);
    });
  });

  describe('Flujo de Consulta de Perfil (getMe)', () => {
    it('debe rechazar si el usuario no existe', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.getMe('non-existent-id')).rejects.toThrow(UnauthorizedException);
    });

    it('debe retornar información del perfil del usuario autenticado sin revelar hash de contraseña', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: mockUser.id,
        email: mockUser.email,
        fullName: mockUser.fullName,
        role: mockUser.role,
        isActive: mockUser.isActive,
        createdAt: mockUser.createdAt,
      });

      const response = await service.getMe(mockUser.id);
      expect(response.success).toBe(true);
      expect(response.data.email).toBe(mockUser.email);
      expect((response.data as any).passwordHash).toBeUndefined();
    });
  });

  describe('Flujo de Cierre de Sesión (logout)', () => {
    it('debe cerrar sesión exitosamente', async () => {
      const response = await service.logout();
      expect(response.success).toBe(true);
      expect(response.message).toContain('Sesión cerrada');
    });
  });
});
