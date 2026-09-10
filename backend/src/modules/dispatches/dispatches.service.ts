import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DispatchStatus, MovementType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { InventoryLedgerService } from '../inventory/inventory-ledger.service';
import { CreateDispatchHeaderDto } from './dto/create-dispatch.dto';
import { QueryDispatchDto } from './dto/query-dispatch.dto';
import { PaginatedDispatchResponseDto } from './dto/dispatch-response.dto';

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
    const page = Math.max(1, query.page || 1);
    const limit = query.limit !== undefined ? Number(query.limit) : 10;
    const isAll = limit === 0 || limit >= 10000;
    const skip = isAll ? undefined : (page - 1) * limit;
    const take = isAll ? undefined : limit;

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

    const totalPages = isAll ? 1 : Math.ceil(total / limit) || 1;

    return {
      success: true,
      data: dispatches as any,
      meta: {
        total,
        page: isAll ? 1 : page,
        limit: isAll ? total : limit,
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
}
