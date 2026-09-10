import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { SupabaseStorageService } from './supabase-storage.service';
import { CreateFumigationDto, FumigationLotDetailDto } from './dto/create-fumigation.dto';
import { QueryFumigationDto } from './dto/query-fumigation.dto';
import {
  PaginatedFumigationResponseDto,
  SignedCertificateUrlResponseDto,
} from './dto/fumigation-response.dto';
import { randomUUID } from 'crypto';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

@Injectable()
export class FumigationService {
  private readonly logger = new Logger(FumigationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: SupabaseStorageService,
  ) {}

  /**
   * Valida que un buffer corresponda efectivamente a un documento PDF.
   * Verifica los magic bytes '%PDF-' (0x25, 0x50, 0x44, 0x46, 0x2D).
   */
  private isValidPdf(buffer: Buffer): boolean {
    if (!buffer || buffer.length < 5) return false;
    const header = buffer.subarray(0, 5).toString('ascii');
    return header.startsWith('%PDF-');
  }

  /**
   * Sanitiza un nombre de archivo para prevenir directory traversal y caracteres inválidos.
   */
  private sanitizeFileName(fileName: string): string {
    return fileName
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_{2,}/g, '_');
  }

  /**
   * Normaliza la estructura de dailyProduction para asegurar compatibilidad de producto
   * tanto en registros legados monoproducto como en el modelo multiproducto (TSK-20.4).
   */
  private formatDailyProduction(dailyProduction: any) {
    if (!dailyProduction) return null;
    const details = dailyProduction.productionDetails || [];
    const primaryProduct =
      dailyProduction.product ||
      details[0]?.product ||
      null;

    return {
      ...dailyProduction,
      product: primaryProduct,
      productionDetails: details,
    };
  }

  /**
   * Registra un evento de tratamiento fitosanitario y sube el certificado PDF oficial a Storage privado (UC-FUM-01 / RN-FUM-MULTI).
   * Soporta múltiples órdenes de producción y selección granular de productos tratados por orden.
   * Implementa Two-Phase Compensation: si la inserción en BD falla, el archivo en storage se borra inmediatamente.
   */
  async create(
    dto: CreateFumigationDto,
    file: Express.Multer.File,
    user: { id: string; email: string; role: string },
  ) {
    // 1. Validación estricta del archivo PDF
    if (!file || !file.buffer) {
      throw new BadRequestException(
        'El archivo PDF del certificado OIRSA es obligatorio (campo "file")',
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `El archivo PDF excede el tamaño máximo permitido de 10 MB (${(file.size / (1024 * 1024)).toFixed(2)} MB recibidos)`,
      );
    }

    if (
      file.mimetype !== 'application/pdf' &&
      !file.originalname.toLowerCase().endsWith('.pdf')
    ) {
      throw new BadRequestException(
        'El archivo debe ser un documento PDF válido (MIME: application/pdf)',
      );
    }

    if (!this.isValidPdf(file.buffer)) {
      throw new BadRequestException(
        'El archivo adjunto no es un documento PDF válido (cabecera corrupta o inválida)',
      );
    }

    // 2. Determinación y normalización de lotes a procesar (RN-FUM-MULTI)
    let lotsToProcess: FumigationLotDetailDto[] = [];

    if (dto.lots && Array.isArray(dto.lots) && dto.lots.length > 0) {
      lotsToProcess = dto.lots;
    } else if (dto.dailyProductionId) {
      // Compatibilidad con invocaciones legadas
      const legacyDp = await this.prisma.dailyProduction.findUnique({
        where: { id: dto.dailyProductionId },
        include: {
          productionDetails: true,
        },
      });

      if (!legacyDp) {
        throw new NotFoundException(
          `El lote de producción diaria con ID "${dto.dailyProductionId}" no existe`,
        );
      }

      const pIds =
        legacyDp.productionDetails && legacyDp.productionDetails.length > 0
          ? legacyDp.productionDetails.map((pd) => pd.productId)
          : legacyDp.productId
            ? [legacyDp.productId]
            : [];

      if (pIds.length === 0) {
        throw new BadRequestException(
          `La orden de producción "${legacyDp.productionLot}" no tiene productos asignados para fumigación`,
        );
      }

      lotsToProcess = [
        {
          dailyProductionId: dto.dailyProductionId,
          productIds: pIds,
        },
      ];
    } else {
      throw new BadRequestException(
        'Debe proporcionar al menos una orden de producción en "lots" para registrar el tratamiento fitosanitario',
      );
    }

    // 3. Validación jerárquica de existencia y pertenencia de productos (RN-FUM-MULTI)
    const flatDetailsList: Array<{
      dailyProductionId: string;
      productId: string;
      productionDetailId: string | null;
    }> = [];

    for (const lot of lotsToProcess) {
      if (!lot.dailyProductionId) {
        throw new BadRequestException('Cada lote en "lots" debe tener dailyProductionId');
      }

      if (!lot.productIds || !Array.isArray(lot.productIds) || lot.productIds.length === 0) {
        throw new BadRequestException(
          `Debe seleccionar al menos un producto tratado para el lote "${lot.dailyProductionId}"`,
        );
      }

      const dp = await this.prisma.dailyProduction.findUnique({
        where: { id: lot.dailyProductionId },
        include: {
          productionDetails: {
            include: { product: true },
          },
          product: true,
        },
      });

      if (!dp) {
        throw new NotFoundException(
          `La orden de producción con ID "${lot.dailyProductionId}" no existe`,
        );
      }

      // Mapa de productos válidos en esta orden: productId -> productionDetailId | null
      const validProductMap = new Map<string, string | null>();
      if (dp.productionDetails && dp.productionDetails.length > 0) {
        for (const pd of dp.productionDetails) {
          validProductMap.set(pd.productId, pd.id);
        }
      }
      if (dp.productId) {
        validProductMap.set(dp.productId, null);
      }

      // Validar que cada producto seleccionado pertenezca estrictamente a la orden
      for (const prodId of lot.productIds) {
        if (!validProductMap.has(prodId)) {
          throw new BadRequestException(
            `El producto con ID "${prodId}" no pertenece a la orden de producción "${dp.productionLot}"`,
          );
        }

        flatDetailsList.push({
          dailyProductionId: lot.dailyProductionId,
          productId: prodId,
          productionDetailId: validProductMap.get(prodId) || null,
        });
      }
    }

    // 4. Preparación de ruta determinística en Storage privado (UC-FUM-01)
    // Formato: certificates/{year}/{month}/{uuid}-{sanitizedFileName}
    const [year, month] = dto.fumigationDate.split('-');
    const safeOriginalName = this.sanitizeFileName(file.originalname);
    const uniqueFileId = randomUUID();
    const storageFilePath = `certificates/${year}/${month}/${uniqueFileId}-${safeOriginalName}`;

    // 5. Carga al almacenamiento privado (Paso 1 del flujo)
    await this.storageService.uploadFile(
      storageFilePath,
      file.buffer,
      'application/pdf',
    );

    // 6. Inserción atómica en base de datos con compensación en caso de fallo
    try {
      const fumigationDateObj = new Date(dto.fumigationDate + 'T00:00:00.000Z');

      const timeParts = dto.fumigationTime.split(':');
      const hours = timeParts[0].padStart(2, '0');
      const minutes = timeParts[1].padStart(2, '0');
      const seconds = timeParts[2] ? timeParts[2].padStart(2, '0') : '00';
      const fumigationTimeObj = new Date(
        `1970-01-01T${hours}:${minutes}:${seconds}.000Z`,
      );

      const createdFumigation = await this.prisma.fumigation.create({
        data: {
          dailyProductionId: lotsToProcess[0].dailyProductionId,
          fumigationDate: fumigationDateObj,
          fumigationTime: fumigationTimeObj,
          certificateNumber: dto.certificateNumber.trim(),
          observations: dto.observations?.trim() || null,
          pdfFilePath: storageFilePath,
          pdfFileName: file.originalname,
          fileSizeBytes: file.size,
          registeredById: user.id,
          details: {
            create: flatDetailsList.map((d) => ({
              dailyProductionId: d.dailyProductionId,
              productId: d.productId,
              productionDetailId: d.productionDetailId,
            })),
          },
        },
        include: {
          dailyProduction: {
            include: {
              product: true,
              productionDetails: {
                include: { product: true },
              },
            },
          },
          details: {
            include: {
              dailyProduction: {
                select: {
                  id: true,
                  productionLot: true,
                  productionDate: true,
                  isoWeek: true,
                },
              },
              product: {
                select: {
                  id: true,
                  name: true,
                  dimensions: true,
                },
              },
            },
          },
          registeredBy: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
        },
      });

      // 7. Registro de auditoría técnica forense (AuditLog)
      await this.prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'CREATE',
          tableName: 'fumigations',
          recordId: createdFumigation.id,
          newValues: JSON.stringify({
            id: createdFumigation.id,
            certificateNumber: createdFumigation.certificateNumber,
            fumigationDate: dto.fumigationDate,
            fumigationTime: dto.fumigationTime,
            lotsCovered: lotsToProcess.length,
            totalProductsTreated: flatDetailsList.length,
            pdfFilePath: createdFumigation.pdfFilePath,
            fileSizeBytes: createdFumigation.fileSizeBytes,
          }),
        },
      });

      this.logger.log(
        `✅ Fumigación OIRSA multi-lote registrada: ID ${createdFumigation.id} [${lotsToProcess.length} lotes, ${flatDetailsList.length} productos tratados, Cert: ${createdFumigation.certificateNumber}]`,
      );

      return {
        success: true,
        data: {
          ...createdFumigation,
          dailyProduction: this.formatDailyProduction(createdFumigation.dailyProduction),
        },
      };
    } catch (dbError: any) {
      // COMPENSATING TRANSACTION: Borrado del archivo subido en storage
      this.logger.error(
        `⚠️ Error al persistir fumigación en PostgreSQL. Ejecutando borrado compensatorio en storage para [${storageFilePath}]: ${dbError?.message}`,
      );

      await this.storageService.deleteFile(storageFilePath);

      if (dbError instanceof NotFoundException || dbError instanceof BadRequestException) {
        throw dbError;
      }

      throw new InternalServerErrorException(
        `Error al registrar el evento de fumigación en la base de datos: ${dbError?.message}`,
      );
    }
  }

  /**
   * Consulta paginada y filtrada de tratamientos fitosanitarios (EP-FUM-02 / UC-FUM-02).
   */
  async findAll(query: QueryFumigationDto): Promise<PaginatedFumigationResponseDto> {
    const page = Math.max(1, query.page || 1);
    const limit = query.limit !== undefined ? Number(query.limit) : 10;
    const isAll = limit === 0 || limit >= 10000;
    const skip = isAll ? undefined : (page - 1) * limit;
    const take = isAll ? undefined : limit;

    const where: any = {};

    if (query.dailyProductionId) {
      where.OR = [
        { dailyProductionId: query.dailyProductionId },
        { details: { some: { dailyProductionId: query.dailyProductionId } } },
      ];
    }

    if (query.certificateNumber) {
      where.certificateNumber = {
        contains: query.certificateNumber.trim(),
        mode: 'insensitive',
      };
    }

    if (query.startDate || query.endDate) {
      where.fumigationDate = {};
      if (query.startDate) {
        where.fumigationDate.gte = new Date(query.startDate + 'T00:00:00.000Z');
      }
      if (query.endDate) {
        where.fumigationDate.lte = new Date(query.endDate + 'T23:59:59.999Z');
      }
    }

    const [total, fumigations] = await Promise.all([
      this.prisma.fumigation.count({ where }),
      this.prisma.fumigation.findMany({
        where,
        skip,
        take,
        orderBy: [{ fumigationDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        include: {
          dailyProduction: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  dimensions: true,
                },
              },
              productionDetails: {
                include: {
                  product: {
                    select: {
                      id: true,
                      name: true,
                      dimensions: true,
                    },
                  },
                },
              },
            },
          },
          details: {
            include: {
              dailyProduction: {
                select: {
                  id: true,
                  productionLot: true,
                  productionDate: true,
                  isoWeek: true,
                },
              },
              product: {
                select: {
                  id: true,
                  name: true,
                  dimensions: true,
                },
              },
            },
          },
          registeredBy: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
        },
      }),
    ]);

    const totalPages = isAll ? 1 : Math.ceil(total / limit) || 1;
    const formattedData = fumigations.map((f) => ({
      ...f,
      dailyProduction: this.formatDailyProduction(f.dailyProduction),
    }));

    return {
      success: true,
      data: formattedData as any,
      meta: {
        total,
        page: isAll ? 1 : page,
        limit: isAll ? total : limit,
        totalPages,
      },
    };
  }

  /**
   * Obtiene el detalle de un tratamiento fitosanitario por ID.
   */
  async findOne(id: string) {
    const fumigation = await this.prisma.fumigation.findUnique({
      where: { id },
      include: {
        dailyProduction: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                dimensions: true,
              },
            },
            productionDetails: {
              include: { product: true },
            },
          },
        },
        details: {
          include: {
            dailyProduction: {
              select: {
                id: true,
                productionLot: true,
                productionDate: true,
                isoWeek: true,
              },
            },
            product: {
              select: {
                id: true,
                name: true,
                dimensions: true,
              },
            },
          },
        },
        registeredBy: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    if (!fumigation) {
      throw new NotFoundException(
        `Registro de fumigación con ID "${id}" no encontrado`,
      );
    }

    return {
      success: true,
      data: {
        ...fumigation,
        dailyProduction: this.formatDailyProduction(fumigation.dailyProduction),
      },
    };
  }

  /**
   * Genera una URL firmada temporal de 15 minutos (900 segundos) para descarga segura del certificado PDF (EP-FUM-03 / UC-FUM-02).
   */
  async getCertificateSignedUrl(id: string): Promise<SignedCertificateUrlResponseDto> {
    const fumigation = await this.prisma.fumigation.findUnique({
      where: { id },
    });

    if (!fumigation) {
      throw new NotFoundException(
        `Registro de fumigación con ID "${id}" no encontrado`,
      );
    }

    const signedUrlResult = await this.storageService.createSignedUrl(
      fumigation.pdfFilePath,
      900, // 15 minutos estrictos
    );

    return {
      success: true,
      data: signedUrlResult,
    };
  }
}
