import { ConfigService } from '@nestjs/config';
import { SupabaseStorageService } from './supabase-storage.service';
import * as crypto from 'crypto';

describe('SupabaseStorageService (H-SEC-03 Storage HMAC Secret Hardening)', () => {
  const VALID_HMAC_SECRET = 'storage_hmac_secret_32_characters_long_key';
  const VALID_JWT_SECRET = 'jwt_secret_32_characters_long_for_auth';
  const VALID_SUPABASE_SECRET = 'supabase_jwt_secret_32_characters_key';

  const createMockConfigService = (envMap: Record<string, any>): ConfigService => {
    return {
      get: jest.fn((key: string, defaultValue?: any) => {
        if (key in envMap) {
          return envMap[key];
        }
        return defaultValue !== undefined ? defaultValue : null;
      }),
    } as unknown as ConfigService;
  };

  describe('Precedencia y Selección de Secretos para Almacenamiento Local', () => {
    it('debe priorizar STORAGE_HMAC_SECRET sobre JWT_SECRET y SUPABASE_JWT_SECRET', () => {
      const configService = createMockConfigService({
        STORAGE_HMAC_SECRET: VALID_HMAC_SECRET,
        JWT_SECRET: VALID_JWT_SECRET,
        SUPABASE_JWT_SECRET: VALID_SUPABASE_SECRET,
      });

      const service = new SupabaseStorageService(configService);
      expect((service as any).hmacSecret).toBe(VALID_HMAC_SECRET);
      expect((service as any).isCloudStorageEnabled).toBe(false);
    });

    it('debe utilizar JWT_SECRET como fallback cuando STORAGE_HMAC_SECRET está ausente', () => {
      const configService = createMockConfigService({
        STORAGE_HMAC_SECRET: null,
        JWT_SECRET: VALID_JWT_SECRET,
        SUPABASE_JWT_SECRET: VALID_SUPABASE_SECRET,
      });

      const service = new SupabaseStorageService(configService);
      expect((service as any).hmacSecret).toBe(VALID_JWT_SECRET);
      expect((service as any).isCloudStorageEnabled).toBe(false);
    });

    it('debe utilizar SUPABASE_JWT_SECRET como fallback cuando STORAGE_HMAC_SECRET y JWT_SECRET están ausentes', () => {
      const configService = createMockConfigService({
        STORAGE_HMAC_SECRET: null,
        JWT_SECRET: null,
        SUPABASE_JWT_SECRET: VALID_SUPABASE_SECRET,
      });

      const service = new SupabaseStorageService(configService);
      expect((service as any).hmacSecret).toBe(VALID_SUPABASE_SECRET);
      expect((service as any).isCloudStorageEnabled).toBe(false);
    });
  });

  describe('Validación Fail-Fast de Configuración Insegura', () => {
    it('debe abortar si no se proporciona ningún secreto en modo local', () => {
      const configService = createMockConfigService({
        STORAGE_HMAC_SECRET: null,
        JWT_SECRET: null,
        SUPABASE_JWT_SECRET: null,
      });

      expect(() => new SupabaseStorageService(configService)).toThrow(
        /Configuración insegura detectada: Se requiere/i,
      );
    });

    it('debe abortar si el secreto configurado tiene menos de 16 caracteres', () => {
      const configService = createMockConfigService({
        STORAGE_HMAC_SECRET: 'short_key',
        JWT_SECRET: null,
        SUPABASE_JWT_SECRET: null,
      });

      expect(() => new SupabaseStorageService(configService)).toThrow(
        /mínimo 16 caracteres/i,
      );
    });
  });

  describe('Firmado Criptográfico y Validación de URLs Locales con STORAGE_HMAC_SECRET', () => {
    let service: SupabaseStorageService;

    beforeEach(() => {
      const configService = createMockConfigService({
        STORAGE_HMAC_SECRET: VALID_HMAC_SECRET,
        PORT: 3000,
        APP_URL: 'http://localhost:3000',
      });
      service = new SupabaseStorageService(configService);
    });

    it('debe generar una URL de descarga firmada con HMAC-SHA256 usando STORAGE_HMAC_SECRET', async () => {
      const result = await service.createSignedUrl('test-folder/cert.pdf', 900);

      expect(result.downloadUrl).toContain('/api/v1/fumigations/download-file?path=');
      expect(result.downloadUrl).toContain('&sig=');
      expect(result.downloadUrl).toContain('&expires=');
      expect(result.expiresInSeconds).toBe(900);

      const urlObj = new URL(result.downloadUrl);
      const sig = urlObj.searchParams.get('sig');
      const expires = urlObj.searchParams.get('expires');
      const decodedPath = decodeURIComponent(urlObj.searchParams.get('path') || '');

      const expectedSig = crypto
        .createHmac('sha256', VALID_HMAC_SECRET)
        .update(`${decodedPath}:${expires}`)
        .digest('hex');

      expect(sig).toBe(expectedSig);
    });

    it('debe rechazar verificación si la firma HMAC no coincide con la clave', async () => {
      const futureExpires = Math.floor(Date.now() / 1000) + 600;
      const invalidSig = 'invalid_tampered_signature_hex';

      await expect(
        service.verifyAndReadLocalFile('test.pdf', futureExpires, invalidSig),
      ).rejects.toThrow('Firma criptográfica inválida');
    });

    it('debe rechazar verificación si la URL ha expirado', async () => {
      const pastExpires = Math.floor(Date.now() / 1000) - 100;
      const payloadToSign = `test.pdf:${pastExpires}`;
      const validSigForExpired = crypto
        .createHmac('sha256', VALID_HMAC_SECRET)
        .update(payloadToSign)
        .digest('hex');

      await expect(
        service.verifyAndReadLocalFile('test.pdf', pastExpires, validSigForExpired),
      ).rejects.toThrow(/ha expirado/i);
    });
  });

  describe('Modo Cloud Storage', () => {
    it('debe inicializar modo cloud cuando SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY válidos están presentes', () => {
      const configService = createMockConfigService({
        SUPABASE_URL: 'https://test.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'valid_service_role_key_long_enough',
        STORAGE_HMAC_SECRET: null,
      });

      const service = new SupabaseStorageService(configService);
      expect((service as any).isCloudStorageEnabled).toBe(true);
      expect((service as any).supabaseAdmin).toBeDefined();
    });
  });
});
