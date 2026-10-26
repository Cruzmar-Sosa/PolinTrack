import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/database/prisma.service';
import { JwtStrategy, JwtPayload } from './jwt.strategy';

describe('JwtStrategy (QA-06D-02 Security Hardening)', () => {
  const TEST_JWT_SECRET = 'test_strategy_jwt_secret_min_16_chars';
  let strategy: JwtStrategy;
  let configService: ConfigService;
  let prisma: PrismaService;

  beforeEach(() => {
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'SUPABASE_JWT_SECRET') return TEST_JWT_SECRET;
        return null;
      }),
    } as unknown as ConfigService;

    prisma = {
      user: {
        findFirst: jest.fn(),
      },
    } as unknown as PrismaService;

    strategy = new JwtStrategy(configService, prisma);
  });

  describe('Fail-Fast de Inicialización de Secreto', () => {
    it('debe abortar si no se proporciona ningún secreto', () => {
      const emptyConfig = {
        get: jest.fn().mockReturnValue(null),
      } as unknown as ConfigService;

      expect(() => new JwtStrategy(emptyConfig, prisma)).toThrow(
        /Configuración insegura detectada: Se requiere SUPABASE_JWT_SECRET o JWT_SECRET/i,
      );
    });

    it('debe abortar si el secreto tiene menos de 16 caracteres', () => {
      const shortConfig = {
        get: jest.fn((key: string) => {
          if (key === 'SUPABASE_JWT_SECRET') return 'too_short';
          return null;
        }),
      } as unknown as ConfigService;

      expect(() => new JwtStrategy(shortConfig, prisma)).toThrow(
        /mínimo 16 caracteres/i,
      );
    });

    it('debe inicializarse correctamente si JWT_SECRET alternativo es válido (>= 16 caracteres)', () => {
      const altConfig = {
        get: jest.fn((key: string) => {
          if (key === 'JWT_SECRET') return 'alternative_valid_secret_16_chars';
          return null;
        }),
      } as unknown as ConfigService;

      expect(() => new JwtStrategy(altConfig, prisma)).not.toThrow();
    });
  });

  describe('Método validate(payload)', () => {
    const mockUser = {
      id: 'usr-1111-2222-3333-4444',
      email: 'admin@polintrack.com',
      fullName: 'Administrador del Sistema',
      role: 'ADMINISTRADOR',
      isActive: true,
    };

    it('debe rechazar payload sin sub ni email con TOKEN_INVALID', async () => {
      const emptyPayload: JwtPayload = { sub: '', email: '' };

      await expect(strategy.validate(emptyPayload)).rejects.toThrow(UnauthorizedException);
      try {
        await strategy.validate(emptyPayload);
      } catch (err: any) {
        expect(err.getResponse().code).toBe('TOKEN_INVALID');
      }
    });

    it('debe rechazar si el usuario no existe en la base de datos (INVALID_CREDENTIALS)', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);

      const payload: JwtPayload = { sub: 'non-existent-user-id', email: 'ghost@polintrack.com' };

      await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
      try {
        await strategy.validate(payload);
      } catch (err: any) {
        expect(err.getResponse().code).toBe('INVALID_CREDENTIALS');
      }
    });

    it('debe rechazar si el usuario existe pero está inactivo (USER_INACTIVE)', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue({
        ...mockUser,
        isActive: false,
      });

      const payload: JwtPayload = { sub: mockUser.id, email: mockUser.email };

      await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
      try {
        await strategy.validate(payload);
      } catch (err: any) {
        expect(err.getResponse().code).toBe('USER_INACTIVE');
      }
    });

    it('debe retornar datos del usuario operativo autenticado si está activo', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(mockUser);

      const payload: JwtPayload = { sub: mockUser.id, email: mockUser.email, role: 'CONSULTA' };

      const result = await strategy.validate(payload);
      expect(result).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        fullName: mockUser.fullName,
        role: mockUser.role, // Obtenido de BD (ADMINISTRADOR), no sobreescrito por payload
      });
    });
  });
});
