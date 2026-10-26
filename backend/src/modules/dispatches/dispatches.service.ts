import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DispatchStatus, MovementType, CorrectionModule, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { InventoryLedgerService } from '../inventory/inventory-ledger.service';
import { CreateDispatchHeaderDto } from './dto/create-dispatch.dto';
import { QueryDispatchDto } from './dto/query-dispatch.dto';
import { PaginatedDispatchResponseDto } from './dto/dispatch-response.dto';
import { CorrectDispatchDto } from './dto/correct-dispatch.dto';
import { validateCorrectionReason } from '../../common/utils/correction-reason.validator';
import {
  calculateCorrectionPayloadHash,
  verifyIdempotencyMatch,
} from '../../common/security/idempotency.util';

@Injectable()
export class DispatchesService {
  private readonly logger = new Logger(DispatchesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryLedgerService: InventoryLedgerService,
  ) {}

  /**
   * Normaliza la hora de formato HH:mm o HH:mm:ss a un objeto Date para tipo TIME de PostgreSQL.
   */
  private parseTimeToDate(timeStr: string): Date {
    const parts = timeStr.split(':');
    const hours = parts[0].padStart(2, '0');
    const minutes = parts[1].padStart(2, '0');
    const seconds = parts[2] ? parts[2].padStart(2, '0') : '00';
    return new Date(`1970-01-01T${hours}:${minutes}:${seconds}.000Z`);
  }

  /**
   * Registra una expedición comercial de producto terminado bajo estructura Cabecera-Detalle (UC-DSP-01 / EP-DSP-01).
   * Ejecuta bloqueo pesimista a nivel de fila y validación atómica estricta de stock disponible (RN-002),
   * emitiendo movimientos de decremento (-quantityDispatched) en el ledger append-only (RN-010).
   */
  async create(
    dto: CreateDispatchHeaderDto,
    user: { id: string; email: string; role: string },
  ) {
    const trimmedInvoice = dto.invoiceNumber.trim();

    // 1. Validación previa: Unicidad del número de factura / remisión (FA-02)
    const existingInvoice = await this.prisma.dispatchHeader.findUnique({
      where: { invoiceNumber: trimmedInvoice },
    });

    if (existingInvoice) {
      throw new ConflictException({
        code: 'INVOICE_NUMBER_ALREADY_EXISTS',
        message: `El número de factura '${trimmedInvoice}' ya se encuentra registrado`,
      });
    }

    // 2. Validación de existencia del centro cliente de entrega
    const clientCenter = await this.prisma.clientCenter.findUnique({
      where: { id: dto.clientCenterId },
    });

    if (!clientCenter) {
      throw new NotFoundException({
        code: 'CLIENT_CENTER_NOT_FOUND',
        message: `El centro cliente con ID '${dto.clientCenterId}' no existe en el catálogo`,
      });
    }

    if (!clientCenter.isActive) {
      throw new BadRequestException({
        code: 'CLIENT_CENTER_INACTIVE',
        message: `El centro cliente '${clientCenter.name}' se encuentra inactivo`,
      });
    }

    // 3. Validación de productos y lotes de producción en cada línea
    const productIds = [...new Set(dto.details.map((d) => d.productId))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
    });

    const productsMap = new Map(products.map((p) => [p.id, p]));

    for (const productId of productIds) {
      if (!productsMap.has(productId)) {
        throw new NotFoundException({
          code: 'PRODUCT_NOT_FOUND',
          message: `El producto con ID '${productId}' no existe en el catálogo`,
        });
      }
    }

    const productionIds = [...new Set(dto.details.map((d) => d.dailyProductionId))];
    const dailyProductions = await this.prisma.dailyProduction.findMany({
      where: { id: { in: productionIds } },
      include: {
        productionDetails: true,
      },
    });

    const dailyProductionsMap = new Map(dailyProductions.map((dp) => [dp.id, dp]));

    for (const detail of dto.details) {
      const dp = dailyProductionsMap.get(detail.dailyProductionId);
      if (!dp) {
        throw new NotFoundException({
          code: 'DAILY_PRODUCTION_NOT_FOUND',
          message: `El lote de producción con ID '${detail.dailyProductionId}' no existe`,
        });
      }

      const hasProduct =
        dp.productionDetails && dp.productionDetails.length > 0
          ? dp.productionDetails.some((pd) => pd.productId === detail.productId)
          : (dp as any).productId === detail.productId;
      if (!hasProduct) {
        const prod = productsMap.get(detail.productId);
        throw new BadRequestException({
          code: 'PRODUCT_LOT_MISMATCH',
          message: `El lote de producción '${dp.productionLot}' no corresponde al producto '${prod?.name || detail.productId}'`,
        });
      }
    }

    // 4. Consolidación de demanda total por producto (para validación multi-línea)
    const demandedByProduct = new Map<string, number>();
    for (const detail of dto.details) {
      const current = demandedByProduct.get(detail.productId) || 0;
      demandedByProduct.set(detail.productId, current + detail.quantityDispatched);
    }

    // 5. Transacción atómica con bloqueo pesimista y control de concurrencia ACID
    // Ordenamos los IDs de producto para prevenir interbloqueos (deadlocks)
    const sortedProductIds = [...productIds].sort();

    const dispatchDateObj = new Date(dto.dispatchDate + 'T00:00:00.000Z');
    const dispatchTimeObj = this.parseTimeToDate(dto.dispatchTime);

    const createdDispatch = await this.prisma.$transaction(async (tx) => {
      // Bloqueo pesimista a nivel de fila sobre los productos involucrados
      for (const prodId of sortedProductIds) {
        await tx.$queryRaw`SELECT id FROM products WHERE id = ${prodId}::uuid FOR UPDATE`;
      }

      // Validación estricta de existencias en el ledger (RN-002)
      for (const [prodId, demandedQty] of demandedByProduct.entries()) {
        const availableStock = await this.inventoryLedgerService.getAvailableStock(
          prodId,
          tx,
        );

        if (availableStock < demandedQty) {
          const prod = productsMap.get(prodId);
          throw new BadRequestException({
            code: 'INSUFFICIENT_STOCK',
            message: `Stock insuficiente para despachar el producto '${prod?.name || prodId}'. Solicitado: ${demandedQty}, Disponible actual: ${availableStock} (RN-002)`,
          });
        }
      }

      // Inserción de la cabecera del despacho
      const header = await tx.dispatchHeader.create({
        data: {
          invoiceNumber: trimmedInvoice,
          dispatchDate: dispatchDateObj,
          dispatchTime: dispatchTimeObj,
          clientCenterId: dto.clientCenterId,
          vehicleInfo: dto.vehicleInfo?.trim() || null,
          driverName: dto.driverName?.trim() || null,
          observations: dto.observations?.trim() || null,
          status: DispatchStatus.COMPLETED,
          createdById: user.id,
        },
      });

      for (const detail of dto.details) {
        const product = productsMap.get(detail.productId)!;
        const dimensions = detail.dimensions?.trim() || product.dimensions;

        const createdDetail = await tx.dispatchDetail.create({
          data: {
            dispatchHeaderId: header.id,
            dailyProductionId: detail.dailyProductionId,
            productId: detail.productId,
            quantityDispatched: detail.quantityDispatched,
            dimensions,
            quantityReturnedAccumulated: 0,
          },
        });

        // Registro de decremento en el ledger append-only (RN-010)
        await this.inventoryLedgerService.recordMovement(
          {
            productId: detail.productId,
            movementType: MovementType.DISPATCH,
            quantity: detail.quantityDispatched,
            referenceTable: 'dispatch_details',
            referenceId: createdDetail.id,
            performedById: user.id,
          },
          tx,
        );
      }

      // Registro de auditoría técnica forense (AuditLog)
      const totalPieces = dto.details.reduce((sum, d) => sum + d.quantityDispatched, 0);
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'CREATE',
          tableName: 'dispatch_headers',
          recordId: header.id,
          newValues: JSON.stringify({
            id: header.id,
            invoiceNumber: header.invoiceNumber,
            clientCenterId: header.clientCenterId,
            clientCenterName: clientCenter.name,
            dispatchDate: dto.dispatchDate,
            dispatchTime: dto.dispatchTime,
            linesCount: dto.details.length,
            totalQuantityDispatched: totalPieces,
            vehicleInfo: header.vehicleInfo,
            driverName: header.driverName,
          }),
        },
      });

      this.logger.log(
        `✅ Despacho comercial confirmado: Factura ${header.invoiceNumber}, Destino: ${clientCenter.name}, Total piezas: ${totalPieces}`,
      );

      return header;
    });

    // 6. Retorno de la entidad completa con sus relaciones
    return this.findOne(createdDispatch.id);
  }

  /**
   * Consulta paginada y filtrada de despachos comerciales (EP-DSP-02 / UC-DSP-02).
   */
  async findAll(query: QueryDispatchDto): Promise<PaginatedDispatchResponseDto> {
    const isAll = query.limit !== undefined && Number(query.limit) === 0;
    const safePage = isAll ? 1 : Math.max(1, Number(query.page) || 1);
    const safeLimit = isAll ? undefined : Math.min(100, Math.max(1, Number(query.limit) || 10));
    const skip = isAll ? undefined : (safePage - 1) * (safeLimit as number);
    const take = safeLimit;

    const where: any = {};

    if (query.clientCenterId) {
      where.clientCenterId = query.clientCenterId;
    }

    if (query.invoiceNumber) {
      where.invoiceNumber = {
        contains: query.invoiceNumber.trim(),
        mode: 'insensitive',
      };
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.productId) {
      where.dispatchDetails = {
        some: {
          productId: query.productId,
        },
      };
    }

    if (query.startDate || query.endDate) {
      where.dispatchDate = {};
      if (query.startDate) {
        where.dispatchDate.gte = new Date(query.startDate + 'T00:00:00.000Z');
      }
      if (query.endDate) {
        where.dispatchDate.lte = new Date(query.endDate + 'T23:59:59.999Z');
      }
    }

    const [total, dispatches] = await Promise.all([
      this.prisma.dispatchHeader.count({ where }),
      this.prisma.dispatchHeader.findMany({
        where,
        skip,
        take,
        orderBy: [{ dispatchDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        include: {
          clientCenter: {
            select: {
              id: true,
              name: true,
              location: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
          dispatchDetails: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  dimensions: true,
                },
              },
              dailyProduction: {
                select: {
                  id: true,
                  productionLot: true,
                  productionDate: true,
                },
              },
            },
          },
          returnHeaders: {
            select: {
              id: true,
              returnDate: true,
              returnType: true,
              reason: true,
            },
          },
        },
      }),
    ]);

    const totalPages = isAll ? 1 : Math.ceil(total / (safeLimit as number)) || 1;

    return {
      success: true,
      data: dispatches as any,
      meta: {
        total,
        page: safePage,
        limit: isAll ? total : (safeLimit as number),
        totalPages,
      },
    };
  }

  /**
   * Obtiene el detalle inmutable de un despacho por ID (EP-DSP-03).
   */
  async findOne(id: string) {
    const dispatch = await this.prisma.dispatchHeader.findUnique({
      where: { id },
      include: {
        clientCenter: {
          select: {
            id: true,
            name: true,
            location: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        dispatchDetails: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                dimensions: true,
              },
            },
            dailyProduction: {
              select: {
                id: true,
                productionLot: true,
                productionDate: true,
              },
            },
          },
        },
        returnHeaders: {
          include: {
            registeredBy: {
              select: {
                id: true,
                fullName: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!dispatch) {
      throw new NotFoundException({
        code: 'DISPATCH_NOT_FOUND',
        message: `Despacho comercial con ID '${id}' no encontrado`,
      });
    }

    return {
      success: true,
      data: dispatch,
    };
  }

  /**
   * Retrieves context, lines, returns, and inventory availability prior to editing a dispatch.
   */
  async getCorrectionContext(id: string) {
    const dispatch = await this.prisma.dispatchHeader.findUnique({
      where: { id },
      include: {
        clientCenter: true,
        dispatchDetails: {
          include: {
            product: true,
            dailyProduction: {
              select: { id: true, productionLot: true },
            },
          },
          orderBy: { dimensions: 'asc' },
        },
      },
    });

    if (!dispatch) {
      throw new NotFoundException({
        code: 'DISPATCH_NOT_FOUND',
        message: `Despacho comercial con ID '${id}' no encontrado`,
      });
    }

    if (dispatch.status === DispatchStatus.RETURNED_TOTAL) {
      throw new BadRequestException({
        code: 'RETURNED_TOTAL_NOT_CORRECTABLE',
        message: 'Un despacho con devolución total no permite corrección de cantidades.',
      });
    }

    const lines = await Promise.all(
      dispatch.dispatchDetails.map(async (d) => {
        const availableStock = await this.inventoryLedgerService.getAvailableStock(
          d.productId,
        );

        return {
          lineId: d.id,
          productId: d.productId,
          productName: d.product.name,
          dimensions: d.dimensions,
          productionLot: d.dailyProduction.productionLot,
          currentQuantityDispatched: d.quantityDispatched,
          quantityReturnedAccumulated: d.quantityReturnedAccumulated,
          minimumAllowedQuantity: Math.max(1, d.quantityReturnedAccumulated),
          availableStock,
        };
      }),
    );

    const activeProducts = await this.prisma.product.findMany({
      where: { isActive: true },
      select: { id: true, name: true, dimensions: true },
      orderBy: { dimensions: 'asc' },
    });

    const products = await Promise.all(
      activeProducts.map(async (p) => ({
        id: p.id,
        name: p.name,
        dimensions: p.dimensions,
        availableStock: await this.inventoryLedgerService.getAvailableStock(p.id),
      })),
    );

    return {
      success: true,
      data: {
        id: dispatch.id,
        invoiceNumber: dispatch.invoiceNumber,
        dispatchDate: dispatch.dispatchDate,
        clientCenterName: dispatch.clientCenter.name,
        status: dispatch.status,
        products,
        lines,
      },
    };
  }

  /**
   * Executes an atomic, auditable quantity correction for commercial dispatch lines.
   * Supports both quantity modifications and product (polín measure) reclassifications.
   * Validates non-negativity, minimum returned bounds, and available inventory.
   * Emits compensatory ledger movements (MovementType.CORRECTION) with signed deltas:
   *   deltaMovement = -(newQuantity - previousQuantity).
   * Generates QuantityCorrection + QuantityCorrectionItem + AuditLog.
   */
  async correctQuantity(id: string, dto: CorrectDispatchDto, userId: string) {
    // 1. Mandatory Reason Validation (10-500 chars, blacklist filtered)
    const validatedReason = validateCorrectionReason(dto.reason);

    // 2. Canonical Payload Hash Calculation
    const incomingHash = calculateCorrectionPayloadHash(
      CorrectionModule.DISPATCH,
      id,
      validatedReason,
      { type: 'DISPATCH', items: dto.items },
    );

    // 3. Idempotency Check
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
        verifyIdempotencyMatch(existing, id, incomingHash, this.logger);
        const res = await this.findOne(id);
        return {
          success: true,
          message: 'Operación idempotente: la corrección ya fue registrada previamente.',
          data: res.data,
          correction: existing,
        };
      }
    }

    // 3. Atomically execute update within database transaction
    try {
      return await this.prisma.$transaction(async (tx) => {
      // Concurrency protection: row lock on operational header to prevent race conditions
      if (typeof (tx as any).$queryRaw === 'function') {
        await tx.$queryRaw`SELECT id FROM dispatch_headers WHERE id = ${id}::uuid FOR UPDATE`;
      }

      const dispatch = await tx.dispatchHeader.findUnique({
        where: { id },
        include: {
          dispatchDetails: {
            include: { product: true },
          },
          returnHeaders: true,
        },
      });

      if (!dispatch) {
        throw new NotFoundException({
          code: 'DISPATCH_NOT_FOUND',
          message: `Despacho comercial con ID '${id}' no encontrado`,
        });
      }

      if (dispatch.status === DispatchStatus.RETURNED_TOTAL) {
        throw new BadRequestException({
          code: 'RETURNED_TOTAL_NOT_CORRECTABLE',
          message: 'Un despacho con devolución total no permite corrección de cantidades.',
        });
      }

      const detailMap = new Map(dispatch.dispatchDetails.map((d) => [d.id, d]));

      // Validate all input items exist in current dispatch
      for (const itemDto of dto.items) {
        if (!detailMap.has(itemDto.lineId)) {
          throw new BadRequestException({
            code: 'INVALID_LINE_ID',
            message: `La línea con ID '${itemDto.lineId}' no pertenece a la remisión/factura '${dispatch.invoiceNumber}'.`,
          });
        }
      }

      // Concurrency protection: Bloqueo pesimista determinístico sobre todos los productos afectados (H-03)
      const affectedProductIds = new Set<string>();
      for (const itemDto of dto.items) {
        const detail = detailMap.get(itemDto.lineId)!;
        affectedProductIds.add(detail.productId);
        if (itemDto.productId) {
          affectedProductIds.add(itemDto.productId);
        }
      }
      const sortedProductIds = [...affectedProductIds].sort();

      if (typeof (tx as any).$queryRaw === 'function') {
        for (const prodId of sortedProductIds) {
          await tx.$queryRaw`SELECT id FROM products WHERE id = ${prodId}::uuid FOR UPDATE`;
        }
      }

      const itemsToRecord: Array<{
        lineId: string;
        productId: string;
        fieldName: string;
        previous: number;
        new: number;
        delta: number;
        movementId?: string;
      }> = [];

      const productReclassifications: Array<{
        lineId: string;
        previousProductId: string;
        previousDimensions: string;
        previousQuantity: number;
        newProductId: string;
        newDimensions: string;
        newQuantity: number;
      }> = [];

      let hasActualChange = false;

      for (const itemDto of dto.items) {
        const detail = detailMap.get(itemDto.lineId)!;
        const prevQty = detail.quantityDispatched;
        const prevProductId = detail.productId;
        const newProductId =
          itemDto.productId && itemDto.productId !== prevProductId
            ? itemDto.productId
            : prevProductId;
        const isProductChange = newProductId !== prevProductId;
        const newQty = itemDto.quantity;
        const delta = newQty - prevQty; // delta dispatch

        if (!isProductChange && delta === 0) {
          continue;
        }

        hasActualChange = true;

        if (isProductChange) {
          // Validate new target product exists and is active
          const newProduct = await tx.product.findUnique({
            where: { id: newProductId },
          });
          if (!newProduct || !newProduct.isActive) {
            throw new BadRequestException({
              code: 'PRODUCT_NOT_FOUND',
              message: `El producto de destino con ID '${newProductId}' no existe o no está activo en el catálogo.`,
            });
          }

          // A. Returns Boundary on old product: cannot change product if commercial returns exist
          if (detail.quantityReturnedAccumulated > 0) {
            throw new BadRequestException({
              code: 'CANNOT_CHANGE_PRODUCT_WITH_RETURNS',
              message: `No se puede modificar el producto de la línea (${detail.dimensions}) en la factura ${dispatch.invoiceNumber} porque cuenta con ${detail.quantityReturnedAccumulated} piezas en devoluciones comerciales históricas registradas.`,
            });
          }

          // B. Stock Availability for new target product: patio must have sufficient stock to dispatch newQty
          const availableStockNew = await this.inventoryLedgerService.getAvailableStock(
            newProductId,
            tx,
          );
          if (availableStockNew < newQty) {
            throw new BadRequestException({
              code: 'INSUFFICIENT_STOCK',
              message: `Stock insuficiente en almacén para despachar ${newQty} piezas de ${newProduct.dimensions}. Stock disponible actual: ${availableStockNew}.`,
            });
          }

          // Compensatory Movement 1: Restitute old product to inventory (+prevQty)
          const movementRestitution = await tx.inventoryMovement.create({
            data: {
              productId: prevProductId,
              movementType: MovementType.CORRECTION,
              deltaQuantity: prevQty, // +prevQty restores stock to warehouse
              referenceTable: 'dispatch_headers',
              referenceId: dispatch.id,
              performedById: userId,
              metadata: {
                lineId: detail.id,
                invoiceNumber: dispatch.invoiceNumber,
                action: 'PRODUCT_RECLASSIFICATION_RESTITUTION',
                previousProductId: prevProductId,
                previousDimensions: detail.dimensions,
                newProductId: newProductId,
                newDimensions: newProduct.dimensions,
                previousQuantity: prevQty,
                newQuantity: 0,
                reason: validatedReason,
              },
            },
          });

          // Compensatory Movement 2: Deduct new product from inventory (-newQty)
          const movementDeduction = await tx.inventoryMovement.create({
            data: {
              productId: newProductId,
              movementType: MovementType.CORRECTION,
              deltaQuantity: -newQty, // -newQty deducts stock from warehouse
              referenceTable: 'dispatch_headers',
              referenceId: dispatch.id,
              performedById: userId,
              metadata: {
                lineId: detail.id,
                invoiceNumber: dispatch.invoiceNumber,
                action: 'PRODUCT_RECLASSIFICATION_DEDUCTION',
                previousProductId: prevProductId,
                previousDimensions: detail.dimensions,
                newProductId: newProductId,
                newDimensions: newProduct.dimensions,
                previousQuantity: 0,
                newQuantity: newQty,
                reason: validatedReason,
              },
            },
          });

          // Update dispatchDetail line with new product, dimensions, and quantity
          await tx.dispatchDetail.update({
            where: { id: detail.id },
            data: {
              productId: newProductId,
              dimensions: newProduct.dimensions,
              quantityDispatched: newQty,
            },
          });

          // Audit records: 2 atomic items (restitution to old product, deduction from new product)
          itemsToRecord.push(
            {
              lineId: detail.id,
              productId: prevProductId,
              fieldName: 'product_reclassification_out',
              previous: prevQty,
              new: 0,
              delta: prevQty, // inventory stock impact: +prevQty
              movementId: movementRestitution.id,
            },
            {
              lineId: detail.id,
              productId: newProductId,
              fieldName: 'product_reclassification_in',
              previous: 0,
              new: newQty,
              delta: -newQty, // inventory stock impact: -newQty
              movementId: movementDeduction.id,
            },
          );

          productReclassifications.push({
            lineId: detail.id,
            previousProductId: prevProductId,
            previousDimensions: detail.dimensions,
            previousQuantity: prevQty,
            newProductId,
            newDimensions: newProduct.dimensions,
            newQuantity: newQty,
          });
        } else {
          // Standard quantity adjustment on same product
          // A. Returns Boundary: cannot be lower than already accumulated returns
          if (newQty < detail.quantityReturnedAccumulated) {
            throw new BadRequestException({
              code: 'CANNOT_REDUCE_BELOW_RETURNS',
              message: `No se puede corregir la cantidad despachada a ${newQty} piezas para ${detail.dimensions} en la factura ${dispatch.invoiceNumber}. Ya existen ${detail.quantityReturnedAccumulated} piezas devueltas asociadas a esta línea.`,
            });
          }

          // B. Stock Availability: if increasing dispatch, ensure warehouse has stock
          if (delta > 0) {
            const currentStock = await this.inventoryLedgerService.getAvailableStock(
              detail.productId,
              tx,
            );
            if (currentStock < delta) {
              throw new BadRequestException({
                code: 'INSUFFICIENT_STOCK',
                message: `Stock insuficiente en almacén para despachar ${delta} piezas adicionales de ${detail.dimensions}. Stock disponible actual: ${currentStock}.`,
              });
            }
          }

          // Compensatory ledger delta: if dispatch increased (+delta), stock decreases (-delta)
          // If dispatch decreased (-delta), stock increases (+delta)
          const deltaMovement = -delta;

          const movement = await tx.inventoryMovement.create({
            data: {
              productId: detail.productId,
              movementType: MovementType.CORRECTION,
              deltaQuantity: deltaMovement,
              referenceTable: 'dispatch_headers',
              referenceId: dispatch.id,
              performedById: userId,
              metadata: {
                lineId: detail.id,
                invoiceNumber: dispatch.invoiceNumber,
                previousQuantity: prevQty,
                newQuantity: newQty,
                reason: validatedReason,
              },
            },
          });

          // Update dispatch detail line
          await tx.dispatchDetail.update({
            where: { id: detail.id },
            data: { quantityDispatched: newQty },
          });

          itemsToRecord.push({
            lineId: detail.id,
            productId: detail.productId,
            fieldName: 'quantityDispatched',
            previous: prevQty,
            new: newQty,
            delta,
            movementId: movement.id,
          });
        }
      }

      if (!hasActualChange) {
        if (dto.idempotencyKey) {
          const existing = await tx.quantityCorrection.findUnique({
            where: { idempotencyKey: dto.idempotencyKey },
            include: {
              items: true,
              correctedBy: {
                select: { id: true, fullName: true, email: true, role: true },
              },
            },
          });
          if (existing) {
            verifyIdempotencyMatch(existing, id, incomingHash, this.logger);
            return {
              success: true,
              message:
                'Operación idempotente: la corrección ya fue registrada previamente.',
              data: {
                id: dispatch.id,
                invoiceNumber: dispatch.invoiceNumber,
              },
              correction: existing,
            };
          }
        }
        throw new BadRequestException({
          code: 'NO_CHANGES_DETECTED',
          message:
            'Las cantidades y medidas ingresadas son idénticas a las registradas actualmente. No se detectaron cambios.',
        });
      }

      // Append-only QuantityCorrection record
      const correction = await tx.quantityCorrection.create({
        data: {
          module: CorrectionModule.DISPATCH,
          recordId: dispatch.id,
          recordCode: dispatch.invoiceNumber,
          reason: validatedReason,
          correctedById: userId,
          idempotencyKey: dto.idempotencyKey || null,
          payloadHash: dto.idempotencyKey ? incomingHash : null,
          metadata: {
            linesModifiedCount: itemsToRecord.length,
            productReclassifications:
              productReclassifications.length > 0 ? productReclassifications : undefined,
          },
          items: {
            create: itemsToRecord.map((item) => ({
              lineId: item.lineId,
              fieldName: item.fieldName,
              productId: item.productId,
              previousQuantity: new Prisma.Decimal(item.previous),
              newQuantity: new Prisma.Decimal(item.new),
              deltaQuantity: new Prisma.Decimal(item.delta),
              inventoryMovementId: item.movementId || null,
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

      // Append-only AuditLog record
      await tx.auditLog.create({
        data: {
          tableName: 'dispatch_headers',
          recordId: dispatch.id,
          action: 'CORRECTION',
          oldValues: {
            lines: itemsToRecord.map((i) => ({
              lineId: i.lineId,
              productId: i.productId,
              quantity: i.previous,
            })),
          },
          newValues: {
            lines: itemsToRecord.map((i) => ({
              lineId: i.lineId,
              productId: i.productId,
              quantity: i.new,
              delta: i.delta,
            })),
          },
          correctionReason: validatedReason,
          userId,
        },
      });

      this.logger.log(
        `[Dispatch] Corrección completada: ID=${dispatch.id}, Factura=${dispatch.invoiceNumber}, Items=${itemsToRecord.length}, User=${userId}`,
      );

      return {
        success: true,
        data: {
          id: dispatch.id,
          invoiceNumber: dispatch.invoiceNumber,
        },
        correction,
      };
    });
    } catch (error) {
      if (
        dto.idempotencyKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const metaTarget = error.meta?.target;
        const targetList = Array.isArray(metaTarget)
          ? (metaTarget as string[])
          : typeof metaTarget === 'string'
            ? [metaTarget]
            : [];

        const isExplicitlyOther = targetList.some(
          (t) =>
            t !== '(not available)' &&
            !t.toLowerCase().includes('idempotency') &&
            !t.toLowerCase().includes('quantity_correction'),
        );

        if (!isExplicitlyOther) {
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
            verifyIdempotencyMatch(existing, id, incomingHash, this.logger);
            const res = await this.findOne(id);
            return {
              success: true,
              message:
                'Operación idempotente: la corrección ya fue registrada previamente.',
              data: res.data,
              correction: existing,
            };
          }
        }
      }
      throw error;
    }
  }

  /**
   * Retrieves read-only historical list of quantity corrections for a given dispatch header.
   */
  async getCorrections(id: string) {
    const corrections = await this.prisma.quantityCorrection.findMany({
      where: {
        module: CorrectionModule.DISPATCH,
        recordId: id,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, dimensions: true } },
          },
        },
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
