import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AdjustmentType, MovementType, ReasonType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { InventoryLedgerService } from './inventory-ledger.service';
import { CreateInventoryAdjustmentDto } from './dto/create-inventory-adjustment.dto';
import { QueryInventoryAdjustmentDto } from './dto/query-inventory-adjustment.dto';
import { PaginatedInventoryAdjustmentResponseDto } from './dto/inventory-adjustment-response.dto';

@Injectable()
export class AdjustmentsService {
  private readonly logger = new Logger(AdjustmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryLedgerService: InventoryLedgerService,
  ) {}

  /**
   * Ejecuta una rectificación administrativa de stock exclusivo para Administrador (UC-ADJ-01 / EP-ADJ-01).
   * Ejecuta bloqueo pesimista sobre el producto, recalcula el stock previo en el ledger,
   * valida que el inventario no resulte negativo, genera el movimiento append-only (+/-N) y registra
   * la fotografía inmutable del ajuste (RN-001, RN-004A, RN-010, D-028).
   */
  async create(
    dto: CreateInventoryAdjustmentDto,
    user: { id: string; email: string; role: string },
  ) {
    // 1. Validación previa: Existencia del producto en el catálogo
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });

    if (!product) {
      throw new NotFoundException({
        code: 'PRODUCT_NOT_FOUND',
        message: `El producto con ID '${dto.productId}' no existe en el catálogo`,
      });
    }

    // 2. Validación de notas para motivo personalizado (FA-03)
    if (dto.reasonType === ReasonType.CUSTOM) {
      if (!dto.reasonNotes || dto.reasonNotes.trim().length < 10) {
        throw new BadRequestException({
          code: 'INVALID_REASON_NOTES',
          message:
            'Debe proporcionar una justificación detallada (mínimo 10 caracteres) para el ajuste personalizado (FA-03)',
        });
      }
    }

    // 2. Normalización Matemática Inteligente y Prevención de Doble Negación (TSK-ADJ-DELTA)
    const rawQuantity = dto.quantity;
    const quantityFinal = Math.abs(rawQuantity);

    if (quantityFinal === 0) {
      throw new BadRequestException({
        code: 'INVALID_QUANTITY',
        message: 'La cantidad a ajustar no puede ser cero',
      });
    }

    // Determinar tipo efectivo: si quantity < 0, siempre representa DECREMENT.
    const effectiveType =
      rawQuantity < 0
        ? AdjustmentType.DECREMENT
        : dto.adjustmentType || AdjustmentType.INCREMENT;

    const isDecrement = effectiveType === AdjustmentType.DECREMENT;
    const delta = isDecrement ? -quantityFinal : quantityFinal;

    // 3. Transacción atómica con bloqueo pesimista sobre el producto
    const createdAdjustment = await this.prisma.$transaction(async (tx) => {
      // Bloqueo pesimista a nivel de fila sobre el producto para serializar ajustes y evitar race conditions
      await tx.$queryRaw`SELECT id FROM products WHERE id = ${dto.productId}::uuid FOR UPDATE`;

      // Recalcular el stock previo real directamente desde el ledger dentro de la transacción
      const previousStock = await this.inventoryLedgerService.getAvailableStock(
        dto.productId,
        tx,
      );

      // Calcular el stock resultante proyectado
      const newStock = previousStock + delta;

      // Restricción de inventario no negativo (FA-02)
      if (newStock < 0) {
        throw new BadRequestException({
          code: 'NEGATIVE_STOCK_NOT_ALLOWED',
          message: `Stock insuficiente para aplicar el ajuste. Stock actual: ${previousStock}, decremento solicitado: ${quantityFinal}. El ajuste no puede dejar el stock del producto en negativo (FA-02)`,
        });
      }

      // Inserción del documento de ajuste fotográfico inmutable (RN-004A)
      const adjustment = await tx.inventoryAdjustment.create({
        data: {
          productId: dto.productId,
          adjustmentType: effectiveType,
          quantity: quantityFinal,
          previousStock,
          newStock,
          reasonType: dto.reasonType,
          reasonNotes: dto.reasonNotes?.trim() || null,
          executedById: user.id,
        },
      });

      // Registro del movimiento firmado en el ledger append-only (+/-N, RN-010)
      await this.inventoryLedgerService.recordMovement(
        {
          productId: dto.productId,
          movementType: MovementType.ADJUSTMENT,
          quantity: quantityFinal,
          isAdjustmentDecrement: isDecrement,
          referenceTable: 'inventory_adjustments',
          referenceId: adjustment.id,
          performedById: user.id,
        },
        tx,
      );

      // Registro técnico en la tabla de auditoría (AuditLog)
      const difference = delta;
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'CREATE',
          tableName: 'inventory_adjustments',
          recordId: adjustment.id,
          newValues: JSON.stringify({
            id: adjustment.id,
            productId: dto.productId,
            productName: product.name,
            adjustmentType: effectiveType,
            quantity: quantityFinal,
            previousStock,
            newStock,
            difference,
            reasonType: dto.reasonType,
            reasonNotes: adjustment.reasonNotes,
            executedById: user.id,
          }),
        },
      });

      this.logger.log(
        `✅ Ajuste de inventario registrado: ID=${adjustment.id}, Producto=${product.name}, Tipo=${effectiveType}, Cantidad=${quantityFinal} (Delta=${delta}), Stock: ${previousStock} -> ${newStock}`,
      );

      return adjustment;
    });

    // 4. Retorno de la entidad completa con relaciones
    return this.findOne(createdAdjustment.id);
  }

  /**
   * Consulta paginada del historial inmutable de ajustes administrativos (UC-ADJ-02 / EP-ADJ-02).
   */
  async findAll(query: QueryInventoryAdjustmentDto): Promise<PaginatedInventoryAdjustmentResponseDto> {
    const page = Math.max(1, query.page || 1);
    const limit = query.limit !== undefined ? Number(query.limit) : 10;
    const isAll = limit === 0 || limit >= 10000;
    const skip = isAll ? undefined : (page - 1) * limit;
    const take = isAll ? undefined : limit;

    const where: any = {};

    if (query.productId) {
      where.productId = query.productId;
    }

    if (query.adjustmentType) {
      where.adjustmentType = query.adjustmentType;
    }

    if (query.reasonType) {
      where.reasonType = query.reasonType;
    }

    if (query.startDate || query.endDate) {
      where.executedAt = {};
      if (query.startDate) {
        where.executedAt.gte = new Date(query.startDate + 'T00:00:00.000Z');
      }
      if (query.endDate) {
        where.executedAt.lte = new Date(query.endDate + 'T23:59:59.999Z');
      }
    }

    const [total, adjustments] = await Promise.all([
      this.prisma.inventoryAdjustment.count({ where }),
      this.prisma.inventoryAdjustment.findMany({
        where,
        skip,
        take,
        orderBy: [{ executedAt: 'desc' }, { id: 'desc' }],
        include: {
          product: {
            select: {
              id: true,
              name: true,
              dimensions: true,
            },
          },
          executedBy: {
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

    return {
      success: true,
      data: adjustments as any,
      meta: {
        total,
        page: isAll ? 1 : page,
        limit: isAll ? total : limit,
        totalPages,
      },
    };
  }

  /**
   * Obtiene el detalle inmutable de un ajuste administrativo por ID (EP-ADJ-03).
   */
  async findOne(id: string) {
    const adjustment = await this.prisma.inventoryAdjustment.findUnique({
      where: { id },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            dimensions: true,
          },
        },
        executedBy: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    if (!adjustment) {
      throw new NotFoundException({
        code: 'ADJUSTMENT_NOT_FOUND',
        message: `Ajuste de inventario con ID '${id}' no encontrado`,
      });
    }

    return {
      success: true,
      data: adjustment,
    };
  }
}
