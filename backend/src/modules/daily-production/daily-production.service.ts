import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MovementType, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { InventoryLedgerService } from '../inventory/inventory-ledger.service';
import {
  CreateDailyProductionDto,
  ProductionProductItemDto,
} from './dto/create-daily-production.dto';
import { QueryDailyProductionDto } from './dto/query-daily-production.dto';
import { getISOWeek } from './utils/iso-week.util';

@Injectable()
export class DailyProductionService {
  private readonly logger = new Logger(DailyProductionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryLedgerService: InventoryLedgerService,
  ) {}

  /**
   * Generates the canonical operational production lot number LT-DDMMYY-WXX (RN-009, D-019, TSK-20.3).
   *
   * Format: LT-DDMMYY-WXX where:
   *   - DDMMYY = production date
   *   - W      = week indicator
   *   - XX     = ISO 8601 week number (zero-padded, auto-calculated)
   *
   * Note (TSK-20.3): productionLot is an operational day/week label, NOT a database unique key.
   * Multiple production records on the same day share the same canonical lot format without collision.
   * No sequential suffixes (-01, -02, etc.) are generated.
   *
   * @param productionDateStr Date formatted as YYYY-MM-DD
   * @param _tx Optional transaction client preserved for signature backwards-compatibility
   */
  async generateProductionLot(
    productionDateStr: string,
    _tx?: Prisma.TransactionClient,
  ): Promise<{ productionLot: string; isoWeek: number }> {
    const { isoWeek } = getISOWeek(productionDateStr);

    const [year, month, day] = productionDateStr.split('-');
    const shortYear = year.slice(2);
    const weekStr = String(isoWeek).padStart(2, '0');
    const productionLot = `LT-${day}${month}${shortYear}-W${weekStr}`;

    return { productionLot, isoWeek };
  }

  /**
   * Registers a daily finished product production order (UC-PRD-01).
   * Supports multiple products in a single header (TSK-20.2).
   *
   * Atomic transactional boundary:
   * 1. Inserts daily_productions header.
   * 2. Inserts production_details for each product produced.
   * 3. Inserts production_wood_receipts (M:N referential link without merma D-023).
   * 4. Increments finished product stock in append-only ledger for each product (RN-010, TSK-07).
   * 5. Records AuditLog entry.
   *
   * @param dto Creation parameters
   * @param userId Authenticated user UUID from JWT
   */
  async create(dto: CreateDailyProductionDto, userId: string) {
    // 1. Normalize items list (supports new array format and legacy single-product format)
    let items: ProductionProductItemDto[] = dto.products || [];
    if (items.length === 0 && dto.productId && dto.quantityProduced) {
      items = [
        {
          productId: dto.productId,
          quantityProduced: dto.quantityProduced,
        },
      ];
    }

    if (items.length === 0) {
      throw new BadRequestException({
        code: 'MISSING_PRODUCTS',
        message:
          'Debe incluir al menos un producto terminado con su cantidad producida',
      });
    }

    // 2. Validate quantities strictly positive (FA-01)
    for (const item of items) {
      if (
        !item.quantityProduced ||
        !Number.isInteger(item.quantityProduced) ||
        item.quantityProduced <= 0
      ) {
        throw new BadRequestException({
          code: 'INVALID_QUANTITY',
          message:
            'La cantidad producida debe ser un número entero mayor a cero piezas (FA-01)',
        });
      }
    }

    // 3. Validate no duplicate products in same daily production
    const uniqueProductIds = new Set(items.map((i) => i.productId));
    if (uniqueProductIds.size !== items.length) {
      throw new BadRequestException({
        code: 'DUPLICATE_PRODUCT_IN_PRODUCTION',
        message:
          'No se permiten productos duplicados dentro de la misma jornada de producción',
      });
    }

    // 4. Validate date is not in the future
    const todayStr = new Date().toISOString().split('T')[0];
    if (dto.productionDate > todayStr) {
      throw new BadRequestException({
        code: 'FUTURE_DATE_NOT_ALLOWED',
        message: 'La fecha de producción no puede ser posterior al día de hoy',
      });
    }

    // 5. Validate products existence in master catalog
    const products = await this.prisma.product.findMany({
      where: {
        id: { in: Array.from(uniqueProductIds) },
        isActive: true,
      },
      select: { id: true, name: true, dimensions: true },
    });

    if (products.length !== uniqueProductIds.size) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message:
          'Uno o más productos terminados seleccionados no existen o están inactivos en el catálogo',
      });
    }

    const productsMap = new Map(products.map((p) => [p.id, p]));

    // 6. Validate wood receipts exist if specified (Traceability M:N)
    if (dto.woodReceiptIds && dto.woodReceiptIds.length > 0) {
      const existingWood = await this.prisma.woodReceipt.findMany({
        where: { id: { in: dto.woodReceiptIds } },
        select: { id: true },
      });

      if (existingWood.length !== dto.woodReceiptIds.length) {
        throw new NotFoundException({
          code: 'RESOURCE_NOT_FOUND',
          message:
            'Uno o más lotes de madera de materia prima seleccionados no existen en el patio',
        });
      }
    }

    // 7. Atomic transaction boundary (ACID)
    return await this.prisma.$transaction(async (tx) => {
      const { productionLot, isoWeek } =
        await this.generateProductionLot(dto.productionDate, tx);

      const productionDateObj = new Date(
        `${dto.productionDate}T00:00:00.000Z`,
      );

      // Step A: Insert into daily_productions header
      const primaryProduct = items[0];
      const totalQuantity = items.reduce(
        (sum, item) => sum + item.quantityProduced,
        0,
      );

      const dailyProduction = await tx.dailyProduction.create({
        data: {
          productionLot,
          productionDate: productionDateObj,
          isoWeek,
          productId: primaryProduct.productId,
          quantityProduced: totalQuantity,
          createdById: userId,
        },
        include: {
          createdBy: {
            select: { id: true, fullName: true, email: true },
          },
        },
      });

      // Step B: Insert into production_details (Header-Detail structure)
      await tx.productionDetail.createMany({
        data: items.map((item) => ({
          dailyProductionId: dailyProduction.id,
          productId: item.productId,
          quantityProduced: item.quantityProduced,
        })),
      });

      // Step C: Insert M:N referential wood receipt links (without merma, D-023, RN-015)
      if (dto.woodReceiptIds && dto.woodReceiptIds.length > 0) {
        await tx.productionWoodReceipt.createMany({
          data: dto.woodReceiptIds.map((woodReceiptId) => ({
            dailyProductionId: dailyProduction.id,
            woodReceiptId,
          })),
          skipDuplicates: true,
        });
      }

      // Step D: Atomically record movement in append-only Inventory Ledger for EACH product (RN-010)
      for (const item of items) {
        await this.inventoryLedgerService.recordMovement(
          {
            productId: item.productId,
            movementType: MovementType.PRODUCTION,
            quantity: item.quantityProduced,
            referenceTable: 'daily_productions',
            referenceId: dailyProduction.id,
            performedById: userId,
          },
          tx,
        );
      }

      // Step E: Record technical AuditLog
      await tx.auditLog.create({
        data: {
          tableName: 'daily_productions',
          recordId: dailyProduction.id,
          action: 'INSERT',
          newValues: {
            productionLot: dailyProduction.productionLot,
            isoWeek: dailyProduction.isoWeek,
            productsCount: items.length,
            totalQuantityProduced: totalQuantity,
            woodReceiptsLinked: dto.woodReceiptIds?.length || 0,
            products: items.map((i) => ({
              productId: i.productId,
              dimensions: productsMap.get(i.productId)?.dimensions,
              quantityProduced: i.quantityProduced,
            })),
          },
          userId,
        },
      });

      // Step F: Query resulting details with product information and stock balances
      const createdDetails = await tx.productionDetail.findMany({
        where: { dailyProductionId: dailyProduction.id },
        include: {
          product: {
            select: { id: true, name: true, dimensions: true },
          },
        },
      });

      const detailsWithStock = await Promise.all(
        createdDetails.map(async (d) => ({
          id: d.id,
          productId: d.productId,
          product: d.product,
          quantityProduced: d.quantityProduced,
          availableStock:
            await this.inventoryLedgerService.getAvailableStock(
              d.productId,
              tx,
            ),
        })),
      );

      this.logger.log(
        `[DailyProduction] Producción registrada: Lote=${dailyProduction.productionLot}, Productos=${items.length}, TotalPiezas=+${totalQuantity}`,
      );

      return {
        ...dailyProduction,
        productionDetails: detailsWithStock,
        totalQuantityProduced: totalQuantity,
        // Backwards-compatibility properties
        productId: detailsWithStock[0]?.productId,
        product: detailsWithStock[0]?.product,
        quantityProduced: detailsWithStock[0]?.quantityProduced,
        availableStock: detailsWithStock[0]?.availableStock,
      };
    });
  }

  /**
   * Retrieves paginated list of daily productions with filters (UC-PRD-02).
   * Validates date range startDate <= endDate (RN-007).
   */
  async findAll(query: QueryDailyProductionDto) {
    const { startDate, endDate, productId, isoWeek, page = 1, limit = 10 } =
      query;

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
    const where: Prisma.DailyProductionWhereInput = {};

    if (productId) {
      where.productionDetails = {
        some: { productId },
      };
    }

    if (isoWeek) {
      where.isoWeek = isoWeek;
    }

    if (startDate || endDate) {
      where.productionDate = {};
      if (startDate) {
        where.productionDate.gte = new Date(`${startDate}T00:00:00.000Z`);
      }
      if (endDate) {
        where.productionDate.lte = new Date(`${endDate}T23:59:59.999Z`);
      }
    }

    const [total, items] = await Promise.all([
      this.prisma.dailyProduction.count({ where }),
      this.prisma.dailyProduction.findMany({
        where,
        skip,
        take,
        orderBy: [{ productionDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        include: {
          createdBy: {
            select: { id: true, fullName: true, email: true },
          },
          productionDetails: {
            include: {
              product: {
                select: { id: true, name: true, dimensions: true },
              },
            },
          },
          productionWoodReceipts: {
            include: {
              woodReceipt: {
                select: {
                  id: true,
                  lotNumber: true,
                  quantity: true,
                  unit: true,
                  supplier: { select: { name: true } },
                },
              },
            },
          },
          fumigations: {
            select: { id: true, certificateNumber: true, fumigationDate: true },
          },
        },
      }),
    ]);

    const totalPages = isAll ? 1 : Math.ceil(total / limit) || 1;

    const formattedData = items.map((item) => {
      const details = (item.productionDetails || []).map((pd) => ({
        id: pd.id,
        productId: pd.productId,
        product: pd.product,
        quantityProduced: pd.quantityProduced,
      }));

      const totalQuantity = details.reduce(
        (sum, d) => sum + d.quantityProduced,
        0,
      );

      return {
        id: item.id,
        productionLot: item.productionLot,
        productionDate: item.productionDate,
        isoWeek: item.isoWeek,
        productionDetails: details,
        totalQuantityProduced: totalQuantity,
        // Compatibility properties for views
        productId: details[0]?.productId,
        product: details[0]?.product,
        quantityProduced: details[0]?.quantityProduced,
        createdById: item.createdById,
        createdBy: item.createdBy,
        createdAt: item.createdAt,
        linkedWoodReceipts: (item.productionWoodReceipts || [])
          .filter((pwr) => pwr && pwr.woodReceipt)
          .map((pwr) => ({
            id: pwr.woodReceipt.id,
            lotNumber: pwr.woodReceipt.lotNumber,
            quantity: Number(pwr.woodReceipt.quantity || 0),
            unit: pwr.woodReceipt.unit,
            supplier: pwr.woodReceipt.supplier,
          })),
        fumigationsCount: item.fumigations?.length ?? 0,
      };
    });

    return {
      success: true,
      data: formattedData,
      meta: {
        total,
        page: isAll ? 1 : page,
        limit: isAll ? total : limit,
        totalPages,
      },
    };
  }

  /**
   * Retrieves single production order file with traceability tree (UC-PRD-02).
   */
  async findOne(id: string) {
    const item = await this.prisma.dailyProduction.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: { id: true, fullName: true, email: true },
        },
        productionDetails: {
          include: {
            product: {
              select: { id: true, name: true, dimensions: true },
            },
          },
        },
        productionWoodReceipts: {
          include: {
            woodReceipt: {
              select: {
                id: true,
                lotNumber: true,
                quantity: true,
                unit: true,
                receiptDate: true,
                species: { select: { name: true } },
                woodType: { select: { name: true } },
                supplier: { select: { id: true, name: true, legalId: true } },
              },
            },
          },
        },
        fumigations: {
          select: {
            id: true,
            certificateNumber: true,
            fumigationDate: true,
            fumigationTime: true,
            pdfFilePath: true,
          },
        },
      },
    });

    if (!item) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Orden de producción con ID '${id}' no encontrada`,
      });
    }

    const detailsWithStock = await Promise.all(
      (item.productionDetails || []).map(async (d) => ({
        id: d.id,
        productId: d.productId,
        product: d.product,
        quantityProduced: d.quantityProduced,
        availableStock: await this.inventoryLedgerService.getAvailableStock(
          d.productId,
        ),
      })),
    );

    const totalQuantity = detailsWithStock.reduce(
      (sum, d) => sum + d.quantityProduced,
      0,
    );

    return {
      success: true,
      data: {
        id: item.id,
        productionLot: item.productionLot,
        productionDate: item.productionDate,
        isoWeek: item.isoWeek,
        productionDetails: detailsWithStock,
        totalQuantityProduced: totalQuantity,
        // Compatibility properties
        productId: detailsWithStock[0]?.productId,
        product: detailsWithStock[0]?.product,
        quantityProduced: detailsWithStock[0]?.quantityProduced,
        availableStock: detailsWithStock[0]?.availableStock,
        createdById: item.createdById,
        createdBy: item.createdBy,
        createdAt: item.createdAt,
        linkedWoodReceipts: (item.productionWoodReceipts || [])
          .filter((pwr) => pwr && pwr.woodReceipt)
          .map((pwr) => ({
            id: pwr.woodReceipt.id,
            lotNumber: pwr.woodReceipt.lotNumber,
            quantity: Number(pwr.woodReceipt.quantity || 0),
            unit: pwr.woodReceipt.unit,
            receiptDate: pwr.woodReceipt.receiptDate,
            species: pwr.woodReceipt.species?.name || 'N/A',
            woodType: pwr.woodReceipt.woodType?.name || 'N/A',
            supplier: pwr.woodReceipt.supplier,
          })),
        fumigations: item.fumigations || [],
      },
    };
  }
}
