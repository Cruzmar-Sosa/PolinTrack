import {
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

    this.hmacSecret =
      this.configService.get<string>('JWT_SECRET') ||
      this.configService.get<string>('SUPABASE_JWT_SECRET') ||
      'polintrack_storage_hmac_fallback_key_2026';

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
      this.logger.log(
        `✅ Supabase Cloud Storage inicializado para bucket privado: "${this.bucketName}"`,
      );
    } else {
      this.isCloudStorageEnabled = false;
      if (!fs.existsSync(this.localStorageDir)) {
        fs.mkdirSync(this.localStorageDir, { recursive: true });
      }
      this.logger.warn(
        `⚠️ SUPABASE_SERVICE_ROLE_KEY no configurado o es placeholder. Utilizando almacenamiento local seguro para "${this.bucketName}".`,
      );
    }
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
      const absoluteTarget = path.join(this.localStorageDir, filePath);
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
        const absoluteTarget = path.join(this.localStorageDir, filePath);
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

    const absoluteTarget = path.join(this.localStorageDir, filePath);
    if (!fs.existsSync(absoluteTarget)) {
      throw new InternalServerErrorException(
        'El archivo no existe en el almacenamiento local',
      );
    }

    return fs.readFileSync(absoluteTarget);
  }
}
