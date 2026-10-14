import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UnitOfMeasure, WoodTypeEnum, CorrectionModule } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateWoodReceiptDto } from './dto/create-wood-receipt.dto';
import { QueryWoodReceiptDto } from './dto/query-wood-receipt.dto';
import { CorrectWoodReceiptDto } from './dto/correct-wood-receipt.dto';
import { validateCorrectionReason } from '../../common/utils/correction-reason.validator';

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

  /**
   * Retrieves context and linked dependencies prior to opening the correction dialog.
   * Warns if wood receipt is already referenced in production orders (RN-016-B).
   */
  async getCorrectionContext(id: string) {
    const receipt = await this.prisma.woodReceipt.findUnique({
      where: { id },
      include: {
        woodType: { select: { id: true, name: true, defaultUnit: true } },
        species: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
        productionWoodReceipts: {
          include: {
            dailyProduction: {
              select: { id: true, productionLot: true, productionDate: true },
            },
          },
        },
      },
    });

    if (!receipt) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Recepción de madera con ID '${id}' no encontrada`,
      });
    }

    const linkedProductions = receipt.productionWoodReceipts.map((pr) => ({
      dailyProductionId: pr.dailyProduction.id,
      productionLot: pr.dailyProduction.productionLot,
      productionDate: pr.dailyProduction.productionDate,
    }));

    return {
      success: true,
      data: {
        id: receipt.id,
        lotNumber: receipt.lotNumber,
        woodTypeName: receipt.woodType.name,
        speciesName: receipt.species.name,
        supplierName: receipt.supplier.name,
        unit: receipt.unit,
        currentQuantity: Number(receipt.quantity),
        currentYugosQuantity: receipt.yugosQuantity,
        currentReglasQuantity: receipt.reglasQuantity,
        linkedProductionsCount: linkedProductions.length,
        linkedProductions,
      },
    };
  }

  /**
   * Executes an atomic, auditable quantity correction for a wood receipt.
   * Preserves all contextual fields (lot, supplier, species, date, etc.).
   * Enforces woodType-specific editable fields (TIMBRE vs PROCESADA).
   * Generates QuantityCorrection + QuantityCorrectionItem + AuditLog within single transaction.
   */
  async correctQuantity(id: string, dto: CorrectWoodReceiptDto, userId: string) {
    // 1. Mandatory Reason Validation (10-500 chars, blacklist filtered)
    const validatedReason = validateCorrectionReason(dto.reason);

    // 2. Idempotency Check
    if (dto.idempotencyKey) {
      const existing = await this.prisma.quantityCorrection.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
        include: {
          items: true,
          correctedBy: {
            select: { id: true, fullName: true, email: true, role: true },
          },
        },
      });
      if (existing) {
        if (existing.recordId && existing.recordId !== id) {
          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'La clave de idempotencia ya fue utilizada para un registro operativo diferente.',
          });
        }
        const receipt = await this.prisma.woodReceipt.findUnique({ where: { id } });
        return {
          success: true,
          message: 'Operación idempotente: la corrección ya fue registrada previamente.',
          data: receipt,
          correction: existing,
        };
      }
    }

    // 3. Atomically execute update within database transaction
    return this.prisma.$transaction(async (tx) => {
      // Concurrency protection: row lock on wood receipt record
      if (typeof (tx as any).$queryRaw === 'function') {
        try {
          await tx.$queryRaw`SELECT id FROM wood_receipts WHERE id = ${id}::uuid FOR UPDATE`;
        } catch {
          // Fallback if raw query execution is not supported in the active client/mock
        }
      }

      // Fetch target record with relations
      const receipt = await tx.woodReceipt.findUnique({
        where: { id },
        include: {
          woodType: true,
          species: true,
          supplier: true,
          productionWoodReceipts: {
            include: { dailyProduction: { select: { productionLot: true } } },
          },
        },
      });

      if (!receipt) {
        throw new NotFoundException({
          code: 'RESOURCE_NOT_FOUND',
          message: `Recepción de madera con ID '${id}' no encontrada`,
        });
      }

      const isTimbre = receipt.woodType.name === WoodTypeEnum.TIMBRE;
      const isProcesada = receipt.woodType.name === WoodTypeEnum.PROCESADA;

      const itemsToRecord: Array<{
        fieldName: string;
        previous: number;
        new: number;
        delta: number;
      }> = [];

      let updateData: Prisma.WoodReceiptUpdateInput = {};

      if (isTimbre) {
        // TIMBRE: Only quantity (pt) is editable. Must be positive decimal (> 0).
        if (dto.quantity === undefined || dto.quantity === null) {
          throw new BadRequestException({
            code: 'MISSING_QUANTITY',
            message: 'Para madera en TIMBRE, debe proporcionar la cantidad corregida en pies tablares (pt).',
          });
        }

        const newQty = Number(dto.quantity);
        if (isNaN(newQty) || newQty <= 0) {
          throw new BadRequestException({
            code: 'INVALID_QUANTITY',
            message: 'La cantidad de madera en TIMBRE debe ser un número positivo mayor a cero.',
          });
        }

        const prevQty = Number(receipt.quantity);
        if (Math.abs(newQty - prevQty) < 0.0001) {
          throw new BadRequestException({
            code: 'NO_CHANGES_DETECTED',
            message: 'La cantidad ingresada es idéntica a la registrada actualmente. No se detectaron cambios.',
          });
        }

        itemsToRecord.push({
          fieldName: 'quantity',
          previous: prevQty,
          new: newQty,
          delta: Number((newQty - prevQty).toFixed(2)),
        });

        updateData = {
          quantity: new Prisma.Decimal(newQty),
        };
      } else if (isProcesada) {
        // PROCESADA: Yugos and Reglas are editable. Total is derived on server.
        const prevYugos = receipt.yugosQuantity ?? 0;
        const prevReglas = receipt.reglasQuantity ?? 0;

        const newYugos = dto.yugosQuantity !== undefined ? dto.yugosQuantity : prevYugos;
        const newReglas = dto.reglasQuantity !== undefined ? dto.reglasQuantity : prevReglas;

        if (!Number.isInteger(newYugos) || newYugos < 0) {
          throw new BadRequestException({
            code: 'INVALID_YUGOS_QUANTITY',
            message: 'La cantidad de yugos debe ser un número entero mayor o igual a cero.',
          });
        }

        if (!Number.isInteger(newReglas) || newReglas < 0) {
          throw new BadRequestException({
            code: 'INVALID_REGLAS_QUANTITY',
            message: 'La cantidad de reglas/tablas debe ser un número entero mayor o igual a cero.',
          });
        }

        const derivedTotal = newYugos + newReglas;
        if (derivedTotal <= 0) {
          throw new BadRequestException({
            code: 'INVALID_SUM_TOTAL',
            message: 'La suma total de yugos y reglas no puede ser cero. Debe existir al menos una pieza.',
          });
        }

        const yugosChanged = newYugos !== prevYugos;
        const reglasChanged = newReglas !== prevReglas;

        if (!yugosChanged && !reglasChanged) {
          throw new BadRequestException({
            code: 'NO_CHANGES_DETECTED',
            message: 'Los valores de yugos y reglas son idénticos a los actuales. No se detectaron cambios.',
          });
        }

        if (yugosChanged) {
          itemsToRecord.push({
            fieldName: 'yugosQuantity',
            previous: prevYugos,
            new: newYugos,
            delta: newYugos - prevYugos,
          });
        }

        if (reglasChanged) {
          itemsToRecord.push({
            fieldName: 'reglasQuantity',
            previous: prevReglas,
            new: newReglas,
            delta: newReglas - prevReglas,
          });
        }

        const prevTotal = Number(receipt.quantity);
        itemsToRecord.push({
          fieldName: 'quantity',
          previous: prevTotal,
          new: derivedTotal,
          delta: derivedTotal - prevTotal,
        });

        updateData = {
          quantity: new Prisma.Decimal(derivedTotal),
          yugosQuantity: newYugos,
          reglasQuantity: newReglas,
        };
      } else {
        throw new BadRequestException({
          code: 'UNSUPPORTED_WOOD_TYPE',
          message: `El tipo de madera '${receipt.woodType.name}' no admite correcciones en este flujo.`,
        });
      }

      // 4. Update the operational record
      const updatedReceipt = await tx.woodReceipt.update({
        where: { id },
        data: updateData,
        include: {
          woodType: true,
          species: true,
          supplier: true,
        },
      });

      // 5. Append-only QuantityCorrection record
      const linkedLots = receipt.productionWoodReceipts.map((pr) => pr.dailyProduction.productionLot);
      const correction = await tx.quantityCorrection.create({
        data: {
          module: CorrectionModule.WOOD_RECEIPT,
          recordId: receipt.id,
          recordCode: receipt.lotNumber,
          reason: validatedReason,
          correctedById: userId,
          idempotencyKey: dto.idempotencyKey || null,
          metadata: {
            woodType: receipt.woodType.name,
            linkedProductionsCount: linkedLots.length,
            linkedProductionLots: linkedLots,
          },
          items: {
            create: itemsToRecord.map((item) => ({
              fieldName: item.fieldName,
              previousQuantity: new Prisma.Decimal(item.previous),
              newQuantity: new Prisma.Decimal(item.new),
              deltaQuantity: new Prisma.Decimal(item.delta),
            })),
          },
        },
        include: {
          items: true,
          correctedBy: {
            select: { id: true, fullName: true, email: true, role: true },
          },
        },
      });

      // 6. Append-only AuditLog record (Action: CORRECTION)
      await tx.auditLog.create({
        data: {
          tableName: 'wood_receipts',
          recordId: receipt.id,
          action: 'CORRECTION',
          oldValues: {
            quantity: Number(receipt.quantity),
            yugosQuantity: receipt.yugosQuantity,
            reglasQuantity: receipt.reglasQuantity,
          },
          newValues: {
            quantity: Number(updatedReceipt.quantity),
            yugosQuantity: updatedReceipt.yugosQuantity,
            reglasQuantity: updatedReceipt.reglasQuantity,
          },
          correctionReason: validatedReason,
          userId,
        },
      });

      this.logger.log(
        `[WoodReceipt] Corrección completada: ID=${receipt.id}, Lote=${receipt.lotNumber}, Items=${itemsToRecord.length}, User=${userId}`,
      );

      return {
        success: true,
        data: updatedReceipt,
        correction,
      };
    });
  }

  /**
   * Retrieves read-only historical list of quantity corrections for a given wood receipt.
   */
  async getCorrections(id: string) {
    const corrections = await this.prisma.quantityCorrection.findMany({
      where: {
        module: CorrectionModule.WOOD_RECEIPT,
        recordId: id,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        items: true,
        correctedBy: {
          select: { id: true, fullName: true, email: true, role: true },
        },
      },
    });

    return {
      success: true,
      data: corrections,
    };
  }
}
