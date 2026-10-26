/**
 * POLINTRACK — FASE QA-04C: SEGURIDAD, LÍMITES Y MANEJO DE EXCEPCIONES
 *
 * Demostración experimental con servicios reales:
 * 1. Paginación irrestricta con limit=0 (Defecto H-11 DoS): Comprobar que omite take y vuelca toda la tabla.
 * 2. Secretos de respaldo codificados en repositorio (Defecto H-13): Comprobar fallbacks predecibles.
 * 3. Path Traversal en descarga local de certificados (Defecto H-15): Demostrar lectura fuera de bucket con señuelo local.
 * 4. Mapeo genérico en HttpExceptionFilter (Defecto H-01): Demostrar que excepciones de base de datos se ocultan tras 500.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../src/database/prisma.service';
import { InventoryLedgerService } from '../../src/modules/inventory/inventory-ledger.service';
import { SupabaseStorageService } from '../../src/modules/fumigation/supabase-storage.service';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import {
  assertAuthorizedTestConnectionUrl,
  assertLiveServerIdentity,
} from '../security/assert-local-db';

describe('QA-04C — Seguridad, Límites y Manejo de Excepciones', () => {
  let prisma: PrismaService;
  let ledgerService: InventoryLedgerService;

  const decoyDir = path.resolve(process.cwd(), '.uploads');
  const decoyFilePath = path.resolve(decoyDir, 'qa04c-decoy-secret.txt');
  const decoySecretContent = 'POLINTRACK-QA04C-CONFIDENTIAL-DECOY-DATA-2026';

  beforeAll(async () => {
    assertAuthorizedTestConnectionUrl(process.env.DATABASE_URL!, ['polintrack_admin']);

    prisma = new PrismaService();
    await prisma.$connect();
    await assertLiveServerIdentity((sql) => prisma.$queryRawUnsafe(sql), 'polintrack_admin');

    ledgerService = new InventoryLedgerService(prisma);

    // Crear archivo señuelo local FUERA del bucket 'fumigation-certificates'
    if (!fs.existsSync(decoyDir)) {
      fs.mkdirSync(decoyDir, { recursive: true });
    }
    fs.writeFileSync(decoyFilePath, decoySecretContent, 'utf-8');
  });

  afterAll(async () => {
    // Limpiar archivo señuelo de prueba
    if (fs.existsSync(decoyFilePath)) {
      fs.unlinkSync(decoyFilePath);
    }
    await prisma.$disconnect();
  });

  // ============================================================================
  // ESCENARIO C.1: Paginación acotada segura (Resolución H-11)
  // ============================================================================
  it('1. Demuestra la resolución de H-11: limit=0 o excesivo se acota a rangos seguros (1..100) y previene DoS', async () => {
    // A. Consultar el kardex con limit=0 (debe normalizarse al default seguro 10)
    const resultDefault = await ledgerService.getKardexMovements({
      page: 1,
      limit: 0,
    });

    console.log(`[EVIDENCIA EXPERIMENTAL H-11]: limit=0 acotado con éxito a ${resultDefault.meta.limit} (no volcó la tabla completa de ${resultDefault.meta.total})`);

    expect(resultDefault.meta.limit).toBe(10);
    expect(resultDefault.data.length).toBeLessThanOrEqual(10);

    // B. Consultar el kardex con un límite excesivo (ej. 999999) debe toparse en 100
    const resultCapped = await ledgerService.getKardexMovements({
      page: 1,
      limit: 999999,
    });

    expect(resultCapped.meta.limit).toBe(100);
    expect(resultCapped.data.length).toBeLessThanOrEqual(100);
  });

  // ============================================================================
  // ESCENARIO C.2: Presencia de claves secretas de respaldo en código (H-13)
  // ============================================================================
  it('2. Demuestra la resolución de H-13: Falla segura (fail-fast) sin secreto y retiro de clave fallback', () => {
    // A. Entorno inseguro sin JWT_SECRET ni SUPABASE_JWT_SECRET
    const unconfiguredConfig = {
      get: jest.fn((key: string, defaultValue?: any) => {
        if (key === 'JWT_SECRET' || key === 'SUPABASE_JWT_SECRET') return undefined;
        if (key === 'SUPABASE_STORAGE_BUCKET') return 'fumigation-certificates';
        if (key === 'SUPABASE_URL' || key === 'SUPABASE_SERVICE_ROLE_KEY') return '';
        return defaultValue;
      }),
    } as any;

    // Debe abortar en el arranque por configuración insegura
    expect(() => new SupabaseStorageService(unconfiguredConfig)).toThrow(
      /Configuración insegura detectada: Se requiere JWT_SECRET o SUPABASE_JWT_SECRET/i,
    );

    // B. Entorno con secreto legítimo configurado
    const validSecret = 'polintrack_secure_custom_key_2026_at_least_16_chars';
    const configuredConfig = {
      get: jest.fn((key: string, defaultValue?: any) => {
        if (key === 'JWT_SECRET') return validSecret;
        if (key === 'SUPABASE_STORAGE_BUCKET') return 'fumigation-certificates';
        if (key === 'SUPABASE_URL' || key === 'SUPABASE_SERVICE_ROLE_KEY') return '';
        return defaultValue;
      }),
    } as any;

    const storageService = new SupabaseStorageService(configuredConfig);
    const effectiveSecret = (storageService as any).hmacSecret;

    expect(effectiveSecret).toBe(validSecret);
    expect(effectiveSecret).not.toBe('polintrack_storage_hmac_fallback_key_2026');

    console.log('[EVIDENCIA H-13 RESUELTO]: Fail-fast verificado y secreto legítimo asignado');
  });

  // ============================================================================
  // ESCENARIO C.3: Path Traversal en descarga local de archivos (H-15)
  // ============================================================================
  it('3. Demuestra experimentalmente el defecto H-15: Lectura fuera del directorio de bucket con archivo señuelo', async () => {
    const validSecret = 'polintrack_secure_test_key_for_h15_verification_2026';
    const validConfig = {
      get: jest.fn((key: string, defaultValue?: any) => {
        if (key === 'JWT_SECRET') return validSecret;
        if (key === 'SUPABASE_STORAGE_BUCKET') return 'fumigation-certificates';
        if (key === 'SUPABASE_URL' || key === 'SUPABASE_SERVICE_ROLE_KEY') return '';
        return defaultValue;
      }),
    } as any;

    const storageService = new SupabaseStorageService(validConfig);

    const relativeTraversalPath = '../qa04c-decoy-secret.txt';
    const expires = Math.floor(Date.now() / 1000) + 900; // 15 minutos en el futuro

    // Firmar la ruta maliciosa con la clave legítima
    const payloadToSign = `${relativeTraversalPath}:${expires}`;
    const sig = crypto
      .createHmac('sha256', validSecret)
      .update(payloadToSign)
      .digest('hex');

    // Verificación de la corrección H-15: verifyAndReadLocalFile debe rechazar el traversal
    await expect(
      storageService.verifyAndReadLocalFile(
        relativeTraversalPath,
        expires,
        sig,
      ),
    ).rejects.toThrow(BadRequestException);

    console.log('[EVIDENCIA H-15 RESUELTO]: Directory traversal bloqueado con BadRequestException');
  });

  // ============================================================================
  // ESCENARIO C.4: Verificación de resolución de H-01 en HttpExceptionFilter
  // ============================================================================
  it('4. Verifica la resolución de H-01: Excepciones P2002 de base de datos se mapean a 409 CONFLICT de forma sanitizada', async () => {
    const filter = new HttpExceptionFilter();

    let capturedStatus = 0;
    let capturedBody: any = null;

    const mockResponse: any = {
      status: (statusCode: number) => {
        capturedStatus = statusCode;
        return mockResponse;
      },
      json: (body: any) => {
        capturedBody = body;
        return mockResponse;
      },
    };

    const mockRequest: any = {
      url: '/api/v1/daily-productions/test/corrections',
    };

    const mockHost: any = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    };

    // Simular un error de restricción única Prisma P2002
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the constraint: quantity_corrections_idempotency_key_key',
      {
        code: 'P2002',
        clientVersion: '5.x',
        meta: { target: ['idempotency_key'] },
      },
    );

    filter.catch(prismaError, mockHost);

    console.log(
      `[EVIDENCIA H-01 RESUELTO]: Status devuelto = ${capturedStatus}, Código = ${capturedBody?.error?.code}, Mensaje = '${capturedBody?.error?.message}', Sanitizado = ${!capturedBody?.error?.message?.includes('quantity_corrections_idempotency_key_key')}`,
    );

    // Verificación de la resolución de H-01:
    // P2002 se mapea a 409 CONFLICT con código canónico y mensaje público seguro
    expect(capturedStatus).toBe(409);
    expect(capturedBody.error.code).toBe('CONFLICT');
    expect(capturedBody.error.message).toBe(
      'Ya existe un registro con el valor o identificador especificado',
    );
    expect(capturedBody.error.details).toEqual([
      {
        field: 'idempotency_key',
        message: "El valor para 'idempotency_key' ya se encuentra en uso",
      },
    ]);
    expect(capturedBody.error.message).not.toContain(
      'quantity_corrections_idempotency_key_key',
    );
  });
});
