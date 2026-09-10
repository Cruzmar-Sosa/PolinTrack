import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { MovementType, Prisma } from '@prisma/client';
import { QueryWoodReceiptsReportDto } from './dto/query-wood-receipts-report.dto';
import { QueryDispatchesReportDto } from './dto/query-dispatches-report.dto';
import { QueryInventoryReportDto } from './dto/query-inventory-report.dto';
import { QueryDailyProductionsReportDto } from './dto/query-daily-productions-report.dto';
import { QueryFumigationsReportDto } from './dto/query-fumigations-report.dto';
import { QueryDistributionCentersReportDto } from './dto/query-distribution-centers-report.dto';
import {
  DailyProductionsReportResponseDto,
  DispatchesReportResponseDto,
  DistributionCentersReportResponseDto,
  FumigationsReportResponseDto,
  InventoryReportResponseDto,
  WoodReceiptsReportResponseDto,
} from './dto/reports-response.dto';
import { validateDateRange } from './dto/date-range.dto';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * REPORTE 1: Ingresos de Materia Prima (EP-REP-01 / UC-REP-01 / REQ-FUNC-090).
   * Filtros: Rango de fechas (RN-007), lote de madera, proveedor. Paginación canónica.
   */
  async getWoodReceiptsReport(
    query: QueryWoodReceiptsReportDto,
  ): Promise<WoodReceiptsReportResponseDto> {
    const { start, end } = validateDateRange(query.startDate, query.endDate);
    const page = query.page ?? 1;
    const limit = query.limit !== undefined ? Number(query.limit) : 10;
    const isAll = limit === 0 || limit >= 10000;
    const skip = isAll ? undefined : (page - 1) * limit;
    const take = isAll ? undefined : limit;

    const where: Prisma.WoodReceiptWhereInput = {};

    if (start || end) {
      where.receiptDate = {
        ...(start ? { gte: start } : {}),
        ...(end ? { lte: end } : {}),
      };
    }

    if (query.lotNumber) {
      where.lotNumber = {
        contains: query.lotNumber.trim(),
        mode: 'insensitive',
      };
    }

    if (query.supplierId) {
      where.supplierId = query.supplierId;
    }

    const [total, rows] = await Promise.all([
      this.prisma.woodReceipt.count({ where }),
      this.prisma.woodReceipt.findMany({
        where,
        include: {
          supplier: true,
          species: true,
          woodType: true,
          createdBy: { select: { fullName: true } },
        },
        orderBy: [{ receiptDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
    ]);

    const data = rows.map((r) => ({
      id: r.id,
      receiptDate: r.receiptDate.toISOString().split('T')[0],
      receiptTime: r.receiptTime.toISOString().split('T')[1].substring(0, 8),
      supplierName: r.supplier.name,
      speciesName: r.species.name,
      woodTypeName: r.woodType.name,
      quantity: Number(r.quantity),
      unit: r.unit,
      yugosQuantity: r.yugosQuantity,
      reglasQuantity: r.reglasQuantity,
      woodStatus: r.woodStatus,
      lotNumber: r.lotNumber,
      guideNumber: r.guideNumber,
      receivedBy: r.createdBy.fullName,
    }));

    return {
      success: true,
      data,
      meta: {
        total,
        page: isAll ? 1 : page,
        limit: isAll ? total : limit,
        totalPages: isAll ? 1 : Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * REPORTE 2: Salidas y Despachos Comerciales (EP-REP-02 / UC-REP-01 / REQ-FUNC-091).
   * Filtros: Rango de fechas (RN-007), centro cliente, lote de producción. Paginación canónica.
   */
  async getDispatchesReport(
    query: QueryDispatchesReportDto,
  ): Promise<DispatchesReportResponseDto> {
    const { start, end } = validateDateRange(query.startDate, query.endDate);
    const page = query.page ?? 1;
    const limit = query.limit !== undefined ? Number(query.limit) : 10;
    const isAll = limit === 0 || limit >= 10000;
    const skip = isAll ? undefined : (page - 1) * limit;
    const take = isAll ? undefined : limit;

    const where: Prisma.DispatchDetailWhereInput = {};

    if (start || end || query.clientCenterId) {
      where.dispatchHeader = {
        ...(start || end
          ? {
              dispatchDate: {
                ...(start ? { gte: start } : {}),
                ...(end ? { lte: end } : {}),
              },
            }
          : {}),
        ...(query.clientCenterId ? { clientCenterId: query.clientCenterId } : {}),
      };
    }

    if (query.productionLot) {
      where.dailyProduction = {
        productionLot: {
          contains: query.productionLot.trim(),
          mode: 'insensitive',
        },
      };
    }

    const [total, details] = await Promise.all([
      this.prisma.dispatchDetail.count({ where }),
      this.prisma.dispatchDetail.findMany({
        where,
        include: {
          product: true,
          dailyProduction: true,
          dispatchHeader: {
            include: { clientCenter: true },
          },
        },
        orderBy: [
          { dispatchHeader: { dispatchDate: 'desc' } },
          { dispatchHeader: { createdAt: 'desc' } },
          { id: 'desc' },
        ],
        skip,
        take,
      }),
    ]);

    const data = details.map((d) => ({
      id: d.id,
      dispatchDate: d.dispatchHeader.dispatchDate.toISOString().split('T')[0],
      dispatchTime: d.dispatchHeader.dispatchTime.toISOString().split('T')[1].substring(0, 8),
      invoiceNumber: d.dispatchHeader.invoiceNumber,
      clientCenterName: d.dispatchHeader.clientCenter.name,
      productionLot: d.dailyProduction?.productionLot ?? 'Sin lote',
      productName: d.product.name,
      dimensions: d.product.dimensions,
      quantityDispatched: d.quantityDispatched,
      quantityReturnedAccumulated: d.quantityReturnedAccumulated,
      vehicleInfo: d.dispatchHeader.vehicleInfo,
      driverName: d.dispatchHeader.driverName,
      status: d.dispatchHeader.status,
      observations: d.dispatchHeader.observations,
    }));

    return {
      success: true,
      data,
      meta: {
        total,
        page: isAll ? 1 : page,
        limit: isAll ? total : limit,
        totalPages: isAll ? 1 : Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * REPORTE 3: Inventario Operativo Consolidado (EP-REP-03 / UC-REP-01 / REQ-FUNC-092).
   * Consolida producción, salidas, devoluciones, ajustes y stock disponible actual por polín.
   */
  async getInventoryReport(
    query: QueryInventoryReportDto,
  ): Promise<InventoryReportResponseDto> {
    const products = await this.prisma.product.findMany({
      where: {
        isActive: true,
        ...(query.productId ? { id: query.productId } : {}),
      },
      orderBy: { dimensions: 'asc' },
    });

    const cutOffDateStr = query.asOfDate || query.endDate;
    let timestampFilter: Prisma.DateTimeFilter | undefined;

    if (cutOffDateStr) {
      const cutOff = new Date(cutOffDateStr);
      cutOff.setUTCHours(23, 59, 59, 999);
      timestampFilter = { lte: cutOff };
    }

    if (query.startDate && cutOffDateStr) {
      validateDateRange(query.startDate, cutOffDateStr);
    }

    const movementsWhere: Prisma.InventoryMovementWhereInput = {
      ...(query.productId ? { productId: query.productId } : {}),
      ...(timestampFilter ? { timestamp: timestampFilter } : {}),
    };

    const movements = await this.prisma.inventoryMovement.groupBy({
      by: ['productId', 'movementType'],
      _sum: { deltaQuantity: true },
      ...(Object.keys(movementsWhere).length > 0 ? { where: movementsWhere } : {}),
    });

    // Mapeo de métricas por producto y tipo de movimiento
    const productStats = new Map<
      string,
      {
        produced: number;
        dispatched: number;
        returned: number;
        adjustments: number;
      }
    >();

    for (const m of movements) {
      const pId = m.productId;
      if (!productStats.has(pId)) {
        productStats.set(pId, { produced: 0, dispatched: 0, returned: 0, adjustments: 0 });
      }
      const stat = productStats.get(pId)!;
      const delta = m._sum.deltaQuantity ?? 0;

      switch (m.movementType) {
        case MovementType.PRODUCTION:
          stat.produced += delta;
          break;
        case MovementType.DISPATCH:
          stat.dispatched += Math.abs(delta);
          break;
        case MovementType.RETURN:
          stat.returned += delta;
          break;
        case MovementType.ADJUSTMENT:
          stat.adjustments += delta;
          break;
      }
    }

    let summaryProduced = 0;
    let summaryDispatched = 0;
    let summaryReturned = 0;
    let summaryAvailable = 0;

    const data = products.map((p) => {
      const stats = productStats.get(p.id) ?? {
        produced: 0,
        dispatched: 0,
        returned: 0,
        adjustments: 0,
      };

      const currentAvailableStock =
        stats.produced - stats.dispatched + stats.returned + stats.adjustments;

      summaryProduced += stats.produced;
      summaryDispatched += stats.dispatched;
      summaryReturned += stats.returned;
      summaryAvailable += currentAvailableStock;

      return {
        productId: p.id,
        productName: p.name,
        dimensions: p.dimensions,
        totalProduced: stats.produced,
        totalDispatched: stats.dispatched,
        totalReturned: stats.returned,
        netAdjustments: stats.adjustments,
        currentAvailableStock,
      };
    });

    return {
      success: true,
      data,
      summary: {
        totalProduced: summaryProduced,
        totalDispatched: summaryDispatched,
        totalReturned: summaryReturned,
        totalAvailableStock: summaryAvailable,
      },
    };
  }

  /**
   * REPORTE 4: Producción Diaria por Semana ISO (EP-REP-04 / UC-REP-01 / REQ-FUNC-093).
   * Filtros: Rango de fechas (RN-007), producto, semana ISO.
   */
  async getDailyProductionsReport(
    query: QueryDailyProductionsReportDto,
  ): Promise<DailyProductionsReportResponseDto> {
    const { start, end } = validateDateRange(query.startDate, query.endDate);
    const page = query.page ?? 1;
    const limit = query.limit !== undefined ? Number(query.limit) : 10;
    const isAll = limit === 0 || limit >= 10000;
    const skip = isAll ? undefined : (page - 1) * limit;
    const take = isAll ? undefined : limit;

    const where: Prisma.DailyProductionWhereInput = {};

    if (start || end) {
      where.productionDate = {
        ...(start ? { gte: start } : {}),
        ...(end ? { lte: end } : {}),
      };
    }

    if (query.productId) {
      where.productionDetails = {
        some: { productId: query.productId },
      };
    }

    if (query.isoWeek) {
      where.isoWeek = query.isoWeek;
    }

    const [total, rows] = await Promise.all([
      this.prisma.dailyProduction.count({ where }),
      this.prisma.dailyProduction.findMany({
        where,
        include: {
          productionDetails: {
            include: { product: true },
            where: query.productId ? { productId: query.productId } : undefined,
          },
          createdBy: { select: { fullName: true } },
          productionWoodReceipts: {
            include: {
              woodReceipt: { select: { lotNumber: true } },
            },
          },
        },
        orderBy: [{ productionDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
    ]);

    const data = rows.flatMap((r) => {
      const details =
        r.productionDetails && r.productionDetails.length > 0
          ? r.productionDetails
          : (r as any).product
            ? [
                {
                  product: (r as any).product,
                  quantityProduced: (r as any).quantityProduced ?? 0,
                },
              ]
            : [];

      return details.map((pd) => ({
        id: r.id,
        productionDate: r.productionDate.toISOString().split('T')[0],
        productionLot: r.productionLot,
        isoWeek: r.isoWeek,
        productName: pd.product?.name || (r as any).product?.name,
        dimensions: pd.product?.dimensions || (r as any).product?.dimensions,
        quantityProduced: pd.quantityProduced ?? (r as any).quantityProduced ?? 0,
        woodReceiptLots: (r.productionWoodReceipts || []).map(
          (pwr) => pwr.woodReceipt?.lotNumber,
        ),
        supervisor: r.createdBy?.fullName,
      }));
    });

    return {
      success: true,
      data,
      meta: {
        total,
        page: isAll ? 1 : page,
        limit: isAll ? total : limit,
        totalPages: isAll ? 1 : Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * REPORTE 5: Fumigaciones y Certificados OIRSA (EP-REP-05 / UC-REP-01 / REQ-FUNC-094).
   * Filtros: Rango de fechas (RN-007), lote de producción. Incluye enlace de descarga de PDF.
   */
  async getFumigationsReport(
    query: QueryFumigationsReportDto,
  ): Promise<FumigationsReportResponseDto> {
    const { start, end } = validateDateRange(query.startDate, query.endDate);
    const page = query.page ?? 1;
    const limit = query.limit !== undefined ? Number(query.limit) : 10;
    const isAll = limit === 0 || limit >= 10000;
    const skip = isAll ? undefined : (page - 1) * limit;
    const take = isAll ? undefined : limit;

    const where: Prisma.FumigationWhereInput = {};

    if (start || end) {
      where.fumigationDate = {
        ...(start ? { gte: start } : {}),
        ...(end ? { lte: end } : {}),
      };
    }

    if (query.productionLot) {
      const term = query.productionLot.trim();
      where.OR = [
        {
          dailyProduction: {
            productionLot: {
              contains: term,
              mode: 'insensitive',
            },
          },
        },
        {
          details: {
            some: {
              dailyProduction: {
                productionLot: {
                  contains: term,
                  mode: 'insensitive',
                },
              },
            },
          },
        },
      ];
    }

    const [total, rows] = await Promise.all([
      this.prisma.fumigation.count({ where }),
      this.prisma.fumigation.findMany({
        where,
        include: {
          dailyProduction: true,
          details: {
            include: {
              dailyProduction: { select: { productionLot: true } },
              product: { select: { name: true } },
            },
          },
          registeredBy: { select: { fullName: true } },
        },
        orderBy: [{ fumigationDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
    ]);

    const data = rows.map((r) => {
      const lotsSet = new Set<string>();
      if (r.dailyProduction?.productionLot) lotsSet.add(r.dailyProduction.productionLot);
      for (const d of r.details || []) {
        if (d.dailyProduction?.productionLot) lotsSet.add(d.dailyProduction.productionLot);
      }
      const productionLots = Array.from(lotsSet);

      const prodSet = new Set<string>();
      for (const d of r.details || []) {
        if (d.product?.name) prodSet.add(d.product.name);
      }
      const treatedProducts = Array.from(prodSet);

      return {
        id: r.id,
        fumigationDate: r.fumigationDate.toISOString().split('T')[0],
        fumigationTime: r.fumigationTime.toISOString().split('T')[1].substring(0, 8),
        productionLot: productionLots[0] || r.dailyProduction?.productionLot || 'N/A',
        productionLots,
        lotsCount: productionLots.length,
        treatedProducts,
        certificateNumber: r.certificateNumber,
        pdfFileName: r.pdfFileName,
        fileSizeBytes: r.fileSizeBytes,
        certificateDownloadUrl: `/api/v1/fumigations/${r.id}/certificate-url`,
        registeredBy: r.registeredBy.fullName,
      };
    });

    return {
      success: true,
      data,
      meta: {
        total,
        page: isAll ? 1 : page,
        limit: isAll ? total : limit,
        totalPages: isAll ? 1 : Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * REPORTE 6: Movimientos por Centro de Distribución (EP-REP-06 / UC-REP-01 / REQ-FUNC-095).
   * Desglosa para cada una de las 7 plantas cliente los despachos, devoluciones y neto entregado.
   */
  async getDistributionCentersReport(
    query: QueryDistributionCentersReportDto,
  ): Promise<DistributionCentersReportResponseDto> {
    const { start, end } = validateDateRange(query.startDate, query.endDate);

    const clientCenters = await this.prisma.clientCenter.findMany({
      where: {
        isActive: true,
        ...(query.clientCenterId ? { id: query.clientCenterId } : {}),
      },
      orderBy: { name: 'asc' },
    });

    const whereDispatch: Prisma.DispatchHeaderWhereInput = {};
    if (start || end) {
      whereDispatch.dispatchDate = {
        ...(start ? { gte: start } : {}),
        ...(end ? { lte: end } : {}),
      };
    }

    const dispatchHeaders = await this.prisma.dispatchHeader.findMany({
      where: whereDispatch,
      include: {
        dispatchDetails: {
          include: {
            returnDetails: true,
          },
        },
      },
    });

    // Mapeo de métricas por centro cliente
    const centerMetrics = new Map<
      string,
      {
        totalDispatched: number;
        totalReturned: number;
        invoices: Set<string>;
      }
    >();

    for (const dh of dispatchHeaders) {
      const ccId = dh.clientCenterId;
      if (!centerMetrics.has(ccId)) {
        centerMetrics.set(ccId, {
          totalDispatched: 0,
          totalReturned: 0,
          invoices: new Set<string>(),
        });
      }
      const metric = centerMetrics.get(ccId)!;
      metric.invoices.add(dh.invoiceNumber);

      for (const dd of dh.dispatchDetails) {
        metric.totalDispatched += dd.quantityDispatched;
        for (const rd of dd.returnDetails) {
          metric.totalReturned += rd.quantityReturned;
        }
      }
    }

    let summaryDispatched = 0;
    let summaryReturned = 0;
    let summaryInvoices = 0;

    const data = clientCenters.map((cc) => {
      const metric = centerMetrics.get(cc.id) ?? {
        totalDispatched: 0,
        totalReturned: 0,
        invoices: new Set<string>(),
      };

      const netDelivered = metric.totalDispatched - metric.totalReturned;
      summaryDispatched += metric.totalDispatched;
      summaryReturned += metric.totalReturned;
      summaryInvoices += metric.invoices.size;

      return {
        clientCenterId: cc.id,
        clientCenterName: cc.name,
        totalDispatched: metric.totalDispatched,
        totalReturned: metric.totalReturned,
        netDelivered,
        invoicesCount: metric.invoices.size,
      };
    });

    return {
      success: true,
      data,
      summary: {
        totalDispatched: summaryDispatched,
        totalReturned: summaryReturned,
        netDelivered: summaryDispatched - summaryReturned,
        totalInvoicesCount: summaryInvoices,
      },
    };
  }
}
