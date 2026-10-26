import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/database/prisma.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import * as jwt from 'jsonwebtoken';

describe('JwtAuthGuard (H-SEC-05 Hardening & Controlled Simplification)', () => {
  const TEST_JWT_SECRET = 'test_jwt_secret_for_qa06d02_minimum_16_chars';
  let guard: JwtAuthGuard;
  let reflector: Reflector;
  let configService: ConfigService;
  let prisma: PrismaService;

  beforeEach(() => {
    reflector = new Reflector();
    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'SUPABASE_URL') return 'https://mock.supabase.co';
        if (key === 'SUPABASE_ANON_KEY') return 'mock-anon-key';
        if (key === 'SUPABASE_JWT_SECRET') return TEST_JWT_SECRET;
        return null;
      }),
    } as unknown as ConfigService;

    prisma = {
      user: {
        findFirst: jest.fn(),
      },
    } as unknown as PrismaService;

    guard = new JwtAuthGuard(reflector, configService, prisma);
  });

  const createMockContext = (
    headers: Record<string, string> = {},
    isPublic = false,
  ): { context: ExecutionContext; req: any } => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(isPublic);
    const req = { headers, user: undefined as any };

    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(req),
      }),
    } as unknown as ExecutionContext;

    return { context, req };
  };

  describe('Configuración Fail-Fast de Secretos', () => {
    it('debe abortar con excepción si no hay SUPABASE_JWT_SECRET ni JWT_SECRET', () => {
      const emptyConfig = {
        get: jest.fn().mockReturnValue(null),
      } as unknown as ConfigService;

      expect(() => new JwtAuthGuard(reflector, emptyConfig, prisma)).toThrow(
        /Configuración insegura detectada: Se requiere SUPABASE_JWT_SECRET o JWT_SECRET/i,
      );
    });

    it('debe abortar con excepción si el secreto tiene menos de 16 caracteres', () => {
      const shortConfig = {
        get: jest.fn((key: string) => {
          if (key === 'SUPABASE_JWT_SECRET') return 'short_secret';
          return null;
        }),
      } as unknown as ConfigService;

      expect(() => new JwtAuthGuard(reflector, shortConfig, prisma)).toThrow(
        /mínimo 16 caracteres/i,
      );
    });

    it('debe permitir inicialización si JWT_SECRET alternativo es válido (>= 16 caracteres)', () => {
      const altConfig = {
        get: jest.fn((key: string) => {
          if (key === 'JWT_SECRET') return 'alternative_valid_secret_16_chars';
          return null;
        }),
      } as unknown as ConfigService;

      expect(() => new JwtAuthGuard(reflector, altConfig, prisma)).not.toThrow();
    });
  });

  describe('Validación de Rutas y Encabezados', () => {
    it('debe permitir acceso inmediato si la ruta está marcada con @Public()', async () => {
      const { context } = createMockContext({}, true);
      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('debe lanzar UnauthorizedException si no se envía encabezado Authorization', async () => {
      const { context } = createMockContext({});

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
      try {
        await guard.canActivate(context);
      } catch (err: any) {
        expect(err.getResponse().code).toBe('INVALID_CREDENTIALS');
        expect(err.getResponse().message).toContain('Token de autenticación no proporcionado');
      }
    });

    it('debe lanzar UnauthorizedException si Authorization no inicia con Bearer', async () => {
      const { context } = createMockContext({ authorization: 'Basic dXNlcjpwYXNz' });
      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('Verificación Local de Tokens JWT (Fase Primaria Unificada)', () => {
    const mockUser = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      email: 'operador@polintrack.com',
      fullName: 'Operador Principal',
      role: 'OPERADOR',
      isActive: true,
    };

    it('debe aceptar token firmado con secreto local legítimo y asignar request.user', async () => {
      const validToken = jwt.sign(
        { sub: mockUser.id, email: mockUser.email, role: 'OPERADOR' },
        TEST_JWT_SECRET,
        { expiresIn: '1h' },
      );

      (prisma.user.findFirst as jest.Mock).mockResolvedValue(mockUser);

      const { context, req } = createMockContext({
        authorization: `Bearer ${validToken}`,
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
      expect(req.user).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        fullName: mockUser.fullName,
        role: mockUser.role,
      });
    });

    it('debe rechazar con USER_INACTIVE si el usuario existe pero está inactivo (sin fallback)', async () => {
      const inactiveUser = { ...mockUser, isActive: false };
      const validToken = jwt.sign(
        { sub: inactiveUser.id, email: inactiveUser.email },
        TEST_JWT_SECRET,
        { expiresIn: '1h' },
      );

      (prisma.user.findFirst as jest.Mock).mockResolvedValue(inactiveUser);

      const getUserSpy = jest.fn();
      (guard as any).supabase = { auth: { getUser: getUserSpy } };

      const { context } = createMockContext({
        authorization: `Bearer ${validToken}`,
      });

      try {
        await guard.canActivate(context);
        fail('Debería haber lanzado UnauthorizedException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(UnauthorizedException);
        expect(err.getResponse().code).toBe('USER_INACTIVE');
        expect(getUserSpy).not.toHaveBeenCalled();
      }
    });

    it('debe rechazar con INVALID_CREDENTIALS si el usuario no existe en la base de datos', async () => {
      const validToken = jwt.sign(
        { sub: '00000000-0000-0000-0000-000000000000', email: 'ghost@polintrack.com' },
        TEST_JWT_SECRET,
        { expiresIn: '1h' },
      );

      (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);

      const { context } = createMockContext({
        authorization: `Bearer ${validToken}`,
      });

      try {
        await guard.canActivate(context);
        fail('Debería haber lanzado UnauthorizedException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(UnauthorizedException);
        expect(err.getResponse().code).toBe('INVALID_CREDENTIALS');
      }
    });
  });

  describe('Fallback Defensivo a Supabase GoTrue Auth API', () => {
    const mockSupabaseUser = {
      id: '660e8400-e29b-41d4-a716-446655440001',
      email: 'supabase_user@polintrack.com',
    };

    const mockDbUser = {
      id: mockSupabaseUser.id,
      email: mockSupabaseUser.email,
      fullName: 'Usuario Supabase Cloud',
      role: 'CONTABILIDAD',
      isActive: true,
    };

    it('debe autenticar mediante Supabase GoTrue si la firma local falla pero el token es válido en GoTrue', async () => {
      // Token firmado con otra clave (simula emisión externa de GoTrue)
      const goTrueToken = jwt.sign(
        { sub: mockSupabaseUser.id, email: mockSupabaseUser.email },
        'external_gotrue_secret_different_key_16',
        { expiresIn: '1h' },
      );

      (guard as any).supabase = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: mockSupabaseUser },
            error: null,
          }),
        },
      };

      (prisma.user.findFirst as jest.Mock).mockResolvedValue(mockDbUser);

      const { context, req } = createMockContext({
        authorization: `Bearer ${goTrueToken}`,
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
      expect(req.user).toEqual({
        id: mockDbUser.id,
        email: mockDbUser.email,
        fullName: mockDbUser.fullName,
        role: mockDbUser.role,
      });
    });

    it('debe rechazar con TOKEN_EXPIRED si Supabase GoTrue indica que el token expiró', async () => {
      const externalToken = jwt.sign(
        { sub: mockSupabaseUser.id, email: mockSupabaseUser.email },
        'external_key_16_chars_different',
        { expiresIn: '-10s' },
      );

      (guard as any).supabase = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: null,
            error: { message: 'JWT expired' },
          }),
        },
      };

      const { context } = createMockContext({
        authorization: `Bearer ${externalToken}`,
      });

      try {
        await guard.canActivate(context);
        fail('Debería haber lanzado UnauthorizedException');
      } catch (err: any) {
        expect(err.getResponse().code).toBe('TOKEN_EXPIRED');
      }
    });

    it('debe rechazar con TOKEN_INVALID si Supabase GoTrue no reconoce el token', async () => {
      (guard as any).supabase = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: null,
            error: { message: 'Invalid token signature' },
          }),
        },
      };

      const { context } = createMockContext({
        authorization: 'Bearer invalid_signature_token',
      });

      try {
        await guard.canActivate(context);
        fail('Debería haber lanzado UnauthorizedException');
      } catch (err: any) {
        expect(err.getResponse().code).toBe('TOKEN_INVALID');
      }
    });

    it('debe rechazar con AUTH_PROVIDER_ERROR si la API de Supabase GoTrue lanza un fallo de red', async () => {
      (guard as any).supabase = {
        auth: {
          getUser: jest.fn().mockRejectedValue(new Error('Network connection timeout')),
        },
      };

      const { context } = createMockContext({
        authorization: 'Bearer network_failing_token',
      });

      try {
        await guard.canActivate(context);
        fail('Debería haber lanzado UnauthorizedException');
      } catch (err: any) {
        expect(err.getResponse().code).toBe('AUTH_PROVIDER_ERROR');
      }
    });

    it('debe rechazar con INVALID_CREDENTIALS si el usuario de Supabase no existe en public.users', async () => {
      (guard as any).supabase = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: mockSupabaseUser },
            error: null,
          }),
        },
      };

      (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);

      const { context } = createMockContext({
        authorization: 'Bearer valid_token_unregistered_db_user',
      });

      try {
        await guard.canActivate(context);
        fail('Debería haber lanzado UnauthorizedException');
      } catch (err: any) {
        expect(err.getResponse().code).toBe('INVALID_CREDENTIALS');
      }
    });

    it('debe rechazar con USER_INACTIVE si el usuario de Supabase existe pero está inactivo en public.users', async () => {
      (guard as any).supabase = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: mockSupabaseUser },
            error: null,
          }),
        },
      };

      (prisma.user.findFirst as jest.Mock).mockResolvedValue({
        ...mockDbUser,
        isActive: false,
      });

      const { context } = createMockContext({
        authorization: 'Bearer valid_token_inactive_db_user',
      });

      try {
        await guard.canActivate(context);
        fail('Debería haber lanzado UnauthorizedException');
      } catch (err: any) {
        expect(err.getResponse().code).toBe('USER_INACTIVE');
      }
    });

    it('debe rechazar con TOKEN_INVALID si la verificación local falla y Supabase client no está configurado', async () => {
      (guard as any).supabase = null;

      const { context } = createMockContext({
        authorization: 'Bearer token_without_supabase_client',
      });

      try {
        await guard.canActivate(context);
        fail('Debería haber lanzado UnauthorizedException');
      } catch (err: any) {
        expect(err.getResponse().code).toBe('TOKEN_INVALID');
      }
    });
  });
});
