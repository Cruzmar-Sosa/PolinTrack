import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { QueryDashboardDto } from './dto/query-dashboard.dto';
import { DashboardResponseDto } from './dto/dashboard-response.dto';
import { validateDateRange } from '../reports/dto/date-range.dto';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Consulta consolidada de los 5 indicadores clave de planta en tiempo real (EP-DSH-01 / UC-DSH-01).
   * Operación 100% READ-ONLY que consulta el ledger append-only y tablas operativas.
   */
  async getKpis(query: QueryDashboardDto): Promise<DashboardResponseDto> {
    // 1. Validación de fechas (RN-007) y establecimiento de período por defecto (mes en curso)
    let periodStart: Date;
    let periodEnd: Date;

    if (query.startDate || query.endDate) {
      const { start, end } = validateDateRange(query.startDate, query.endDate);
      const now = new Date();
      periodStart = start ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      periodEnd = end ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    } else {
      const now = new Date();
      periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    }

    // 2. Ejecución concurrente de las consultas agregadas para máximo rendimiento
    const [products, movementSums, woodReceipts, dispatchDetails, clientCenters] =
      await Promise.all([
        // KPI 1: Productos activos
        this.prisma.product.findMany({
          where: { isActive: true },
          orderBy: { dimensions: 'asc' },
        }),

        // KPI 1: Saldos vivos desde el ledger (RN-010)
        this.prisma.inventoryMovement.groupBy({
          by: ['productId'],
          _sum: { deltaQuantity: true },
        }),

        // KPI 2: Ingresos de madera en el período
        this.prisma.woodReceipt.findMany({
          where: {
            receiptDate: {
              gte: periodStart,
              lte: periodEnd,
            },
          },
          include: { woodType: true },
        }),

        // KPI 3, 4 y 5: Despachos en el período con centro cliente
        this.prisma.dispatchDetail.findMany({
          where: {
            dispatchHeader: {
              dispatchDate: {
                gte: periodStart,
                lte: periodEnd,
              },
            },
          },
          select: {
            quantityDispatched: true,
            dispatchHeader: {
              select: {
                clientCenterId: true,
              },
            },
          },
        }),

        // KPI 5: Las 7 Plantas Cliente
        this.prisma.clientCenter.findMany({
          where: { isActive: true },
          orderBy: { name: 'asc' },
        }),
      ]);

    // KPI 1: Inventario Actual
    const stockMap = new Map<string, number>();
    for (const m of movementSums) {
      stockMap.set(m.productId, m._sum.deltaQuantity ?? 0);
    }

    let totalInventoryPieces = 0;
    const byProduct = products.map((p) => {
      const stock = stockMap.get(p.id) ?? 0;
      totalInventoryPieces += stock;
      return {
        productId: p.id,
        productName: p.name,
        dimensions: p.dimensions,
        stock,
      };
    });

    // KPI 2: Entradas de Madera en el período (Timbre pt vs Procesada pcs)
    let timbrePieTablarTotal = 0;
    let procesadaPiecesTotal = 0;

    for (const wr of woodReceipts) {
      const qty = Number(wr.quantity);
      if (
        wr.unit === 'PIE_TABLAR' ||
        wr.woodType?.name?.toUpperCase() === 'TIMBRE'
      ) {
        timbrePieTablarTotal += qty;
      } else {
        procesadaPiecesTotal += qty;
      }
    }

    // KPI 3 & 4: Salidas de polines en piezas y equivalente despachado
    let totalPiecesDispatched = 0;
    const centerPiecesMap = new Map<string, number>();

    for (const dd of dispatchDetails) {
      totalPiecesDispatched += dd.quantityDispatched;
      const ccId = dd.dispatchHeader.clientCenterId;
      centerPiecesMap.set(
        ccId,
        (centerPiecesMap.get(ccId) ?? 0) + dd.quantityDispatched,
      );
    }

    // KPI 5: Salidas por cada una de las 7 plantas cliente
    const kpi5_dispatchesByClientCenter = clientCenters.map((cc) => ({
      centerName: cc.name,
      pieces: centerPiecesMap.get(cc.id) ?? 0,
    }));

    return {
      success: true,
      data: {
        kpi1_currentInventory: {
          totalPieces: totalInventoryPieces,
          byProduct,
        },
        kpi2_woodReceipts: {
          timbrePieTablarTotal: Number(timbrePieTablarTotal.toFixed(2)),
          procesadaPiecesTotal: Number(procesadaPiecesTotal.toFixed(2)),
        },
        kpi3_polinesDispatched: {
          totalPieces: totalPiecesDispatched,
        },
        kpi4_woodDispatchedEquivalent: {
          totalDispatchedEquivalent: totalPiecesDispatched,
        },
        kpi5_dispatchesByClientCenter,
      },
    };
  }
}
