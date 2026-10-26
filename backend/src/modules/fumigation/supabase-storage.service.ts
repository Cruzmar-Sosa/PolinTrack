import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface StorageUploadResult {
  path: string;
}

export interface StorageSignedUrlResult {
  downloadUrl: string;
  signedUrl?: string;
  expiresInSeconds: number;
}

@Injectable()
export class SupabaseStorageService {
  private readonly logger = new Logger(SupabaseStorageService.name);
  private readonly supabaseAdmin: SupabaseClient | null = null;
  private readonly bucketName: string;
  private readonly isCloudStorageEnabled: boolean;
  private readonly localStorageDir: string;
  private readonly hmacSecret: string;

  constructor(private readonly configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL', '');
    const serviceRoleKey = this.configService.get<string>(
      'SUPABASE_SERVICE_ROLE_KEY',
      '',
    );
    this.bucketName = this.configService.get<string>(
      'SUPABASE_STORAGE_BUCKET',
      'fumigation-certificates',
    );

    const configuredSecret =
      this.configService.get<string>('STORAGE_HMAC_SECRET') ||
      this.configService.get<string>('JWT_SECRET') ||
      this.configService.get<string>('SUPABASE_JWT_SECRET') ||
      '';

    this.localStorageDir = path.resolve(
      process.cwd(),
      '.uploads',
      this.bucketName,
    );

    if (
      supabaseUrl &&
      serviceRoleKey &&
      serviceRoleKey !== 'placeholder_service_role_key'
    ) {
      this.supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
      this.isCloudStorageEnabled = true;
      this.hmacSecret = configuredSecret;
      this.logger.log(
        `✅ Supabase Cloud Storage inicializado para bucket privado: "${this.bucketName}"`,
      );
    } else {
      this.isCloudStorageEnabled = false;

      // H-13 / H-SEC-03 Fail-fast: Abortar si falta el secreto de firmado en almacenamiento local
      if (!configuredSecret || configuredSecret.trim().length < 16) {
        throw new Error(
          'Configuración insegura detectada: Se requiere JWT_SECRET o SUPABASE_JWT_SECRET (o STORAGE_HMAC_SECRET) (mínimo 16 caracteres) para el firmado seguro de archivos en modo local.',
        );
      }
      this.hmacSecret = configuredSecret;

      if (!fs.existsSync(this.localStorageDir)) {
        fs.mkdirSync(this.localStorageDir, { recursive: true });
      }
      this.logger.warn(
        `⚠️ SUPABASE_SERVICE_ROLE_KEY no configurado o es placeholder. Utilizando almacenamiento local seguro para "${this.bucketName}".`,
      );
    }
  }

  /**
   * Valida y resuelve de forma segura una ruta de archivo dentro del directorio de almacenamiento local.
   * Previene de forma estricta ataques de Path Traversal (H-15):
   * - Rechaza caracteres nulos (\0).
   * - Rechaza rutas absolutas directas (ej. C:\... o /...).
   * - Comprueba que la ruta resuelta se encuentre estrictamente dentro de localStorageDir
   *   utilizando path.relative y separador de directorio seguro.
   * - Si el archivo ya existe en disco, verifica que fs.realpathSync no apunte a un enlace simbólico externo.
   */
  public validateAndResolveLocalPath(filePath: string): string {
    if (!filePath || typeof filePath !== 'string') {
      throw new BadRequestException('Ruta de archivo no especificada o inválida');
    }

    if (filePath.includes('\0')) {
      throw new BadRequestException('Ruta de archivo contiene caracteres nulos prohibidos');
    }

    const normalizedInput = filePath.replace(/\\/g, '/');
    if (
      path.isAbsolute(filePath) ||
      path.isAbsolute(normalizedInput) ||
      /^[a-zA-Z]:/.test(filePath)
    ) {
      throw new BadRequestException('Ruta de archivo absoluta no permitida en almacenamiento');
    }

    const baseDir = path.resolve(this.localStorageDir);
    const resolvedTarget = path.resolve(baseDir, filePath);

    // Comprobación de contención con path.relative y prefijo estricto con separador
    const relative = path.relative(baseDir, resolvedTarget);
    if (
      relative.startsWith('..') ||
      path.isAbsolute(relative) ||
      !(resolvedTarget === baseDir || resolvedTarget.startsWith(baseDir + path.sep))
    ) {
      throw new BadRequestException(
        'Acceso no autorizado: la ruta intenta acceder fuera del directorio de almacenamiento',
      );
    }

    // Comprobación de enlaces simbólicos si el archivo o la ruta ya existe
    if (fs.existsSync(resolvedTarget)) {
      const realTarget = fs.realpathSync(resolvedTarget);
      const realBase = fs.existsSync(baseDir) ? fs.realpathSync(baseDir) : baseDir;
      const realRelative = path.relative(realBase, realTarget);
      if (
        realRelative.startsWith('..') ||
        path.isAbsolute(realRelative) ||
        !(realTarget === realBase || realTarget.startsWith(realBase + path.sep))
      ) {
        throw new BadRequestException(
          'Acceso no autorizado: el archivo apunta a una ubicación externa protegida',
        );
      }
      return realTarget;
    }

    return resolvedTarget;
  }

  /**
   * Sube un archivo PDF al almacenamiento privado.
   */
  async uploadFile(
    filePath: string,
    fileBuffer: Buffer,
    mimeType: string,
  ): Promise<StorageUploadResult> {
    if (this.isCloudStorageEnabled && this.supabaseAdmin) {
      const { data, error } = await this.supabaseAdmin.storage
        .from(this.bucketName)
        .upload(filePath, fileBuffer, {
          contentType: mimeType,
          upsert: true,
        });

      if (error || !data) {
        this.logger.error(
          `Error al subir archivo a Supabase Storage [${this.bucketName}/${filePath}]: ${error?.message}`,
        );
        throw new InternalServerErrorException(
          `No se pudo almacenar el certificado en Supabase Storage: ${error?.message}`,
        );
      }

      return { path: data.path };
    } else {
      // Almacenamiento local seguro
      const absoluteTarget = this.validateAndResolveLocalPath(filePath);
      const parentDir = path.dirname(absoluteTarget);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      fs.writeFileSync(absoluteTarget, fileBuffer);
      return { path: filePath };
    }
  }

  /**
   * Genera una URL firmada temporal de descarga con vigencia estricta de 15 minutos (900 segundos).
   */
  async createSignedUrl(
    filePath: string,
    expiresInSeconds = 900,
  ): Promise<StorageSignedUrlResult> {
    if (this.isCloudStorageEnabled && this.supabaseAdmin) {
      const { data, error } = await this.supabaseAdmin.storage
        .from(this.bucketName)
        .createSignedUrl(filePath, expiresInSeconds);

      if (error || !data?.signedUrl) {
        this.logger.error(
          `Error al generar Signed URL en Supabase Storage [${filePath}]: ${error?.message}`,
        );
        throw new InternalServerErrorException(
          `No se pudo generar la URL de descarga segura: ${error?.message}`,
        );
      }

      return {
        downloadUrl: data.signedUrl,
        signedUrl: data.signedUrl,
        expiresInSeconds,
      };
    } else {
      // Validación previa de contención local (Defensa en profundidad)
      this.validateAndResolveLocalPath(filePath);

      // Generación local de URL firmada mediante HMAC-SHA256
      const expiresAtTimestamp = Math.floor(Date.now() / 1000) + expiresInSeconds;
      const payloadToSign = `${filePath}:${expiresAtTimestamp}`;
      const signature = crypto
        .createHmac('sha256', this.hmacSecret)
        .update(payloadToSign)
        .digest('hex');

      const encodedPath = encodeURIComponent(filePath);
      const port = this.configService.get<number>('PORT', 3000);
      const baseUrl =
        this.configService.get<string>('APP_URL') ||
        `http://localhost:${port}`;
      const downloadUrl = `${baseUrl}/api/v1/fumigations/download-file?path=${encodedPath}&expires=${expiresAtTimestamp}&sig=${signature}`;

      return {
        downloadUrl,
        signedUrl: downloadUrl,
        expiresInSeconds,
      };
    }
  }

  /**
   * Borrado compensatorio del archivo en storage para evitar archivos huérfanos
   * si la transacción en PostgreSQL falla.
   */
  async deleteFile(filePath: string): Promise<void> {
    try {
      if (this.isCloudStorageEnabled && this.supabaseAdmin) {
        const { error } = await this.supabaseAdmin.storage
          .from(this.bucketName)
          .remove([filePath]);

        if (error) {
          this.logger.error(
            `Fallo en borrado compensatorio de archivo [${filePath}]: ${error.message}`,
          );
        } else {
          this.logger.log(
            `♻️ Borrado compensatorio ejecutado con éxito en Supabase Storage: [${filePath}]`,
          );
        }
      } else {
        const absoluteTarget = this.validateAndResolveLocalPath(filePath);
        if (fs.existsSync(absoluteTarget)) {
          fs.unlinkSync(absoluteTarget);
          this.logger.log(
            `♻️ Borrado compensatorio ejecutado con éxito en almacenamiento local: [${filePath}]`,
          );
        }
      }
    } catch (err: any) {
      this.logger.error(
        `Excepción durante borrado compensatorio de archivo [${filePath}]: ${err?.message}`,
      );
    }
  }

  /**
   * Verifica la firma y devuelve el buffer del archivo en modo local.
   */
  async verifyAndReadLocalFile(
    filePath: string,
    expires: number,
    sig: string,
  ): Promise<Buffer> {
    const currentTimestamp = Math.floor(Date.now() / 1000);
    if (currentTimestamp > expires) {
      throw new InternalServerErrorException(
        'La URL firmada ha expirado (vigencia de 15 minutos vencida)',
      );
    }

    const payloadToSign = `${filePath}:${expires}`;
    const expectedSig = crypto
      .createHmac('sha256', this.hmacSecret)
      .update(payloadToSign)
      .digest('hex');

    if (sig !== expectedSig) {
      throw new InternalServerErrorException('Firma criptográfica inválida');
    }

    const absoluteTarget = this.validateAndResolveLocalPath(filePath);
    if (!fs.existsSync(absoluteTarget)) {
      throw new InternalServerErrorException(
        'El archivo no existe en el almacenamiento local',
      );
    }

    return fs.readFileSync(absoluteTarget);
  }
}
