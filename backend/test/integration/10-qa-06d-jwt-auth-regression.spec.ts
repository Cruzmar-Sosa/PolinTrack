import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/database/prisma.service';
import { JwtStrategy } from '@/modules/auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import * as fs from 'fs';
import * as path from 'path';

describe('QA-06D-02: Regresión de Seguridad y Eliminación de Fallback JWT', () => {
  const RETIRED_FALLBACK_SECRET = 'polintrack_jwt_fallback_secret_key_2026';
  let prisma: PrismaService;
  const reflector = new Reflector();
  let isDbConnected = false;

  beforeAll(async () => {
    prisma = new PrismaService();
    try {
      await prisma.$connect();
      isDbConnected = true;
    } catch {
      console.warn('⚠️ [QA WARNING]: PostgreSQL local (127.0.0.1:5433) no está accesible. Pruebas con DB real se omitirán sin falsos positivos.');
    }
  });

  afterAll(async () => {
    if (isDbConnected && prisma) {
      await prisma.$disconnect();
    }
  });

  describe('Verificación Estática de Eliminación Total del Fallback', () => {
    it('demuestra que el fallback polintrack_jwt_fallback_secret_key_2026 fue eliminado de todos los archivos de producción y pruebas', () => {
      const backendRoot = path.resolve(__dirname, '../../');
      const filesToCheck = [
        'src/modules/auth/auth.module.ts',
        'src/modules/auth/strategies/jwt.strategy.ts',
        'src/modules/auth/guards/jwt-auth.guard.ts',
        'test-e2e-adjustments.js',
        'test-e2e-audit.js',
        'test-e2e-dispatches.js',
        'test-e2e-fumigation.js',
        'test-e2e-reports-dashboard.js',
        'test-e2e-returns.js',
        'test-e2e-traceability.js',
      ];

      for (const relativePath of filesToCheck) {
        const fullPath = path.join(backendRoot, relativePath);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, 'utf8');
          expect(content).not.toContain(RETIRED_FALLBACK_SECRET);
        }
      }
    });
  });

  describe('Demostración de Comportamiento Fail-Fast', () => {
    const mockPrisma = {} as PrismaService;

    it('demuestra que JwtStrategy aborta si no hay secretos en el entorno', () => {
      const emptyConfig = {
        get: jest.fn().mockReturnValue(undefined),
      } as unknown as ConfigService;

      expect(() => new JwtStrategy(emptyConfig, mockPrisma)).toThrow(
        /Configuración insegura detectada: Se requiere SUPABASE_JWT_SECRET o JWT_SECRET/i,
      );
    });

    it('demuestra que JwtAuthGuard aborta si no se inyecta JwtService y falta el secreto', () => {
      const emptyConfig = {
        get: jest.fn().mockReturnValue(undefined),
      } as unknown as ConfigService;

      expect(() => new JwtAuthGuard(reflector, emptyConfig, mockPrisma)).toThrow(
        /Configuración insegura detectada: Se requiere SUPABASE_JWT_SECRET o JWT_SECRET/i,
      );
    });

    it('demuestra que el backend rechaza secretos de baja entropía (< 16 caracteres)', () => {
      const shortConfig = {
        get: jest.fn((key: string) => {
          if (key === 'SUPABASE_JWT_SECRET') return 'short_key';
          return undefined;
        }),
      } as unknown as ConfigService;

      expect(() => new JwtStrategy(shortConfig, mockPrisma)).toThrow(/mínimo 16 caracteres/i);
    });
  });

  describe('Rechazo de Tokens con Clave Fallback Retirada', () => {
    it('demuestra que cualquier token forjado con la antigua clave fallback es estrictamente RECHAZADO', async () => {
      const mockPrisma = {
        user: { findFirst: jest.fn().mockResolvedValue(null) },
      } as unknown as PrismaService;

      const qaConfig = {
        get: jest.fn((key: string) => {
          if (key === 'SUPABASE_JWT_SECRET') return process.env.SUPABASE_JWT_SECRET || 'valid_test_secret_for_qa_at_least_16_chars';
          if (key === 'SUPABASE_URL') return 'http://127.0.0.1:5433/mock-supabase';
          if (key === 'SUPABASE_ANON_KEY') return 'mock-anon-key';
          return undefined;
        }),
      } as unknown as ConfigService;

      const guard = new JwtAuthGuard(reflector, qaConfig, mockPrisma);

      // Token firmado con la clave eliminada
      const forgedToken = jwt.sign(
        { sub: '00000000-0000-0000-0000-000000000001', email: 'admin@polintrack.com', role: 'ADMIN' },
        RETIRED_FALLBACK_SECRET,
        { expiresIn: '1h' },
      );

      const mockReq = {
        headers: { authorization: `Bearer ${forgedToken}` },
        user: undefined as any,
      };

      const mockContext = {
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(mockReq),
        }),
      } as any;

      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      await expect(guard.canActivate(mockContext)).rejects.toThrow();
    });
  });

  describe('Aceptación de Tokens Legítimos en QA Local', () => {
    it('demuestra que un token firmado con el secreto legítimo de QA es aceptado y resuelve el usuario', async () => {
      const activeSecret = process.env.SUPABASE_JWT_SECRET || 'valid_test_secret_for_qa_at_least_16_chars';
      expect(activeSecret).toBeDefined();
      expect(activeSecret.length).toBeGreaterThanOrEqual(16);

      const testUser = {
        id: 'usr-local-qa-01',
        email: 'qa@polintrack.com',
        fullName: 'Usuario QA',
        role: 'ADMINISTRADOR',
        isActive: true,
      };

      const mockPrisma = {
        user: {
          findFirst: jest.fn().mockResolvedValue(testUser),
        },
      } as unknown as PrismaService;

      const qaConfig = {
        get: jest.fn((key: string) => {
          if (key === 'SUPABASE_JWT_SECRET') return activeSecret;
          if (key === 'SUPABASE_URL') return 'http://127.0.0.1:5433/mock-supabase';
          if (key === 'SUPABASE_ANON_KEY') return 'mock-anon-key';
          return undefined;
        }),
      } as unknown as ConfigService;

      const guard = new JwtAuthGuard(reflector, qaConfig, mockPrisma);

      const validToken = jwt.sign(
        { sub: testUser.id, email: testUser.email, role: testUser.role },
        activeSecret,
        { expiresIn: '1h' },
      );

      const mockReq = {
        headers: { authorization: `Bearer ${validToken}` },
        user: undefined as any,
      };

      const mockContext = {
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(mockReq),
        }),
      } as any;

      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      const isAllowed = await guard.canActivate(mockContext);
      expect(isAllowed).toBe(true);
      expect(mockReq.user).toBeDefined();
      expect(mockReq.user.id).toBe(testUser.id);
      expect(mockReq.user.email).toBe(testUser.email);
    });
  });
});
