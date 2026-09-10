import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UnitOfMeasure, WoodTypeEnum } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateWoodReceiptDto } from './dto/create-wood-receipt.dto';
import { QueryWoodReceiptDto } from './dto/query-wood-receipt.dto';

@Injectable()
export class WoodReceiptsService {
  private readonly logger = new Logger(WoodReceiptsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generates a deterministic, sequential, daily lot number in format LT-DDMMYY-XX.
   * Consecutively resets to 01 each day (RN-009, D-018, D-019).
   *
   * @param receiptDateStr Date formatted as YYYY-MM-DD
   * @param tx Prisma transaction client
   */
  async generateLotNumber(
    receiptDateStr: string,
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const [year, month, day] = receiptDateStr.split('-');
    const shortYear = year.slice(2);
    const prefix = `LT-${day}${month}${shortYear}-`;

    const latestReceipt = await tx.woodReceipt.findFirst({
      where: {
        lotNumber: {
          startsWith: prefix,
        },
      },
      orderBy: {
        lotNumber: 'desc',
      },
      select: {
        lotNumber: true,
      },
    });

    if (!latestReceipt) {
      return `${prefix}01`;
    }

    // Extract suffix XX
    const parts = latestReceipt.lotNumber.split('-');
    const currentSeq = parseInt(parts[2], 10) || 0;
    const nextSeq = currentSeq + 1;
    return `${prefix}${String(nextSeq).padStart(2, '0')}`;
  }

  /**
   * Registers physical wood receipt in patio and auto-generates lotNumber (UC-REC-01).
   * Strictly atomic, assigns unit based on woodType (RN-016), and records AuditLog.
   *
   * @param dto Receipt payload
   * @param userId Authenticated user UUID from JWT
   */
  async create(dto: CreateWoodReceiptDto, userId: string) {
    // 1. Validate date is not in future (FA-03)
    const todayStr = new Date().toISOString().split('T')[0];
    if (dto.receiptDate > todayStr) {
      throw new BadRequestException({
        code: 'FUTURE_DATE_NOT_ALLOWED',
        message: 'La fecha de recepción no puede ser posterior al día de hoy (FA-03)',
      });
    }

    // 2. Validate quantity strictly positive (FA-02)
    if (dto.quantity <= 0) {
      throw new BadRequestException({
        code: 'INVALID_QUANTITY',
        message: 'La cantidad de madera recibida debe ser estrictamente mayor a cero (FA-02)',
      });
    }

    // 3. Validate supplier existence and active state (FA-01)
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: dto.supplierId },
    });

    if (!supplier || !supplier.isActive) {
      throw new BadRequestException({
        code: 'INVALID_SUPPLIER',
        message: 'El proveedor seleccionado no existe o se encuentra inactivo (FA-01)',
      });
    }

    // 4. Validate species existence
    const species = await this.prisma.woodSpecies.findUnique({
      where: { id: dto.speciesId },
    });

    if (!species || !species.isActive) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: 'La especie de madera seleccionada no existe en el catálogo',
      });
    }

    // 5. Validate woodType existence, determine unit, and enforce RN-016-B
    const woodType = await this.prisma.woodType.findUnique({
      where: { id: dto.woodTypeId },
    });

    if (!woodType || !woodType.isActive) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: 'El tipo de madera seleccionado no existe en el catálogo',
      });
    }

    let unit: UnitOfMeasure;
    let yugosQuantity: number | null = null;
    let reglasQuantity: number | null = null;

    if (woodType.name === WoodTypeEnum.TIMBRE) {
      unit = UnitOfMeasure.PIE_TABLAR;

      if (
        (dto.yugosQuantity !== undefined && dto.yugosQuantity !== null) ||
        (dto.reglasQuantity !== undefined && dto.reglasQuantity !== null)
      ) {
        throw new BadRequestException({
          code: 'PROCESADA_FIELDS_NOT_ALLOWED_FOR_TIMBRE',
          message:
            'La madera tipo TIMBRE se mide exclusivamente en Pies Tablares; no admite desglose de Yugos ni Reglas (RN-016-B)',
        });
      }
    } else if (woodType.name === WoodTypeEnum.PROCESADA) {
      unit = UnitOfMeasure.PIEZAS;

      const yugos = dto.yugosQuantity ?? 0;
      const reglas = dto.reglasQuantity ?? 0;

      if (yugos <= 0 && reglas <= 0) {
        throw new BadRequestException({
          code: 'INVALID_PROCESADA_BREAKDOWN',
          message:
            'Para madera PROCESADA debe especificarse al menos una cantidad mayor a cero de Yugos o de Reglas (RN-016-B)',
        });
      }

      const expectedTotal = yugos + reglas;
      if (Number(dto.quantity) !== expectedTotal) {
        throw new BadRequestException({
          code: 'QUANTITY_BREAKDOWN_MISMATCH',
          message: `La cantidad total de piezas declarada (${dto.quantity}) debe ser exactamente igual a la suma de Yugos (${yugos}) y Reglas (${reglas}) (RN-016-B)`,
        });
      }

      yugosQuantity = dto.yugosQuantity !== undefined && dto.yugosQuantity !== null ? dto.yugosQuantity : null;
      reglasQuantity = dto.reglasQuantity !== undefined && dto.reglasQuantity !== null ? dto.reglasQuantity : null;
    } else {
      unit = woodType.defaultUnit;
    }

    // 6. Concurrency-safe atomic transaction with retry on unique constraint
    let attempts = 0;
    while (attempts < 3) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const lotNumber = await this.generateLotNumber(dto.receiptDate, tx);
          const timeFormatted =
            dto.receiptTime.length === 5
              ? `${dto.receiptTime}:00`
              : dto.receiptTime;

          const receiptDateObj = new Date(`${dto.receiptDate}T00:00:00.000Z`);
          const receiptTimeObj = new Date(`1970-01-01T${timeFormatted}Z`);

          const receipt = await tx.woodReceipt.create({
            data: {
              lotNumber,
              receiptDate: receiptDateObj,
              receiptTime: receiptTimeObj,
              supplierId: dto.supplierId,
              speciesId: dto.speciesId,
              woodTypeId: dto.woodTypeId,
              quantity: new Prisma.Decimal(dto.quantity),
              unit,
              yugosQuantity,
              reglasQuantity,
              guideNumber: dto.guideNumber?.trim() || null,
              woodStatus: dto.woodStatus?.trim() || null,
              createdById: userId,
            },
            include: {
              supplier: {
                select: { id: true, name: true, legalId: true },
              },
              species: {
                select: { id: true, name: true },
              },
              woodType: {
                select: { id: true, name: true, defaultUnit: true },
              },
              createdBy: {
                select: { id: true, fullName: true, email: true },
              },
            },
          });

          // AuditLog entry for technical traceability
          await tx.auditLog.create({
            data: {
              tableName: 'wood_receipts',
              recordId: receipt.id,
              action: 'INSERT',
              newValues: {
                lotNumber: receipt.lotNumber,
                quantity: Number(receipt.quantity),
                unit: receipt.unit,
                yugosQuantity: receipt.yugosQuantity,
                reglasQuantity: receipt.reglasQuantity,
                supplierName: receipt.supplier.name,
                guideNumber: receipt.guideNumber,
              },
              userId,
            },
          });

          this.logger.log(
            `[WoodReceipt] Ingreso registrado: Lote=${receipt.lotNumber}, Proveedor=${receipt.supplier.name}, Cantidad=${receipt.quantity} ${receipt.unit}`,
          );

          return receipt;
        });
      } catch (error: any) {
        if (error?.code === 'P2002' && attempts < 2) {
          attempts++;
          this.logger.warn(
            `[WoodReceipt] Colisión de lote detectada en intento ${attempts}. Reintentando con retroceso exponencial...`,
          );
          await new Promise((resolve) => setTimeout(resolve, 40 * attempts));
          continue;
        }
        throw error;
      }
    }

    throw new BadRequestException({
      code: 'RECEIPT_CREATION_FAILED',
      message: 'No fue posible registrar la recepción tras múltiples intentos de asignación de lote',
    });
  }

  /**
   * Retrieves paginated list of wood receipts with filters (UC-REC-02).
   * Validates date range startDate <= endDate (RN-007).
   */
  async findAll(query: QueryWoodReceiptDto) {
    const { startDate, endDate, supplierId, lotNumber, page = 1, limit = 10 } =
      query;

    // Validate date range (RN-007)
    if (startDate && endDate && startDate > endDate) {
      throw new BadRequestException({
        code: 'INVALID_DATE_RANGE',
        message:
          'La fecha inicial no puede ser mayor a la fecha final de consulta (RN-007)',
      });
    }

    const isAll = limit === 0 || limit >= 10000;
    const skip = isAll ? undefined : (page - 1) * limit;
    const take = isAll ? undefined : limit;
    const where: Prisma.WoodReceiptWhereInput = {};

    if (supplierId) {
      where.supplierId = supplierId;
    }

    if (lotNumber) {
      where.lotNumber = {
        contains: lotNumber.trim(),
        mode: 'insensitive',
      };
    }

    if (startDate || endDate) {
      where.receiptDate = {};
      if (startDate) {
        where.receiptDate.gte = new Date(`${startDate}T00:00:00.000Z`);
      }
      if (endDate) {
        where.receiptDate.lte = new Date(`${endDate}T23:59:59.999Z`);
      }
    }

    const [total, receipts] = await Promise.all([
      this.prisma.woodReceipt.count({ where }),
      this.prisma.woodReceipt.findMany({
        where,
        skip,
        take,
        orderBy: [{ receiptDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        include: {
          supplier: {
            select: { id: true, name: true, legalId: true },
          },
          species: {
            select: { id: true, name: true },
          },
          woodType: {
            select: { id: true, name: true, defaultUnit: true },
          },
          createdBy: {
            select: { id: true, fullName: true, email: true },
          },
        },
      }),
    ]);

    const totalPages = isAll ? 1 : Math.ceil(total / limit) || 1;

    return {
      success: true,
      data: receipts,
      meta: {
        total,
        page: isAll ? 1 : page,
        limit: isAll ? total : limit,
        totalPages,
      },
    };
  }

  /**
   * Retrieves single wood receipt file by ID (UC-REC-02).
   */
  async findOne(id: string) {
    const receipt = await this.prisma.woodReceipt.findUnique({
      where: { id },
      include: {
        supplier: {
          select: { id: true, name: true, legalId: true, phone: true },
        },
        species: {
          select: { id: true, name: true },
        },
        woodType: {
          select: { id: true, name: true, defaultUnit: true },
        },
        createdBy: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    if (!receipt) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Recepción de madera con ID '${id}' no encontrada`,
      });
    }

    return {
      success: true,
      data: receipt,
    };
  }
}
