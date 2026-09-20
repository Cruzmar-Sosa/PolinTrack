import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MovementType, Prisma, ReturnDestination } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateMovementInput } from './dto/create-movement-input.dto';
import { QueryKardexDto } from './dto/query-kardex.dto';
import { ProductStockDto } from './dto/stock-balance-response.dto';

@Injectable()
export class InventoryLedgerService {
  private readonly logger = new Logger(InventoryLedgerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Append-Only Ledger Entry Creation.
   * Centralizes all physical inventory variations across the system.
   * Ensures mathematical consistency, stock sufficiency (RN-002), and strict non-destructive storage (RN-001).
   *
   * @param input Movement parameters
   * @param tx Optional Prisma transaction client for atomic execution with caller modules
   */
  async recordMovement(
    input: CreateMovementInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    const {
      productId,
      movementType,
      quantity,
      referenceTable,
      referenceId,
      performedById,
      isAdjustmentDecrement,
    } = input;

    // 1. Validation: Quantity must be an integer (positive or zero for DESECHO returns)
    if (!Number.isInteger(quantity) || quantity < 0 || (quantity === 0 && (movementType !== MovementType.RETURN || input.destination !== ReturnDestination.DESECHO))) {
      throw new BadRequestException({
        code: 'INVALID_QUANTITY',
        message: 'La cantidad del movimiento debe ser un número entero positivo mayor a cero',
      });
    }

    // 2. Validation: Product existence
    const product = await client.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Producto con identificador '${productId}' no existe en el catálogo`,
      });
    }

    // 3. Validation: Performer existence
    const user = await client.user.findUnique({
      where: { id: performedById },
    });

    if (!user) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Usuario ejecutante con ID '${performedById}' no encontrado`,
      });
    }

    // 4. Calculate signed deltaQuantity according to movementType (RN-010, D-017, RN-010-B)
    let deltaQuantity: number;

    switch (movementType) {
      case MovementType.PRODUCTION:
        // Daily Production increments finished product stock (+N)
        deltaQuantity = Math.abs(quantity);
        break;

      case MovementType.DISPATCH: {
        // Dispatch decrements finished product stock (-N)
        // Strict availability verification: requested <= availableStock (RN-002)
        const currentStock = await this.getAvailableStock(productId, client);
        if (currentStock < quantity) {
          throw new BadRequestException({
            code: 'INSUFFICIENT_STOCK',
            message: `Stock insuficiente para despachar. Solicitado: ${quantity}, Disponible actual: ${currentStock} (RN-002)`,
          });
        }
        deltaQuantity = -Math.abs(quantity);
        break;
      }

      case MovementType.RETURN:
        // Customer return (RN-010-B, RN-013-B):
        // REPROCESO: Reincorporates finished product stock (+N)
        // DESECHO: Scrap / discarded pieces. Zero delta in operational stock (delta = 0)
        if (input.destination === ReturnDestination.DESECHO) {
          deltaQuantity = 0;
        } else {
          deltaQuantity = Math.abs(quantity);
        }
        break;

      case MovementType.ADJUSTMENT: {
        // Admin adjustment can increment or decrement (+/-N, RN-004A, D-028)
        const isDecrement = isAdjustmentDecrement ?? false;
        deltaQuantity = isDecrement ? -Math.abs(quantity) : Math.abs(quantity);

        if (isDecrement) {
          const currentStock = await this.getAvailableStock(productId, client);
          if (currentStock < Math.abs(deltaQuantity)) {
            throw new BadRequestException({
              code: 'INSUFFICIENT_STOCK',
              message: `El decremento por ajuste (${Math.abs(deltaQuantity)}) no puede exceder el stock disponible actual (${currentStock}) (RN-004A)`,
            });
          }
        }
        break;
      }

      default:
        throw new BadRequestException({
          code: 'INVALID_MOVEMENT_TYPE',
          message: `Tipo de movimiento '${movementType}' no reconocido en el ledger`,
        });
    }

    // 5. Append-only insertion into inventory_movements
    const destination = input.destination ?? (movementType === MovementType.RETURN ? ReturnDestination.REPROCESO : null);
    const metadata = input.metadata ?? (input.destination === ReturnDestination.DESECHO ? { destination: 'DESECHO', discardedPieces: quantity } : undefined);

    const movement = await client.inventoryMovement.create({
      data: {
        productId,
        movementType,
        deltaQuantity,
        referenceTable,
        referenceId,
        performedById,
        destination,
        metadata,
      },
    });

    this.logger.log(
      `[Ledger] Movimiento registrado: ID=${movement.id}, Producto=${product.dimensions}, Tipo=${movementType}, Delta=${deltaQuantity}, Destino=${destination ?? 'N/A'}, Ref=${referenceTable}:${referenceId}`,
    );

    return movement;
  }

  /**
   * Deterministically computes the current available stock for a single product by summing all ledger deltas.
   * RN-010: Stock = Sum(delta_quantity)
   *
   * @param productId Finished product UUID
   * @param tx Optional transaction client
   */
  async getAvailableStock(
    productId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx || this.prisma;
    const aggregate = await client.inventoryMovement.aggregate({
      where: { productId },
      _sum: { deltaQuantity: true },
    });

    return aggregate._sum.deltaQuantity ?? 0;
  }

  /**
   * Computes the consolidated stock balance breakdown for all catalog products (or a single one).
   * Implements EP-INV-01 (RN-010-B, UC-INV-01).
   *
   * @param productId Optional filter for a specific product
   */
  async getStockBalance(productId?: string): Promise<ProductStockDto[]> {
    const products = await this.prisma.product.findMany({
      where: productId ? { id: productId } : undefined,
      orderBy: { dimensions: 'asc' },
    });

    const [movementGroups, returnGroups] = await Promise.all([
      this.prisma.inventoryMovement.groupBy({
        by: ['productId', 'movementType'],
        where: productId ? { productId } : undefined,
        _sum: { deltaQuantity: true },
      }),
      this.prisma.returnDetail.groupBy({
        by: ['productId', 'destination'],
        where: productId ? { productId } : undefined,
        _sum: { quantityReturned: true },
      }),
    ]);

    // Map aggregation groups by productId and movementType
    const movementMap = new Map<string, Map<MovementType, number>>();
    for (const group of movementGroups) {
      if (!movementMap.has(group.productId)) {
        movementMap.set(group.productId, new Map<MovementType, number>());
      }
      movementMap
        .get(group.productId)!
        .set(group.movementType, group._sum.deltaQuantity ?? 0);
    }

    // Map return groups by productId and destination
    const returnBreakdownMap = new Map<string, { rework: number; scrap: number }>();
    for (const rg of returnGroups) {
      if (!returnBreakdownMap.has(rg.productId)) {
        returnBreakdownMap.set(rg.productId, { rework: 0, scrap: 0 });
      }
      const item = returnBreakdownMap.get(rg.productId)!;
      if (rg.destination === ReturnDestination.DESECHO) {
        item.scrap += rg._sum.quantityReturned ?? 0;
      } else {
        item.rework += rg._sum.quantityReturned ?? 0;
      }
    }

    const result: ProductStockDto[] = products.map((prod) => {
      const prodMovements = movementMap.get(prod.id);
      const produced = prodMovements?.get(MovementType.PRODUCTION) ?? 0;
      const dispatchedRaw = prodMovements?.get(MovementType.DISPATCH) ?? 0;
      const dispatched = Math.abs(dispatchedRaw);
      const returnedReworkLedger = prodMovements?.get(MovementType.RETURN) ?? 0;
      const adjustment = prodMovements?.get(MovementType.ADJUSTMENT) ?? 0;

      const returnBreakdown = returnBreakdownMap.get(prod.id) ?? { rework: 0, scrap: 0 };
      const totalReturnedRework = returnBreakdown.rework || returnedReworkLedger;
      const totalReturnedScrap = returnBreakdown.scrap;
      const totalReturned = totalReturnedRework + totalReturnedScrap;

      // Available stock = sum of all signed deltas: Produced - Dispatched + Reproceso ± Adjustments (RN-010-B)
      const availableStock = produced - dispatched + returnedReworkLedger + adjustment;

      return {
        productId: prod.id,
        productName: prod.name,
        dimensions: prod.dimensions,
        producedQuantity: produced,
        totalProduced: produced,
        dispatchedQuantity: dispatched,
        totalDispatched: dispatched,
        returnedQuantity: returnedReworkLedger,
        totalReturnedRework,
        totalReturnedScrap,
        totalReturned,
        adjustmentNetQuantity: adjustment,
        netAdjustments: adjustment,
        availableStock,
      };
    });

    return result;
  }

  /**
   * Retrieves paginated Kardex historical movements.
   * Read-only audit log of physical variations. Implements EP-INV-02 (UC-INV-01).
   *
   * @param query Filters for product, movementType, date range, pagination
   */
  async getKardexMovements(query: QueryKardexDto) {
    const { productId, movementType, startDate, endDate, page = 1, limit = 10 } =
      query;
    const isAll = limit === 0 || limit >= 10000;
    const skip = isAll ? undefined : (page - 1) * limit;
    const take = isAll ? undefined : limit;

    const where: Prisma.InventoryMovementWhereInput = {};

    if (productId) {
      where.productId = productId;
    }

    if (movementType) {
      where.movementType = movementType;
    }

    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) {
        where.timestamp.gte = new Date(`${startDate}T00:00:00.000Z`);
      }
      if (endDate) {
        where.timestamp.lte = new Date(`${endDate}T23:59:59.999Z`);
      }
    }

    const [total, movements] = await Promise.all([
      this.prisma.inventoryMovement.count({ where }),
      this.prisma.inventoryMovement.findMany({
        where,
        skip,
        take,
        orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
        include: {
          product: {
            select: {
              name: true,
              dimensions: true,
            },
          },
          performedBy: {
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
      data: movements,
      meta: {
        total,
        page: isAll ? 1 : page,
        limit: isAll ? total : limit,
        totalPages,
      },
    };
  }
}
