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
    const safePage = Math.max(1, Number(query.page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const skip = (safePage - 1) * safeLimit;
    const take = safeLimit;

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
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit) || 1,
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
    const safePage = Math.max(1, Number(query.page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const skip = (safePage - 1) * safeLimit;
    const take = safeLimit;

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
          returnDetails: true,
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

    const data = details.map((d) => {
      const returnDetailsList = d.returnDetails || [];
      const rework = returnDetailsList
        .filter((r) => r.destination !== 'DESECHO')
        .reduce((acc, r) => acc + r.quantityReturned, 0);
      const scrap = returnDetailsList
        .filter((r) => r.destination === 'DESECHO')
        .reduce((acc, r) => acc + r.quantityReturned, 0);

      let returnDestination: string | null = null;
      if (rework > 0 && scrap > 0) returnDestination = 'MIXTO';
      else if (rework > 0) returnDestination = 'REPROCESO';
      else if (scrap > 0) returnDestination = 'DESECHO';

      return {
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
        returnDestination,
        quantityReturnedRework: rework,
        quantityReturnedScrap: scrap,
        vehicleInfo: d.dispatchHeader.vehicleInfo,
        driverName: d.dispatchHeader.driverName,
        status: d.dispatchHeader.status,
        observations: d.dispatchHeader.observations,
      };
    });

    return {
      success: true,
      data,
      meta: {
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit) || 1,
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

    const [movements, returnGroups] = await Promise.all([
      this.prisma.inventoryMovement.groupBy({
        by: ['productId', 'movementType'],
        _sum: { deltaQuantity: true },
        ...(Object.keys(movementsWhere).length > 0 ? { where: movementsWhere } : {}),
      }),
      this.prisma.returnDetail.groupBy({
        by: ['productId', 'destination'],
        _sum: { quantityReturned: true },
        ...(query.productId ? { where: { productId: query.productId } } : {}),
      }),
    ]);

    const returnBreakdownMap = new Map<string, { rework: number; scrap: number }>();
    for (const rg of returnGroups) {
      if (!returnBreakdownMap.has(rg.productId)) {
        returnBreakdownMap.set(rg.productId, { rework: 0, scrap: 0 });
      }
      const item = returnBreakdownMap.get(rg.productId)!;
      if (rg.destination === 'DESECHO') {
        item.scrap += rg._sum?.quantityReturned ?? 0;
      } else {
        item.rework += rg._sum?.quantityReturned ?? 0;
      }
    }

    // Mapeo de métricas por producto y tipo de movimiento
    const productStats = new Map<
      string,
      {
        produced: number;
        dispatched: number;
        returned: number;
        adjustments: number;
        corrections: number;
      }
    >();

    for (const m of movements) {
      const pId = m.productId;
      if (!productStats.has(pId)) {
        productStats.set(pId, { produced: 0, dispatched: 0, returned: 0, adjustments: 0, corrections: 0 });
      }
      const stat = productStats.get(pId)!;
      const delta = m._sum?.deltaQuantity ?? 0;

      switch (m.movementType) {
        case MovementType.PRODUCTION:
        case MovementType.INITIAL_INVENTORY:
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
        case MovementType.CORRECTION:
          stat.corrections += delta;
          break;
      }
    }

    let summaryProduced = 0;
    let summaryDispatched = 0;
    let summaryReturned = 0;
    let summaryReturnedRework = 0;
    let summaryReturnedScrap = 0;
    let summaryAdjustments = 0;
    let summaryCorrections = 0;
    let summaryAvailable = 0;

    const data = products.map((p) => {
      const stats = productStats.get(p.id) ?? {
        produced: 0,
        dispatched: 0,
        returned: 0,
        adjustments: 0,
        corrections: 0,
      };

      const returnBreakdown = returnBreakdownMap.get(p.id) ?? { rework: 0, scrap: 0 };
      const totalReturnedRework = returnBreakdown.rework || stats.returned;
      const totalReturnedScrap = returnBreakdown.scrap;
      const totalReturned = totalReturnedRework + totalReturnedScrap;

      const currentAvailableStock =
        stats.produced - stats.dispatched + stats.returned + stats.adjustments + stats.corrections;

      summaryProduced += stats.produced;
      summaryDispatched += stats.dispatched;
      summaryReturned += totalReturned;
      summaryReturnedRework += totalReturnedRework;
      summaryReturnedScrap += totalReturnedScrap;
      summaryAdjustments += stats.adjustments;
      summaryCorrections += stats.corrections;
      summaryAvailable += currentAvailableStock;

      return {
        productId: p.id,
        productName: p.name,
        dimensions: p.dimensions,
        totalProduced: stats.produced,
        totalDispatched: stats.dispatched,
        totalReturned,
        totalReturnedRework,
        totalReturnedScrap,
        netAdjustments: stats.adjustments,
        netCorrections: stats.corrections,
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
        totalReturnedRework: summaryReturnedRework,
        totalReturnedScrap: summaryReturnedScrap,
        totalAdjustments: summaryAdjustments,
        totalCorrections: summaryCorrections,
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
    const safePage = Math.max(1, Number(query.page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const skip = (safePage - 1) * safeLimit;
    const take = safeLimit;

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
        isInitialInventory: (r as any).isInitialInventory ?? false,
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
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit) || 1,
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
    const safePage = Math.max(1, Number(query.page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const skip = (safePage - 1) * safeLimit;
    const take = safeLimit;

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

      const treatedProducts = (r.details || []).map((d) => {
        const pName = d.product?.name || 'Polín';
        return d.quantityFumigated ? `${pName} (${d.quantityFumigated} pcs)` : pName;
      });
      const totalQuantityFumigated = (r.details || []).reduce(
        (sum, d) => sum + (d.quantityFumigated || 0),
        0,
      );

      return {
        id: r.id,
        fumigationDate: r.fumigationDate.toISOString().split('T')[0],
        fumigationTime: r.fumigationTime.toISOString().split('T')[1].substring(0, 8),
        productionLot: productionLots[0] || r.dailyProduction?.productionLot || 'N/A',
        productionLots,
        lotsCount: productionLots.length,
        treatedProducts,
        totalQuantityFumigated,
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
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit) || 1,
      },
    };
  }

  /**
   * REPORTE 6: Movimientos por Centro de Distribución (EP-REP-06 / UC-REP-01 / REQ-FUNC-095).
   * Desglosa para cada una de las 7 plantas cliente los despachos, devoluciones y neto entregado.
   * Optimizado en QA-06E-02: Agregación delegada a PostgreSQL mediante $queryRaw y Prisma.sql con paginación determinista.
   */
  async getDistributionCentersReport(
    query: QueryDistributionCentersReportDto,
  ): Promise<DistributionCentersReportResponseDto> {
    const { start, end } = validateDateRange(query.startDate, query.endDate);

    const safePage = Math.max(1, Number(query.page) || 1);
    const rawLimit =
      query.limit !== undefined && query.limit !== null
        ? Number(query.limit)
        : 50;
    const safeLimit = Math.min(100, Math.max(1, isNaN(rawLimit) ? 50 : rawLimit));
    const skip = (safePage - 1) * safeLimit;
    const take = safeLimit;

    // Filtros de fecha parametrizados y seguros
    const dateConditions: Prisma.Sql[] = [];
    if (start) {
      dateConditions.push(Prisma.sql`dh.dispatch_date >= ${start}::date`);
    }
    if (end) {
      dateConditions.push(Prisma.sql`dh.dispatch_date <= ${end}::date`);
    }

    const dateWhere =
      dateConditions.length > 0
        ? Prisma.sql`AND ${Prisma.join(dateConditions, ' AND ')}`
        : Prisma.empty;

    const centerCondition = query.clientCenterId
      ? Prisma.sql`AND cc.id = ${query.clientCenterId}::uuid`
      : Prisma.empty;

    const headerCenterCondition = query.clientCenterId
      ? Prisma.sql`AND dh.client_center_id = ${query.clientCenterId}::uuid`
      : Prisma.empty;

    // Ejecución paralela en PostgreSQL de la página solicitada y el resumen global
    const [rows, summaryResult] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{
          clientCenterId: string;
          clientCenterName: string;
          totalDispatched: number;
          totalReturned: number;
          netDelivered: number;
          invoicesCount: number;
        }>
      >(Prisma.sql`
        WITH detail_returns AS (
          SELECT 
            dispatch_detail_id, 
            COALESCE(SUM(quantity_returned), 0)::int AS total_returned
          FROM return_details
          GROUP BY dispatch_detail_id
        ),
        header_metrics AS (
          SELECT 
            dh.id AS header_id,
            dh.client_center_id,
            dh.invoice_number,
            dh.dispatch_date,
            COALESCE(SUM(dd.quantity_dispatched), 0)::int AS dispatched_qty,
            COALESCE(SUM(dr.total_returned), 0)::int AS returned_qty
          FROM dispatch_headers dh
          LEFT JOIN dispatch_details dd ON dd.dispatch_header_id = dh.id
          LEFT JOIN detail_returns dr ON dr.dispatch_detail_id = dd.id
          WHERE 1=1 ${dateWhere} ${headerCenterCondition}
          GROUP BY dh.id, dh.client_center_id, dh.invoice_number, dh.dispatch_date
        )
        SELECT 
          cc.id AS "clientCenterId",
          cc.name AS "clientCenterName",
          COALESCE(SUM(hm.dispatched_qty), 0)::int AS "totalDispatched",
          COALESCE(SUM(hm.returned_qty), 0)::int AS "totalReturned",
          (COALESCE(SUM(hm.dispatched_qty), 0) - COALESCE(SUM(hm.returned_qty), 0))::int AS "netDelivered",
          COUNT(DISTINCT hm.invoice_number)::int AS "invoicesCount"
        FROM client_centers cc
        LEFT JOIN header_metrics hm ON hm.client_center_id = cc.id
        WHERE cc.is_active = true ${centerCondition}
        GROUP BY cc.id, cc.name
        ORDER BY cc.name ASC, cc.id ASC
        LIMIT ${take} OFFSET ${skip};
      `),
      this.prisma.$queryRaw<
        Array<{
          totalCenters: number;
          summaryDispatched: number;
          summaryReturned: number;
          summaryNet: number;
          summaryInvoices: number;
        }>
      >(Prisma.sql`
        WITH detail_returns AS (
          SELECT 
            dispatch_detail_id, 
            COALESCE(SUM(quantity_returned), 0)::int AS total_returned
          FROM return_details
          GROUP BY dispatch_detail_id
        ),
        header_metrics AS (
          SELECT 
            dh.id AS header_id,
            dh.client_center_id,
            dh.invoice_number,
            dh.dispatch_date,
            COALESCE(SUM(dd.quantity_dispatched), 0)::int AS dispatched_qty,
            COALESCE(SUM(dr.total_returned), 0)::int AS returned_qty
          FROM dispatch_headers dh
          LEFT JOIN dispatch_details dd ON dd.dispatch_header_id = dh.id
          LEFT JOIN detail_returns dr ON dr.dispatch_detail_id = dd.id
          WHERE 1=1 ${dateWhere} ${headerCenterCondition}
          GROUP BY dh.id, dh.client_center_id, dh.invoice_number, dh.dispatch_date
        ),
        center_aggregates AS (
          SELECT 
            cc.id,
            COALESCE(SUM(hm.dispatched_qty), 0)::int AS center_dispatched,
            COALESCE(SUM(hm.returned_qty), 0)::int AS center_returned,
            COUNT(DISTINCT hm.invoice_number)::int AS center_invoices
          FROM client_centers cc
          LEFT JOIN header_metrics hm ON hm.client_center_id = cc.id
          WHERE cc.is_active = true ${centerCondition}
          GROUP BY cc.id
        )
        SELECT 
          COUNT(*)::int AS "totalCenters",
          COALESCE(SUM(center_dispatched), 0)::int AS "summaryDispatched",
          COALESCE(SUM(center_returned), 0)::int AS "summaryReturned",
          (COALESCE(SUM(center_dispatched), 0) - COALESCE(SUM(center_returned), 0))::int AS "summaryNet",
          COALESCE(SUM(center_invoices), 0)::int AS "summaryInvoices"
        FROM center_aggregates;
      `),
    ]);

    const summaryRow = summaryResult[0] || {
      totalCenters: 0,
      summaryDispatched: 0,
      summaryReturned: 0,
      summaryNet: 0,
      summaryInvoices: 0,
    };

    const total = Number(summaryRow.totalCenters) || 0;
    const totalPages = Math.ceil(total / safeLimit) || 1;

    const data = rows.map((r) => ({
      clientCenterId: r.clientCenterId,
      clientCenterName: r.clientCenterName,
      totalDispatched: Number(r.totalDispatched),
      totalReturned: Number(r.totalReturned),
      netDelivered: Number(r.netDelivered),
      invoicesCount: Number(r.invoicesCount),
    }));

    return {
      success: true,
      data,
      summary: {
        totalDispatched: Number(summaryRow.summaryDispatched),
        totalReturned: Number(summaryRow.summaryReturned),
        netDelivered: Number(summaryRow.summaryNet),
        totalInvoicesCount: Number(summaryRow.summaryInvoices),
      },
      meta: {
        total,
        page: safePage,
        limit: safeLimit,
        totalPages,
      },
    };
  }
}
