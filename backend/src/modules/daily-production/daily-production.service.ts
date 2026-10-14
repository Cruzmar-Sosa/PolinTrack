import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MovementType, Prisma, CorrectionModule, ReturnDestination } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { InventoryLedgerService } from '../inventory/inventory-ledger.service';
import {
  CreateDailyProductionDto,
  ProductionProductItemDto,
} from './dto/create-daily-production.dto';
import { QueryDailyProductionDto } from './dto/query-daily-production.dto';
import { CorrectDailyProductionDto } from './dto/correct-daily-production.dto';
import { validateCorrectionReason } from '../../common/utils/correction-reason.validator';
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
   * Generates an initial inventory lot number INV-INI-DDMMYY-XX (TSK-PRD-INI).
   *
   * Format: INV-INI-DDMMYY-XX where:
   *   - DDMMYY = registration date
   *   - XX     = sequential suffix to avoid collisions on the same day
   *
   * @param productionDateStr Date formatted as YYYY-MM-DD
   * @param tx Transaction client for counting existing initial inventory records
   */
  async generateInitialInventoryLot(
    productionDateStr: string,
    tx: Prisma.TransactionClient,
  ): Promise<{ productionLot: string; isoWeek: number }> {
    const { isoWeek } = getISOWeek(productionDateStr);

    const [year, month, day] = productionDateStr.split('-');
    const shortYear = year.slice(2);
    const datePart = `${day}${month}${shortYear}`;
    const prefix = `INV-INI-${datePart}`;

    // Count existing initial inventory records for this date to generate sequential suffix
    const existingCount = await tx.dailyProduction.count({
      where: {
        isInitialInventory: true,
        productionLot: { startsWith: prefix },
      },
    });

    const suffix = String(existingCount + 1).padStart(2, '0');
    const productionLot = `${prefix}-${suffix}`;

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
    const isInitialInventory = dto.isInitialInventory === true;

    // 1. Normalize items list (supports products array, details alias, and legacy single-product format)
    let items: ProductionProductItemDto[] = dto.products || dto.details || [];
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
    //    Skip validation when isInitialInventory=true (no raw material origin)
    if (!isInitialInventory && dto.woodReceiptIds && dto.woodReceiptIds.length > 0) {
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
      // TSK-PRD-INI: Generate appropriate lot number based on type
      const { productionLot, isoWeek } = isInitialInventory
        ? await this.generateInitialInventoryLot(dto.productionDate, tx)
        : await this.generateProductionLot(dto.productionDate, tx);

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
          isInitialInventory,
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
      //         Skip when isInitialInventory=true (no raw material origin)
      if (!isInitialInventory && dto.woodReceiptIds && dto.woodReceiptIds.length > 0) {
        await tx.productionWoodReceipt.createMany({
          data: dto.woodReceiptIds.map((woodReceiptId) => ({
            dailyProductionId: dailyProduction.id,
            woodReceiptId,
          })),
          skipDuplicates: true,
        });
      }

      // Step D: Atomically record movement in append-only Inventory Ledger for EACH product (RN-010)
      //         TSK-PRD-INI: Use INITIAL_INVENTORY movement type for initial stock baseline
      const ledgerMovementType = isInitialInventory
        ? MovementType.INITIAL_INVENTORY
        : MovementType.PRODUCTION;

      for (const item of items) {
        await this.inventoryLedgerService.recordMovement(
          {
            productId: item.productId,
            movementType: ledgerMovementType,
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
            isInitialInventory,
            productsCount: items.length,
            totalQuantityProduced: totalQuantity,
            woodReceiptsLinked: isInitialInventory ? 0 : (dto.woodReceiptIds?.length || 0),
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
        `[DailyProduction] ${isInitialInventory ? 'Inventario Inicial' : 'Producción'} registrada: Lote=${dailyProduction.productionLot}, Productos=${items.length}, TotalPiezas=+${totalQuantity}`,
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
        isInitialInventory: (item as any).isInitialInventory ?? false,
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
        isInitialInventory: (item as any).isInitialInventory ?? false,
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

  /**
   * Retrieves context, lines, and active dependencies (fumigated and net dispatched)
   * for a daily production record prior to editing.
   */
  async getCorrectionContext(id: string) {
    const item = await this.prisma.dailyProduction.findUnique({
      where: { id },
      include: {
        productionDetails: {
          include: { product: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!item) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Orden de producción con ID '${id}' no encontrada`,
      });
    }

    if ((item as any).isInitialInventory) {
      throw new BadRequestException({
        code: 'INITIAL_INVENTORY_NOT_CORRECTABLE',
        message: 'Los registros de inventario inicial no admiten correcciones en este flujo.',
      });
    }

    const linesContext = await Promise.all(
      item.productionDetails.map(async (d) => {
        // Active fumigations
        const fumAgg = await this.prisma.fumigationDetail.aggregate({
          where: { dailyProductionId: item.id, productId: d.productId },
          _sum: { quantityFumigated: true },
        });
        const fumigated = fumAgg._sum.quantityFumigated ?? 0;

        // Active net dispatches
        const dispatchLines = await this.prisma.dispatchDetail.findMany({
          where: { dailyProductionId: item.id, productId: d.productId },
          include: {
            returnDetails: {
              where: { destination: ReturnDestination.REPROCESO },
            },
          },
        });
        let netDispatched = 0;
        for (const dl of dispatchLines) {
          const reworkReturned = dl.returnDetails.reduce(
            (sum, rd) => sum + rd.quantityReturned,
            0,
          );
          netDispatched += Math.max(0, dl.quantityDispatched - reworkReturned);
        }

        const availableStock = await this.inventoryLedgerService.getAvailableStock(
          d.productId,
        );

        return {
          lineId: d.id,
          productId: d.productId,
          productName: d.product.name,
          dimensions: d.product.dimensions,
          currentQuantityProduced: d.quantityProduced,
          quantityFumigated: fumigated,
          quantityNetDispatched: netDispatched,
          minimumAllowedQuantity: Math.max(fumigated, netDispatched),
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
        id: item.id,
        productionLot: item.productionLot,
        productionDate: item.productionDate,
        isoWeek: item.isoWeek,
        totalQuantityProduced: item.quantityProduced,
        products,
        lines: linesContext,
      },
    };
  }

  /**
   * Executes an atomic, auditable quantity correction for daily production lines.
   * Supports both quantity modifications and product (polín measure) reclassifications.
   * Recalculates header total on server.
   * Enforces fumigation, net dispatch, and catalog inventory bounds.
   * Generates InventoryMovement(MovementType.CORRECTION) + QuantityCorrection + AuditLog.
   */
  async correctQuantity(id: string, dto: CorrectDailyProductionDto, userId: string) {
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
        const item = await this.findOne(id);
        return {
          success: true,
          message: 'Operación idempotente: la corrección ya fue registrada previamente.',
          data: item.data,
          correction: existing,
        };
      }
    }

    // 3. Atomically execute update within database transaction
    return this.prisma.$transaction(async (tx) => {
      // Concurrency protection: row lock on operational header to prevent race conditions
      if (typeof (tx as any).$queryRaw === 'function') {
        try {
          await tx.$queryRaw`SELECT id FROM daily_productions WHERE id = ${id}::uuid FOR UPDATE`;
        } catch {
          // Fallback if raw query execution is not supported in the active client/mock
        }
      }

      const production = await tx.dailyProduction.findUnique({
        where: { id },
        include: {
          productionDetails: {
            include: { product: true },
          },
        },
      });

      if (!production) {
        throw new NotFoundException({
          code: 'RESOURCE_NOT_FOUND',
          message: `Orden de producción con ID '${id}' no encontrada`,
        });
      }

      if ((production as any).isInitialInventory) {
        throw new BadRequestException({
          code: 'INITIAL_INVENTORY_NOT_CORRECTABLE',
          message: 'Los registros de inventario inicial no admiten correcciones en este flujo.',
        });
      }

      // Map lines by ID
      const detailMap = new Map(production.productionDetails.map((d) => [d.id, d]));

      // Validate all input items exist in current production
      for (const itemDto of dto.items) {
        if (!detailMap.has(itemDto.lineId)) {
          throw new BadRequestException({
            code: 'INVALID_LINE_ID',
            message: `La línea con ID '${itemDto.lineId}' no pertenece a la orden de producción '${production.productionLot}'.`,
          });
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
        const prevQty = detail.quantityProduced;
        const prevProductId = detail.productId;
        const newProductId =
          itemDto.productId && itemDto.productId !== prevProductId
            ? itemDto.productId
            : prevProductId;
        const isProductChange = newProductId !== prevProductId;
        const newQty = itemDto.quantity;
        const delta = newQty - prevQty;

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

          // Enforce @@unique([dailyProductionId, productId]): line cannot collide with existing product line
          const duplicateLine = production.productionDetails.find(
            (d) => d.id !== detail.id && d.productId === newProductId,
          );
          if (duplicateLine) {
            throw new BadRequestException({
              code: 'PRODUCT_ALREADY_EXISTS_IN_PRODUCTION',
              message: `El lote ${production.productionLot} ya cuenta con una línea para ${newProduct.dimensions}. Ajuste la cantidad directamente en la línea existente.`,
            });
          }

          // A. Fumigation Constraint on outgoing product: cannot change if fumigations exist
          const fumAgg = await tx.fumigationDetail.aggregate({
            where: { dailyProductionId: production.id, productId: prevProductId },
            _sum: { quantityFumigated: true },
          });
          const totalFumigated = fumAgg._sum.quantityFumigated ?? 0;
          if (totalFumigated > 0) {
            throw new BadRequestException({
              code: 'CANNOT_CHANGE_PRODUCT_WITH_FUMIGATION',
              message: `No se puede rectificar el producto ${detail.product.dimensions} en el lote ${production.productionLot} porque tiene ${totalFumigated} piezas amparadas en certificado(s) de fumigación OIRSA.`,
            });
          }

          // B. Net Dispatches Constraint on outgoing product: cannot change if committed dispatches exist
          const dispatchLines = await tx.dispatchDetail.findMany({
            where: { dailyProductionId: production.id, productId: prevProductId },
            include: {
              returnDetails: {
                where: { destination: ReturnDestination.REPROCESO },
              },
            },
          });
          let netDispatched = 0;
          for (const dl of dispatchLines) {
            const reworkReturned = dl.returnDetails.reduce(
              (sum, rd) => sum + rd.quantityReturned,
              0,
            );
            netDispatched += Math.max(0, dl.quantityDispatched - reworkReturned);
          }
          if (netDispatched > 0) {
            throw new BadRequestException({
              code: 'CANNOT_CHANGE_PRODUCT_WITH_COMMITTED_DISPATCH',
              message: `No se puede rectificar el producto ${detail.product.dimensions} en el lote ${production.productionLot} porque tiene ${netDispatched} piezas comprometidas en despachos comerciales netos.`,
            });
          }

          // C. Global Stock Sufficiency for outgoing product: patio must have enough stock to withdraw prevQty
          const currentAvailableOld = await this.inventoryLedgerService.getAvailableStock(
            prevProductId,
            tx,
          );
          if (currentAvailableOld < prevQty) {
            throw new BadRequestException({
              code: 'INSUFFICIENT_STOCK_FOR_REDUCTION',
              message: `Stock insuficiente en almacén para descontar ${prevQty} piezas de ${detail.product.dimensions}. Stock disponible actual: ${currentAvailableOld}.`,
            });
          }

          // Compensatory Movement 1: Deduct outgoing product from inventory ledger
          const movementOut = await tx.inventoryMovement.create({
            data: {
              productId: prevProductId,
              movementType: MovementType.CORRECTION,
              deltaQuantity: -prevQty,
              referenceTable: 'daily_productions',
              referenceId: production.id,
              performedById: userId,
              metadata: {
                lineId: detail.id,
                productionLot: production.productionLot,
                action: 'PRODUCT_RECLASSIFICATION_OUT',
                previousProductId: prevProductId,
                previousDimensions: detail.product.dimensions,
                newProductId,
                newDimensions: newProduct.dimensions,
                previousQuantity: prevQty,
                newQuantity: 0,
                reason: validatedReason,
              },
            },
          });

          // Compensatory Movement 2: Add incoming product to inventory ledger
          const movementIn = await tx.inventoryMovement.create({
            data: {
              productId: newProductId,
              movementType: MovementType.CORRECTION,
              deltaQuantity: newQty,
              referenceTable: 'daily_productions',
              referenceId: production.id,
              performedById: userId,
              metadata: {
                lineId: detail.id,
                productionLot: production.productionLot,
                action: 'PRODUCT_RECLASSIFICATION_IN',
                previousProductId: prevProductId,
                previousDimensions: detail.product.dimensions,
                newProductId,
                newDimensions: newProduct.dimensions,
                previousQuantity: 0,
                newQuantity: newQty,
                reason: validatedReason,
              },
            },
          });

          // Update production_detail line with new product and new quantity
          await tx.productionDetail.update({
            where: { id: detail.id },
            data: {
              productId: newProductId,
              quantityProduced: newQty,
            },
          });

          // Audit record: 2 atomic items (withdrawal from old product, entry to new product)
          itemsToRecord.push(
            {
              lineId: detail.id,
              productId: prevProductId,
              fieldName: 'product_reclassification_out',
              previous: prevQty,
              new: 0,
              delta: -prevQty,
              movementId: movementOut.id,
            },
            {
              lineId: detail.id,
              productId: newProductId,
              fieldName: 'product_reclassification_in',
              previous: 0,
              new: newQty,
              delta: newQty,
              movementId: movementIn.id,
            },
          );

          productReclassifications.push({
            lineId: detail.id,
            previousProductId: prevProductId,
            previousDimensions: detail.product.dimensions,
            previousQuantity: prevQty,
            newProductId,
            newDimensions: newProduct.dimensions,
            newQuantity: newQty,
          });
        } else {
          // Standard quantity adjustment on same product
          if (delta < 0) {
            // A. Fumigation Constraint
            const fumAgg = await tx.fumigationDetail.aggregate({
              where: { dailyProductionId: production.id, productId: detail.productId },
              _sum: { quantityFumigated: true },
            });
            const totalFumigated = fumAgg._sum.quantityFumigated ?? 0;
            if (newQty < totalFumigated) {
              throw new BadRequestException({
                code: 'CANNOT_REDUCE_BELOW_FUMIGATED',
                message: `No se puede reducir la producción a ${newQty} piezas para ${detail.product.dimensions} en el lote ${production.productionLot}. Existen ${totalFumigated} piezas ya fumigadas.`,
              });
            }

            // B. Net Dispatches Constraint
            const dispatchLines = await tx.dispatchDetail.findMany({
              where: { dailyProductionId: production.id, productId: detail.productId },
              include: {
                returnDetails: {
                  where: { destination: ReturnDestination.REPROCESO },
                },
              },
            });
            let netDispatched = 0;
            for (const dl of dispatchLines) {
              const reworkReturned = dl.returnDetails.reduce(
                (sum, rd) => sum + rd.quantityReturned,
                0,
              );
              netDispatched += Math.max(0, dl.quantityDispatched - reworkReturned);
            }
            if (newQty < netDispatched) {
              throw new BadRequestException({
                code: 'CANNOT_REDUCE_BELOW_COMMITTED_DISPATCH',
                message: `No se puede reducir la producción a ${newQty} piezas para ${detail.product.dimensions} en el lote ${production.productionLot}. Existen ${netDispatched} piezas comprometidas en despachos netos.`,
              });
            }

            // C. Global Stock Sufficiency
            const currentAvailable = await this.inventoryLedgerService.getAvailableStock(
              detail.productId,
              tx,
            );
            if (currentAvailable < Math.abs(delta)) {
              throw new BadRequestException({
                code: 'INSUFFICIENT_STOCK_FOR_REDUCTION',
                message: `Stock insuficiente en almacén para descontar ${Math.abs(delta)} piezas de ${detail.product.dimensions}. Stock disponible actual: ${currentAvailable}.`,
              });
            }
          }

          // Create compensatory movement in inventory_movements ledger
          const movement = await tx.inventoryMovement.create({
            data: {
              productId: detail.productId,
              movementType: MovementType.CORRECTION,
              deltaQuantity: delta, // signed (+ or -)
              referenceTable: 'daily_productions',
              referenceId: production.id,
              performedById: userId,
              metadata: {
                lineId: detail.id,
                productionLot: production.productionLot,
                previousQuantity: prevQty,
                newQuantity: newQty,
                reason: validatedReason,
              },
            },
          });

          // Update production_detail line
          await tx.productionDetail.update({
            where: { id: detail.id },
            data: { quantityProduced: newQty },
          });

          itemsToRecord.push({
            lineId: detail.id,
            productId: detail.productId,
            fieldName: 'quantityProduced',
            previous: prevQty,
            new: newQty,
            delta,
            movementId: movement.id,
          });
        }
      }

      if (!hasActualChange) {
        throw new BadRequestException({
          code: 'NO_CHANGES_DETECTED',
          message: 'Las cantidades y medidas ingresadas son idénticas a las registradas actualmente. No se detectaron cambios.',
        });
      }

      // Recalculate header total from all details in DB
      const updatedLines = await tx.productionDetail.findMany({
        where: { dailyProductionId: production.id },
      });
      const newHeaderTotal = updatedLines.reduce((sum, d) => sum + d.quantityProduced, 0);

      await tx.dailyProduction.update({
        where: { id: production.id },
        data: { quantityProduced: newHeaderTotal },
      });

      // Append-only QuantityCorrection record
      const correction = await tx.quantityCorrection.create({
        data: {
          module: CorrectionModule.DAILY_PRODUCTION,
          recordId: production.id,
          recordCode: production.productionLot,
          reason: validatedReason,
          correctedById: userId,
          idempotencyKey: dto.idempotencyKey || null,
          metadata: {
            previousHeaderTotal: production.quantityProduced,
            newHeaderTotal,
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

      // Append-only AuditLog
      await tx.auditLog.create({
        data: {
          tableName: 'daily_productions',
          recordId: production.id,
          action: 'CORRECTION',
          oldValues: {
            quantityProduced: production.quantityProduced,
            lines: itemsToRecord.map((i) => ({
              lineId: i.lineId,
              productId: i.productId,
              quantity: i.previous,
            })),
          },
          newValues: {
            quantityProduced: newHeaderTotal,
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
        `[DailyProduction] Corrección completada: ID=${production.id}, Lote=${production.productionLot}, TotalNuevo=${newHeaderTotal}, Items=${itemsToRecord.length}, User=${userId}`,
      );

      return {
        success: true,
        data: {
          id: production.id,
          productionLot: production.productionLot,
          quantityProduced: newHeaderTotal,
        },
        correction,
      };
    });
  }

  /**
   * Retrieves read-only historical list of quantity corrections for a given daily production order.
   */
  async getCorrections(id: string) {
    const corrections = await this.prisma.quantityCorrection.findMany({
      where: {
        module: CorrectionModule.DAILY_PRODUCTION,
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
