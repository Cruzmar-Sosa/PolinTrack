/**
 * POLINTRACK — FASE QA-05: REGRESIÓN DE SEGURIDAD H-15 (DIRECTORY TRAVERSAL)
 *
 * Prueba exhaustiva de no-regresión para SupabaseStorageService:
 * 1. Intento de traversal relativo estándar (../decoy.txt) -> Rechazado estrictamente con BadRequestException.
 * 2. Intento de traversal anidado (sub/../../decoy.txt) -> Rechazado estrictamente con BadRequestException.
 * 3. Intento de traversal con separadores alternativos de Windows (..\\decoy.txt) -> Rechazado estrictamente.
 * 4. Intento con ruta absoluta del sistema (C:\Windows\win.ini o /etc/passwd) -> Rechazado estrictamente.
 * 5. Intento con inyección de byte nulo (%00 / \0) -> Rechazado estrictamente.
 * 6. Acceso legítimo a archivo dentro del bucket autorizado -> Lectura exitosa (funcionalidad preservada).
 */

import { SupabaseStorageService } from '../../src/modules/fumigation/supabase-storage.service';
import { BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

describe('QA-05 / H-15 — Verificación Estricta contra Directory Traversal', () => {
  let storageService: SupabaseStorageService;
  const bucketName = 'fumigation-certificates';
  const baseStorageDir = path.resolve(process.cwd(), '.uploads', bucketName);
  const decoyDir = path.resolve(process.cwd(), '.uploads');
  const decoyFileName = 'h15-confidential-decoy.txt';
  const decoyFilePath = path.resolve(decoyDir, decoyFileName);
  const decoyContent = 'CONFIDENTIAL-FINANCIAL-PAYROLL-DATA-2026';

  const legitimateFileName = 'cert-legitimate-test-101.pdf';
  const legitimateContent = '%PDF-1.4 Legitimate Fumigation Certificate Content';

  const testSecretKey = 'polintrack_secure_test_key_for_h15_regression_2026';
  const expires = Math.floor(Date.now() / 1000) + 900;

  beforeAll(() => {
    // 1. Crear directorios de prueba
    if (!fs.existsSync(baseStorageDir)) {
      fs.mkdirSync(baseStorageDir, { recursive: true });
    }

    // 2. Crear archivo señuelo confidencial FUERA del bucket autorizado (en .uploads/)
    fs.writeFileSync(decoyFilePath, decoyContent, 'utf-8');

    // 3. Crear archivo legítimo DENTRO del bucket autorizado (en .uploads/fumigation-certificates/)
    fs.writeFileSync(
      path.resolve(baseStorageDir, legitimateFileName),
      legitimateContent,
      'utf-8',
    );

    // 4. Instanciar servicio en modo local con clave legítima
    const mockConfig = {
      get: jest.fn((key: string, defaultValue?: any) => {
        if (key === 'JWT_SECRET') return testSecretKey;
        if (key === 'SUPABASE_URL' || key === 'SUPABASE_SERVICE_ROLE_KEY') return '';
        if (key === 'SUPABASE_STORAGE_BUCKET') return bucketName;
        return defaultValue;
      }),
    } as any;

    storageService = new SupabaseStorageService(mockConfig);
  });

  afterAll(() => {
    // Limpieza segura de archivos de prueba temporales
    if (fs.existsSync(decoyFilePath)) {
      try {
        fs.unlinkSync(decoyFilePath);
      } catch {}
    }
    const legitimatePath = path.resolve(baseStorageDir, legitimateFileName);
    if (fs.existsSync(legitimatePath)) {
      try {
        fs.unlinkSync(legitimatePath);
      } catch {}
    }
  });

  function signPayload(filePath: string): string {
    const payloadToSign = `${filePath}:${expires}`;
    return crypto.createHmac('sha256', testSecretKey).update(payloadToSign).digest('hex');
  }

  it('1. Bloquea estrictamente traversal relativo clásico (../archivo)', async () => {
    const maliciousPath = `../${decoyFileName}`;
    const sig = signPayload(maliciousPath);

    await expect(
      storageService.verifyAndReadLocalFile(maliciousPath, expires, sig),
    ).rejects.toThrow(BadRequestException);

    await expect(
      storageService.verifyAndReadLocalFile(maliciousPath, expires, sig),
    ).rejects.toThrow(/Acceso no autorizado: la ruta intenta acceder fuera del directorio/);
  });

  it('2. Bloquea estrictamente traversal anidado (sub/../../archivo)', async () => {
    const maliciousPath = `subdir/../../${decoyFileName}`;
    const sig = signPayload(maliciousPath);

    await expect(
      storageService.verifyAndReadLocalFile(maliciousPath, expires, sig),
    ).rejects.toThrow(BadRequestException);
  });

  it('3. Bloquea estrictamente traversal con barras invertidas estilo Windows (..\\archivo)', async () => {
    const maliciousPath = `..\\${decoyFileName}`;
    const sig = signPayload(maliciousPath);

    await expect(
      storageService.verifyAndReadLocalFile(maliciousPath, expires, sig),
    ).rejects.toThrow(BadRequestException);
  });

  it('4. Bloquea rutas absolutas directas (ej. C:\\Windows o /etc/passwd)', async () => {
    const maliciousAbsPath = path.resolve(decoyFilePath);
    const sig = signPayload(maliciousAbsPath);

    await expect(
      storageService.verifyAndReadLocalFile(maliciousAbsPath, expires, sig),
    ).rejects.toThrow(BadRequestException);

    await expect(
      storageService.verifyAndReadLocalFile(maliciousAbsPath, expires, sig),
    ).rejects.toThrow(/Ruta de archivo absoluta no permitida/);
  });

  it('5. Bloquea inyección con byte nulo', async () => {
    const nullByteAttackPath = `cert.pdf\0../${decoyFileName}`;
    const sig = signPayload(nullByteAttackPath);

    await expect(
      storageService.verifyAndReadLocalFile(nullByteAttackPath, expires, sig),
    ).rejects.toThrow(BadRequestException);

    await expect(
      storageService.verifyAndReadLocalFile(nullByteAttackPath, expires, sig),
    ).rejects.toThrow(/caracteres nulos prohibidos/);
  });

  it('6. Permite lectura exitosa de archivos legítimos dentro del bucket autorizado', async () => {
    const sig = signPayload(legitimateFileName);

    const buffer = await storageService.verifyAndReadLocalFile(
      legitimateFileName,
      expires,
      sig,
    );

    expect(buffer).toBeDefined();
    expect(buffer.toString('utf-8')).toBe(legitimateContent);
  });
});
