import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AuthModule } from './auth.module';
import { PrismaService } from '../../database/prisma.service';

describe('AuthModule Bootstrapping (QA-06D-02 Security Hardening)', () => {
  const mockPrisma = {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  it('debe abortar la inicialización de AuthModule si no hay ningún secreto JWT configurado', async () => {
    const emptyConfig = {
      get: jest.fn().mockReturnValue(undefined),
    };

    const modulePromise = Test.createTestingModule({
      imports: [AuthModule],
    })
      .overrideProvider(ConfigService)
      .useValue(emptyConfig)
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .compile();

    await expect(modulePromise).rejects.toThrow(
      /Configuración insegura detectada: Se requiere SUPABASE_JWT_SECRET o JWT_SECRET/i,
    );
  });

  it('debe abortar la inicialización si el secreto tiene menos de 16 caracteres', async () => {
    const shortConfig = {
      get: jest.fn((key: string) => {
        if (key === 'SUPABASE_JWT_SECRET') return 'short_123';
        return undefined;
      }),
    };

    const modulePromise = Test.createTestingModule({
      imports: [AuthModule],
    })
      .overrideProvider(ConfigService)
      .useValue(shortConfig)
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .compile();

    await expect(modulePromise).rejects.toThrow(/mínimo 16 caracteres/i);
  });

  it('debe compilar e inicializar AuthModule correctamente cuando SUPABASE_JWT_SECRET es válido (>= 16 caracteres)', async () => {
    const validConfig = {
      get: jest.fn((key: string, defVal = '') => {
        if (key === 'SUPABASE_JWT_SECRET') return 'valid_test_secret_key_16_chars';
        if (key === 'SUPABASE_URL') return 'http://127.0.0.1:5433/mock-supabase';
        if (key === 'SUPABASE_ANON_KEY') return 'mock-anon-key';
        return defVal;
      }),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule],
    })
      .overrideProvider(ConfigService)
      .useValue(validConfig)
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .compile();

    expect(moduleRef).toBeDefined();
    expect(moduleRef.get(AuthModule)).toBeInstanceOf(AuthModule);
  });

  it('debe compilar e inicializar AuthModule correctamente cuando solo JWT_SECRET está presente (>= 16 caracteres)', async () => {
    const validJwtConfig = {
      get: jest.fn((key: string, defVal = '') => {
        if (key === 'JWT_SECRET') return 'jwt_only_valid_secret_16_chars';
        if (key === 'SUPABASE_URL') return 'http://127.0.0.1:5433/mock-supabase';
        if (key === 'SUPABASE_ANON_KEY') return 'mock-anon-key';
        return defVal;
      }),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule],
    })
      .overrideProvider(ConfigService)
      .useValue(validJwtConfig)
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .compile();

    expect(moduleRef).toBeDefined();
  });
});
