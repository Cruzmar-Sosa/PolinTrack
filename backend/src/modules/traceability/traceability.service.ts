import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  QueryTraceabilityDto,
  TraceabilityQueryType,
} from './dto/query-traceability.dto';
import {
  TraceabilityDataDto,
  TraceabilityDispatchDto,
  TraceabilityEdgeDto,
  TraceabilityFumigationDto,
  TraceabilityFumigationItemDto,
  TraceabilityLotStatusDto,
  TraceabilityNodeDto,
  TraceabilityProductionDto,
  TraceabilityRawMaterialDto,
  TraceabilityResponseDto,
  TraceabilityReturnDto,
} from './dto/traceability-response.dto';

@Injectable()
export class TraceabilityService {
  private readonly logger = new Logger(TraceabilityService.name);

  constructor(private readonly prisma: PrismaService) {}

  private mapFumigationItem(
    f: any,
    targetDailyProductionId?: string,
    fallbackProductionDetails?: any[],
  ): TraceabilityFumigationDto {
    const details = f.details || [];
    const relevantDetails = targetDailyProductionId
      ? details.filter((d: any) => d.dailyProductionId === targetDailyProductionId)
      : details;

    const items: TraceabilityFumigationItemDto[] = relevantDetails.map((d: any) => {
      const pName = d.product?.name || 'Polín';
      const quantityFumigated = d.quantityFumigated || 0;
      const quantityProduced =
        d.productionDetail?.quantityProduced ??
        fallbackProductionDetails?.find(
          (pd: any) => pd.productId === d.productId || pd.product?.id === d.productId,
        )?.quantityProduced;

      return {
        productName: pName,
        quantityFumigated,
        quantityProduced,
      };
    });

    const treatedProducts = items.map((it) =>
      it.quantityProduced !== undefined && it.quantityProduced > 0
        ? `${it.productName} (${it.quantityFumigated}/${it.quantityProduced} pcs)`
        : `${it.productName} (${it.quantityFumigated} pcs)`,
    );

    const totalFumigated = items.reduce((sum, it) => sum + it.quantityFumigated, 0);
    const totalProduced = items.reduce((sum, it) => sum + (it.quantityProduced || 0), 0);

    return {
      certificateNumber: f.certificateNumber,
      fumigationDate:
        f.fumigationDate instanceof Date
          ? f.fumigationDate.toISOString().split('T')[0]
          : typeof f.fumigationDate === 'string'
            ? f.fumigationDate.split('T')[0]
            : String(f.fumigationDate),
      certificateDownloadUrl: `/api/v1/fumigations/${f.id}/certificate-url`,
      treatedProducts: treatedProducts.length > 0 ? treatedProducts : undefined,
      items: items.length > 0 ? items : undefined,
      quantityFumigated: totalFumigated > 0 ? totalFumigated : undefined,
      quantityProduced: totalProduced > 0 ? totalProduced : undefined,
    };
  }

  private extractProductionSummary(dp: any) {
    const details =
      dp.productionDetails && dp.productionDetails.length > 0
        ? dp.productionDetails
        : dp.product
          ? [
              {
                product: dp.product,
                quantityProduced: dp.quantityProduced ?? 0,
              },
            ]
          : [];

    const totalProduced =
      details.reduce(
        (sum: number, pd: any) => sum + (pd.quantityProduced || 0),
        0,
      ) ||
      dp.quantityProduced ||
      0;

    const productNames =
      details
        .map((pd: any) => pd.product?.name)
        .filter(Boolean)
        .join(', ') ||
      dp.product?.name ||
      'N/A';

    const productDimensions =
      details
        .map((pd: any) => pd.product?.dimensions)
        .filter(Boolean)
        .join(', ') ||
      dp.product?.dimensions ||
      'N/A';

    return { totalProduced, productNames, productDimensions };
  }

  /**
   * Consulta transversal de trazabilidad bidireccional por lote o factura (UC-TRC-01 / EP-TRC-01).
   * Operación estrictamente READ-ONLY que responde en < 500ms reconstruyendo el DAG.
   */
  async getTraceability(
    query: QueryTraceabilityDto,
  ): Promise<TraceabilityResponseDto> {
    const value = query.queryValue.trim();

    let data: TraceabilityDataDto;

    switch (query.queryType) {
      case TraceabilityQueryType.LOT_PRODUCTION:
        data = await this.traceByProductionLot(value);
        break;
      case TraceabilityQueryType.LOT_WOOD:
        data = await this.traceByWoodLot(value);
        break;
      case TraceabilityQueryType.INVOICE:
        data = await this.traceByInvoice(value);
        break;
      default:
        throw new BadRequestException(
          `Criterio queryType '${query.queryType}' no reconocido`,
        );
    }

    return {
      success: true,
      data,
    };
  }

  /**
   * Trazabilidad desde un Lote de Producción (LT-DDMMYY-WXX).
   * Reconstruye materia prima hacia atrás y fitosanitario/despachos/retornos hacia adelante.
   */
  private async traceByProductionLot(
    lotNumber: string,
  ): Promise<TraceabilityDataDto> {
    const dp = await this.prisma.dailyProduction.findFirst({
      where: { productionLot: lotNumber },
      orderBy: [{ productionDate: 'desc' }, { createdAt: 'desc' }],
      include: {
        productionDetails: {
          include: { product: true },
        },
        createdBy: { select: { fullName: true } },
        productionWoodReceipts: {
          include: {
            woodReceipt: {
              include: {
                supplier: true,
                species: true,
                woodType: true,
              },
            },
          },
        },
        fumigations: {
          orderBy: { fumigationDate: 'desc' },
          include: {
            details: {
              include: { product: true, productionDetail: true },
            },
          },
        },
        fumigationDetails: {
          include: {
            fumigation: {
              include: {
                details: {
                  include: { product: true, productionDetail: true },
                },
              },
            },
            product: true,
            productionDetail: true,
          },
        },
        dispatchDetails: {
          include: {
            product: true,
            dispatchHeader: {
              include: {
                clientCenter: true,
              },
            },
            returnDetails: {
              include: {
                product: true,
                returnHeader: {
                  include: {
                    registeredBy: { select: { fullName: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!dp) {
      throw new NotFoundException({
        code: 'TRACEABILITY_NOT_FOUND',
        message: `No se encontró ningún registro para el criterio especificado (Lote de producción: '${lotNumber}')`,
      });
    }

    const { totalProduced, productNames, productDimensions } =
      this.extractProductionSummary(dp);

    const production: TraceabilityProductionDto = {
      lot: dp.productionLot,
      product: productNames,
      dimensions: productDimensions,
      productionDate: dp.productionDate.toISOString().split('T')[0],
      isoWeek: dp.isoWeek,
      quantityProduced: totalProduced,
      supervisor: dp.createdBy.fullName,
      products: dp.productionDetails && dp.productionDetails.length > 0
        ? dp.productionDetails.map((pd: any) => ({
            productId: pd.productId || pd.product?.id,
            productName: pd.product?.name || 'Polín',
            dimensions: pd.product?.dimensions ?? pd.dimensions ?? null,
            quantityProduced: pd.quantityProduced,
          }))
        : [
            {
              productId: (dp as any).productId || 'default',
              productName: productNames,
              dimensions: productDimensions,
              quantityProduced: totalProduced,
            },
          ],
      totalProduced,
    };

    const rawMaterialOrigin: TraceabilityRawMaterialDto[] =
      dp.productionWoodReceipts.map((pwr) => ({
        lotNumber: pwr.woodReceipt.lotNumber,
        supplierName: pwr.woodReceipt.supplier.name,
        species: pwr.woodReceipt.species.name,
        woodType: pwr.woodReceipt.woodType.name,
        quantity: Number(pwr.woodReceipt.quantity),
        unit: pwr.woodReceipt.unit,
        yugosQuantity: pwr.woodReceipt.yugosQuantity,
        reglasQuantity: pwr.woodReceipt.reglasQuantity,
        receiptDate: pwr.woodReceipt.receiptDate.toISOString().split('T')[0],
      }));

    const fumigationsMap = new Map<string, TraceabilityFumigationDto>();
    for (const f of dp.fumigations) {
      if (!fumigationsMap.has(f.id)) {
        fumigationsMap.set(
          f.id,
          this.mapFumigationItem(f, dp.id, dp.productionDetails),
        );
      }
    }
    for (const fd of (dp as any).fumigationDetails || []) {
      const f = fd.fumigation;
      if (f && !fumigationsMap.has(f.id)) {
        fumigationsMap.set(
          f.id,
          this.mapFumigationItem(f, dp.id, dp.productionDetails),
        );
      }
    }
    const fumigations: TraceabilityFumigationDto[] = Array.from(fumigationsMap.values());

    const dispatchesMap = new Map<string, TraceabilityDispatchDto>();
    let totalDispatched = 0;

    for (const dd of dp.dispatchDetails) {
      totalDispatched += dd.quantityDispatched;
      const inv = dd.dispatchHeader.invoiceNumber;
      if (!dispatchesMap.has(inv)) {
        dispatchesMap.set(inv, {
          invoiceNumber: inv,
          clientCenter: dd.dispatchHeader.clientCenter.name,
          dispatchDate: dd.dispatchHeader.dispatchDate.toISOString().split('T')[0],
          quantityDispatched: 0,
          driverName: dd.dispatchHeader.driverName,
          details: [],
          totalDispatched: 0,
        });
      }
      const disp = dispatchesMap.get(inv)!;
      disp.quantityDispatched += dd.quantityDispatched;
      disp.totalDispatched = (disp.totalDispatched || 0) + dd.quantityDispatched;
      disp.details!.push({
        productId: dd.productId || (dd.product?.id ?? 'unknown'),
        productName: dd.product?.name || 'Polín',
        dimensions: dd.dimensions ?? dd.product?.dimensions ?? null,
        quantityDispatched: dd.quantityDispatched,
      });
    }

    const dispatches: TraceabilityDispatchDto[] = Array.from(dispatchesMap.values());

    const returnsMap = new Map<string, TraceabilityReturnDto>();
    let totalReturned = 0;

    for (const dd of dp.dispatchDetails) {
      for (const rd of dd.returnDetails) {
        totalReturned += rd.quantityReturned;
        const rh = rd.returnHeader;
        const retHeaderId = rh.id;
        if (!returnsMap.has(retHeaderId)) {
          returnsMap.set(retHeaderId, {
            invoiceNumber: dd.dispatchHeader.invoiceNumber,
            clientCenter: dd.dispatchHeader.clientCenter?.name,
            returnDate: rh.returnDate.toISOString().split('T')[0],
            quantityReturned: 0,
            destination: rd.destination,
            reason: rh.reason,
            registeredBy: rh.registeredBy.fullName,
            details: [],
            totalReturned: 0,
          });
        }
        const ret = returnsMap.get(retHeaderId)!;
        ret.quantityReturned += rd.quantityReturned;
        ret.totalReturned = (ret.totalReturned || 0) + rd.quantityReturned;
        ret.details!.push({
          productId: rd.productId || (rd.product?.id ?? 'unknown'),
          productName: rd.product?.name || dd.product?.name || 'Polín',
          dimensions: rd.product?.dimensions ?? dd.dimensions ?? dd.product?.dimensions ?? null,
          quantityReturned: rd.quantityReturned,
          destination: rd.destination,
        });
      }
    }

    const returns: TraceabilityReturnDto[] = Array.from(returnsMap.values());

    const currentlyDelivered = Math.max(0, totalDispatched - totalReturned);
    const availableInYard = Math.max(0, totalProduced - currentlyDelivered);

    const currentLotStatus: TraceabilityLotStatusDto = {
      initialProduced: totalProduced,
      currentlyDelivered,
      availableInYard,
    };

    // Construcción del grafo visual DAG (Nodes & Edges)
    const nodesMap = new Map<string, TraceabilityNodeDto>();
    const edgesMap = new Map<string, TraceabilityEdgeDto>();

    // Nodo central de producción
    const prodNodeId = `prod-${dp.id}`;
    nodesMap.set(prodNodeId, {
      id: prodNodeId,
      type: 'DAILY_PRODUCTION',
      label: `Lote ${dp.productionLot}`,
      data: {
        product: productNames,
        quantityProduced: totalProduced,
        productionDate: production.productionDate,
        isoWeek: dp.isoWeek,
      },
    });

    // Nodos de materia prima (WoodReceipts)
    for (const pwr of dp.productionWoodReceipts) {
      const wr = pwr.woodReceipt;
      const wrNodeId = `wood-${wr.id}`;
      if (!nodesMap.has(wrNodeId)) {
        nodesMap.set(wrNodeId, {
          id: wrNodeId,
          type: 'WOOD_RECEIPT',
          label: `Madera ${wr.lotNumber}`,
          data: {
            supplier: wr.supplier.name,
            species: wr.species.name,
            woodType: wr.woodType.name,
            quantity: Number(wr.quantity),
            unit: wr.unit,
          },
        });
      }
      const edgeId = `e-${wrNodeId}-${prodNodeId}`;
      edgesMap.set(edgeId, {
        id: edgeId,
        source: wrNodeId,
        target: prodNodeId,
        relationship: 'SUPPLIES',
      });
    }

    // Nodos de fumigaciones
    for (const f of fumigations) {
      const fumNodeId = `fum-${f.certificateNumber}`;
      const piecesText =
        f.quantityProduced && f.quantityFumigated
          ? `${f.quantityFumigated} de ${f.quantityProduced} pcs`
          : f.quantityFumigated
            ? `${f.quantityFumigated} pcs`
            : undefined;

      nodesMap.set(fumNodeId, {
        id: fumNodeId,
        type: 'FUMIGATION',
        label: `Cert. ${f.certificateNumber}`,
        data: {
          fumigationDate: f.fumigationDate,
          certificateNumber: f.certificateNumber,
          treatedProducts: f.treatedProducts,
          items: f.items,
          quantityFumigated: f.quantityFumigated,
          quantityProduced: f.quantityProduced,
          treatedPiecesText: piecesText,
        },
      });
      const edgeId = `e-${prodNodeId}-${fumNodeId}`;
      edgesMap.set(edgeId, {
        id: edgeId,
        source: prodNodeId,
        target: fumNodeId,
        relationship: 'TREATED_BY',
      });
    }

    // Nodos de despachos y devoluciones
    for (const dd of dp.dispatchDetails) {
      const dh = dd.dispatchHeader;
      const dispNodeId = `disp-${dh.id}`;
      if (!nodesMap.has(dispNodeId)) {
        nodesMap.set(dispNodeId, {
          id: dispNodeId,
          type: 'DISPATCH',
          label: `Factura ${dh.invoiceNumber}`,
          data: {
            clientCenter: dh.clientCenter.name,
            quantityDispatched: dd.quantityDispatched,
            dispatchDate: dh.dispatchDate.toISOString().split('T')[0],
          },
        });
      }
      const edgeId = `e-${prodNodeId}-${dispNodeId}`;
      edgesMap.set(edgeId, {
        id: edgeId,
        source: prodNodeId,
        target: dispNodeId,
        relationship: 'DISPATCHED_IN',
      });

      for (const rd of dd.returnDetails) {
        const rh = rd.returnHeader;
        const retNodeId = `ret-${rh.id}`;
        if (!nodesMap.has(retNodeId)) {
          nodesMap.set(retNodeId, {
            id: retNodeId,
            type: 'RETURN',
            label: `Devolución ${rh.returnType}`,
            data: {
              quantityReturned: rd.quantityReturned,
              destination: rd.destination,
              reason: rh.reason,
              returnDate: rh.returnDate.toISOString().split('T')[0],
            },
          });
        }
        const retEdgeId = `e-${dispNodeId}-${retNodeId}`;
        edgesMap.set(retEdgeId, {
          id: retEdgeId,
          source: dispNodeId,
          target: retNodeId,
          relationship: 'RETURNED_FROM',
        });
      }
    }

    return {
      queryType: TraceabilityQueryType.LOT_PRODUCTION,
      queryValue: lotNumber,
      production,
      rawMaterialOrigin,
      fumigations,
      dispatches,
      returns,
      currentLotStatus,
      graph: {
        nodes: Array.from(nodesMap.values()),
        edges: Array.from(edgesMap.values()),
      },
    };
  }

  /**
   * Trazabilidad desde un Lote de Madera (LT-DDMMYY-XX).
   * Reconstruye origen y recorre hacia adelante las producciones, fumigaciones y despachos asociados.
   */
  private async traceByWoodLot(lotNumber: string): Promise<TraceabilityDataDto> {
    const wr = await this.prisma.woodReceipt.findFirst({
      where: { lotNumber },
      include: {
        supplier: true,
        species: true,
        woodType: true,
        createdBy: { select: { fullName: true } },
        productionWoodReceipts: {
          include: {
            dailyProduction: {
              include: {
                productionDetails: {
                  include: { product: true },
                },
                createdBy: { select: { fullName: true } },
                fumigations: {
                  orderBy: { fumigationDate: 'desc' },
                  include: {
                    details: {
                      include: { product: true, productionDetail: true },
                    },
                  },
                },
                fumigationDetails: {
                  include: {
                    fumigation: {
                      include: {
                        details: {
                          include: { product: true, productionDetail: true },
                        },
                      },
                    },
                    product: true,
                    productionDetail: true,
                  },
                },
                dispatchDetails: {
                  include: {
                    product: true,
                    dispatchHeader: {
                      include: {
                        clientCenter: true,
                      },
                    },
                    returnDetails: {
                      include: {
                        product: true,
                        returnHeader: {
                          include: {
                            registeredBy: { select: { fullName: true } },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!wr) {
      throw new NotFoundException({
        code: 'TRACEABILITY_NOT_FOUND',
        message: `No se encontró ningún registro para el criterio especificado (Lote de madera: '${lotNumber}')`,
      });
    }

    const rawMaterialOrigin: TraceabilityRawMaterialDto[] = [
      {
        lotNumber: wr.lotNumber,
        supplierName: wr.supplier.name,
        species: wr.species.name,
        woodType: wr.woodType.name,
        quantity: Number(wr.quantity),
        unit: wr.unit,
        yugosQuantity: wr.yugosQuantity,
        reglasQuantity: wr.reglasQuantity,
        receiptDate: wr.receiptDate.toISOString().split('T')[0],
      },
    ];

    let production: TraceabilityProductionDto | null = null;
    const fumigationsMap = new Map<string, TraceabilityFumigationDto>();
    const dispatchesMap = new Map<string, TraceabilityDispatchDto>();
    const returnsMap = new Map<string, TraceabilityReturnDto>();

    let totalProduced = 0;
    let totalDispatched = 0;
    let totalReturned = 0;

    const nodesMap = new Map<string, TraceabilityNodeDto>();
    const edgesMap = new Map<string, TraceabilityEdgeDto>();

    // Nodo raíz de ingreso de madera
    const wrNodeId = `wood-${wr.id}`;
    nodesMap.set(wrNodeId, {
      id: wrNodeId,
      type: 'WOOD_RECEIPT',
      label: `Madera ${wr.lotNumber}`,
      data: {
        supplier: wr.supplier.name,
        species: wr.species.name,
        woodType: wr.woodType.name,
        quantity: Number(wr.quantity),
        unit: wr.unit,
      },
    });

    // Si se usó en producciones, recorrer cada una
    if (wr.productionWoodReceipts.length > 0) {
      const firstDp = wr.productionWoodReceipts[0].dailyProduction;
      const firstSummary = this.extractProductionSummary(firstDp);

      production = {
        lot: firstDp.productionLot,
        product: firstSummary.productNames,
        dimensions: firstSummary.productDimensions,
        productionDate: firstDp.productionDate.toISOString().split('T')[0],
        isoWeek: firstDp.isoWeek,
        quantityProduced: firstSummary.totalProduced,
        supervisor: firstDp.createdBy.fullName,
        products: firstDp.productionDetails && firstDp.productionDetails.length > 0
          ? firstDp.productionDetails.map((pd: any) => ({
              productId: pd.productId || pd.product?.id,
              productName: pd.product?.name || 'Polín',
              dimensions: pd.product?.dimensions ?? pd.dimensions ?? null,
              quantityProduced: pd.quantityProduced,
            }))
          : [
              {
                productId: (firstDp as any).productId || 'default',
                productName: firstSummary.productNames,
                dimensions: firstSummary.productDimensions,
                quantityProduced: firstSummary.totalProduced,
              },
            ],
        totalProduced: firstSummary.totalProduced,
      };

      for (const pwr of wr.productionWoodReceipts) {
        const dp = pwr.dailyProduction;
        const dpSummary = this.extractProductionSummary(dp);

        totalProduced += dpSummary.totalProduced;

        const prodNodeId = `prod-${dp.id}`;
        if (!nodesMap.has(prodNodeId)) {
          nodesMap.set(prodNodeId, {
            id: prodNodeId,
            type: 'DAILY_PRODUCTION',
            label: `Lote ${dp.productionLot}`,
            data: {
              product: dpSummary.productNames,
              quantityProduced: dpSummary.totalProduced,
              productionDate: dp.productionDate.toISOString().split('T')[0],
              isoWeek: dp.isoWeek,
            },
          });
        }
        const edgeId = `e-${wrNodeId}-${prodNodeId}`;
        edgesMap.set(edgeId, {
          id: edgeId,
          source: wrNodeId,
          target: prodNodeId,
          relationship: 'SUPPLIES',
        });

        for (const f of dp.fumigations) {
          if (!fumigationsMap.has(f.id)) {
            const mappedFum = this.mapFumigationItem(f, dp.id, dp.productionDetails);
            fumigationsMap.set(f.id, mappedFum);
            const fumNodeId = `fum-${f.certificateNumber}`;
            const piecesText =
              mappedFum.quantityProduced && mappedFum.quantityFumigated
                ? `${mappedFum.quantityFumigated} de ${mappedFum.quantityProduced} pcs`
                : mappedFum.quantityFumigated
                  ? `${mappedFum.quantityFumigated} pcs`
                  : undefined;
            nodesMap.set(fumNodeId, {
              id: fumNodeId,
              type: 'FUMIGATION',
              label: `Cert. ${f.certificateNumber}`,
              data: {
                certificateNumber: f.certificateNumber,
                fumigationDate: mappedFum.fumigationDate,
                treatedProducts: mappedFum.treatedProducts,
                items: mappedFum.items,
                quantityFumigated: mappedFum.quantityFumigated,
                quantityProduced: mappedFum.quantityProduced,
                treatedPiecesText: piecesText,
              },
            });
            edgesMap.set(`e-${prodNodeId}-${fumNodeId}`, {
              id: `e-${prodNodeId}-${fumNodeId}`,
              source: prodNodeId,
              target: fumNodeId,
              relationship: 'TREATED_BY',
            });
          }
        }

        for (const fd of (dp as any).fumigationDetails || []) {
          const f = fd.fumigation;
          if (f && !fumigationsMap.has(f.id)) {
            const mappedFum = this.mapFumigationItem(f, dp.id, dp.productionDetails);
            fumigationsMap.set(f.id, mappedFum);
            const fumNodeId = `fum-${f.certificateNumber}`;
            const piecesText =
              mappedFum.quantityProduced && mappedFum.quantityFumigated
                ? `${mappedFum.quantityFumigated} de ${mappedFum.quantityProduced} pcs`
                : mappedFum.quantityFumigated
                  ? `${mappedFum.quantityFumigated} pcs`
                  : undefined;
            nodesMap.set(fumNodeId, {
              id: fumNodeId,
              type: 'FUMIGATION',
              label: `Cert. ${f.certificateNumber}`,
              data: {
                certificateNumber: f.certificateNumber,
                fumigationDate: mappedFum.fumigationDate,
                treatedProducts: mappedFum.treatedProducts,
                items: mappedFum.items,
                quantityFumigated: mappedFum.quantityFumigated,
                quantityProduced: mappedFum.quantityProduced,
                treatedPiecesText: piecesText,
              },
            });
            edgesMap.set(`e-${prodNodeId}-${fumNodeId}`, {
              id: `e-${prodNodeId}-${fumNodeId}`,
              source: prodNodeId,
              target: fumNodeId,
              relationship: 'TREATED_BY',
            });
          }
        }

        for (const dd of dp.dispatchDetails) {
          totalDispatched += dd.quantityDispatched;
          const inv = dd.dispatchHeader.invoiceNumber;
          if (!dispatchesMap.has(inv)) {
            dispatchesMap.set(inv, {
              invoiceNumber: inv,
              clientCenter: dd.dispatchHeader.clientCenter.name,
              dispatchDate: dd.dispatchHeader.dispatchDate.toISOString().split('T')[0],
              quantityDispatched: 0,
              driverName: dd.dispatchHeader.driverName,
              details: [],
              totalDispatched: 0,
            });
          }
          const disp = dispatchesMap.get(inv)!;
          disp.quantityDispatched += dd.quantityDispatched;
          disp.totalDispatched = (disp.totalDispatched || 0) + dd.quantityDispatched;
          disp.details!.push({
            productId: dd.productId || (dd.product?.id ?? 'unknown'),
            productName: dd.product?.name || 'Polín',
            dimensions: dd.dimensions ?? dd.product?.dimensions ?? null,
            quantityDispatched: dd.quantityDispatched,
          });

          const dispNodeId = `disp-${dd.dispatchHeader.id}`;
          if (!nodesMap.has(dispNodeId)) {
            nodesMap.set(dispNodeId, {
              id: dispNodeId,
              type: 'DISPATCH',
              label: `Factura ${dd.dispatchHeader.invoiceNumber}`,
              data: {
                clientCenter: dd.dispatchHeader.clientCenter.name,
                quantityDispatched: dd.quantityDispatched,
              },
            });
          } else {
            const existing = nodesMap.get(dispNodeId)!;
            existing.data.quantityDispatched =
              (existing.data.quantityDispatched || 0) + dd.quantityDispatched;
          }
          edgesMap.set(`e-${prodNodeId}-${dispNodeId}`, {
            id: `e-${prodNodeId}-${dispNodeId}`,
            source: prodNodeId,
            target: dispNodeId,
            relationship: 'DISPATCHED_IN',
          });

          for (const rd of dd.returnDetails) {
            totalReturned += rd.quantityReturned;
            const rh = rd.returnHeader;
            const retHeaderId = rh.id;
            if (!returnsMap.has(retHeaderId)) {
              returnsMap.set(retHeaderId, {
                invoiceNumber: dd.dispatchHeader.invoiceNumber,
                clientCenter: dd.dispatchHeader.clientCenter?.name,
                returnDate: rh.returnDate.toISOString().split('T')[0],
                quantityReturned: 0,
                destination: rd.destination,
                reason: rh.reason,
                registeredBy: rh.registeredBy.fullName,
                details: [],
                totalReturned: 0,
              });
            }
            const ret = returnsMap.get(retHeaderId)!;
            ret.quantityReturned += rd.quantityReturned;
            ret.totalReturned = (ret.totalReturned || 0) + rd.quantityReturned;
            ret.details!.push({
              productId: rd.productId || (rd.product?.id ?? 'unknown'),
              productName: rd.product?.name || dd.product?.name || 'Polín',
              dimensions: rd.product?.dimensions ?? dd.dimensions ?? dd.product?.dimensions ?? null,
              quantityReturned: rd.quantityReturned,
              destination: rd.destination,
            });

            const retNodeId = `ret-${rd.returnHeader.id}`;
            if (!nodesMap.has(retNodeId)) {
              nodesMap.set(retNodeId, {
                id: retNodeId,
                type: 'RETURN',
                label: `Devolución ${rd.returnHeader.returnType}`,
                data: {
                  quantityReturned: rd.quantityReturned,
                  destination: rd.destination,
                  reason: rd.returnHeader.reason,
                },
              });
            } else {
              const existing = nodesMap.get(retNodeId)!;
              existing.data.quantityReturned =
                (existing.data.quantityReturned || 0) + rd.quantityReturned;
            }
            edgesMap.set(`e-${dispNodeId}-${retNodeId}`, {
              id: `e-${dispNodeId}-${retNodeId}`,
              source: dispNodeId,
              target: retNodeId,
              relationship: 'RETURNED_FROM',
            });
          }
        }
      }
    }

    const dispatches: TraceabilityDispatchDto[] = Array.from(dispatchesMap.values());
    const returns: TraceabilityReturnDto[] = Array.from(returnsMap.values());

    const currentlyDelivered = Math.max(0, totalDispatched - totalReturned);
    const availableInYard = Math.max(0, totalProduced - currentlyDelivered);

    const currentLotStatus: TraceabilityLotStatusDto | null =
      wr.productionWoodReceipts.length > 0
        ? {
            initialProduced: totalProduced,
            currentlyDelivered,
            availableInYard,
          }
        : null;

    return {
      queryType: TraceabilityQueryType.LOT_WOOD,
      queryValue: lotNumber,
      production,
      rawMaterialOrigin,
      fumigations: Array.from(fumigationsMap.values()),
      dispatches,
      returns,
      currentLotStatus,
      graph: {
        nodes: Array.from(nodesMap.values()),
        edges: Array.from(edgesMap.values()),
      },
    };
  }

  /**
   * Trazabilidad desde una Factura de Despacho (invoiceNumber).
   * Reconstruye devoluciones asociadas y recorre hacia atrás los lotes de producción, fumigaciones y madera.
   */
  private async traceByInvoice(
    invoiceNumber: string,
  ): Promise<TraceabilityDataDto> {
    const dh = await this.prisma.dispatchHeader.findUnique({
      where: { invoiceNumber },
      include: {
        clientCenter: true,
        createdBy: { select: { fullName: true } },
        dispatchDetails: {
          include: {
            product: true,
            dailyProduction: {
              include: {
                productionDetails: {
                  include: { product: true },
                },
                createdBy: { select: { fullName: true } },
                fumigations: {
                  orderBy: { fumigationDate: 'desc' },
                  include: {
                    details: {
                      include: { product: true, productionDetail: true },
                    },
                  },
                },
                fumigationDetails: {
                  include: {
                    fumigation: {
                      include: {
                        details: {
                          include: { product: true, productionDetail: true },
                        },
                      },
                    },
                    product: true,
                    productionDetail: true,
                  },
                },
                productionWoodReceipts: {
                  include: {
                    woodReceipt: {
                      include: {
                        supplier: true,
                        species: true,
                        woodType: true,
                      },
                    },
                  },
                },
              },
            },
            returnDetails: {
              include: {
                product: true,
                returnHeader: {
                  include: {
                    registeredBy: { select: { fullName: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!dh) {
      throw new NotFoundException({
        code: 'TRACEABILITY_NOT_FOUND',
        message: `No se encontró ningún registro para el criterio especificado (Factura: '${invoiceNumber}')`,
      });
    }

    const dispatches: TraceabilityDispatchDto[] = [
      {
        invoiceNumber: dh.invoiceNumber,
        clientCenter: dh.clientCenter.name,
        dispatchDate: dh.dispatchDate.toISOString().split('T')[0],
        quantityDispatched: dh.dispatchDetails.reduce(
          (sum, d) => sum + d.quantityDispatched,
          0,
        ),
        driverName: dh.driverName,
        details: dh.dispatchDetails.map((dd) => ({
          productId: dd.productId || (dd.product?.id ?? 'unknown'),
          productName: dd.product?.name || 'Polín',
          dimensions: dd.dimensions ?? dd.product?.dimensions ?? null,
          quantityDispatched: dd.quantityDispatched,
        })),
        totalDispatched: dh.dispatchDetails.reduce(
          (sum, d) => sum + d.quantityDispatched,
          0,
        ),
      },
    ];

    const returnsMap = new Map<string, TraceabilityReturnDto>();
    const rawMaterialMap = new Map<string, TraceabilityRawMaterialDto>();
    const fumigationsMap = new Map<string, TraceabilityFumigationDto>();

    let totalDispatched = 0;
    let totalReturned = 0;
    let totalProduced = 0;
    let primaryProduction: TraceabilityProductionDto | null = null;

    const nodesMap = new Map<string, TraceabilityNodeDto>();
    const edgesMap = new Map<string, TraceabilityEdgeDto>();

    // Nodo de despacho
    const dispNodeId = `disp-${dh.id}`;
    nodesMap.set(dispNodeId, {
      id: dispNodeId,
      type: 'DISPATCH',
      label: `Factura ${dh.invoiceNumber}`,
      data: {
        clientCenter: dh.clientCenter.name,
        dispatchDate: dh.dispatchDate.toISOString().split('T')[0],
        driver: dh.driverName,
      },
    });

    for (const dd of dh.dispatchDetails) {
      totalDispatched += dd.quantityDispatched;

      for (const rd of dd.returnDetails) {
        totalReturned += rd.quantityReturned;
        const rh = rd.returnHeader;
        const retHeaderId = rh.id;
        if (!returnsMap.has(retHeaderId)) {
          returnsMap.set(retHeaderId, {
            invoiceNumber: dh.invoiceNumber,
            clientCenter: dh.clientCenter?.name,
            returnDate: rh.returnDate.toISOString().split('T')[0],
            quantityReturned: 0,
            destination: rd.destination,
            reason: rh.reason,
            registeredBy: rh.registeredBy.fullName,
            details: [],
            totalReturned: 0,
          });
        }
        const ret = returnsMap.get(retHeaderId)!;
        ret.quantityReturned += rd.quantityReturned;
        ret.totalReturned = (ret.totalReturned || 0) + rd.quantityReturned;
        ret.details!.push({
          productId: rd.productId || (rd.product?.id ?? 'unknown'),
          productName: rd.product?.name || dd.product?.name || 'Polín',
          dimensions: rd.product?.dimensions ?? dd.dimensions ?? dd.product?.dimensions ?? null,
          quantityReturned: rd.quantityReturned,
          destination: rd.destination,
        });

        const retNodeId = `ret-${rd.returnHeader.id}`;
        if (!nodesMap.has(retNodeId)) {
          nodesMap.set(retNodeId, {
            id: retNodeId,
            type: 'RETURN',
            label: `Devolución ${rd.returnHeader.returnType}`,
            data: {
              quantityReturned: rd.quantityReturned,
              destination: rd.destination,
              reason: rd.returnHeader.reason,
            },
          });
        } else {
          const existing = nodesMap.get(retNodeId)!;
          existing.data.quantityReturned =
            (existing.data.quantityReturned || 0) + rd.quantityReturned;
        }
        edgesMap.set(`e-${dispNodeId}-${retNodeId}`, {
          id: `e-${dispNodeId}-${retNodeId}`,
          source: dispNodeId,
          target: retNodeId,
          relationship: 'RETURNED_FROM',
        });
      }

      // Conexión hacia el lote de producción
      const dp = dd.dailyProduction;
      if (dp) {
        const dpSummary = this.extractProductionSummary(dp);

        totalProduced += dpSummary.totalProduced;
        if (!primaryProduction) {
          primaryProduction = {
            lot: dp.productionLot,
            product: dpSummary.productNames,
            dimensions: dpSummary.productDimensions,
            productionDate: dp.productionDate.toISOString().split('T')[0],
            isoWeek: dp.isoWeek,
            quantityProduced: dpSummary.totalProduced,
            supervisor: dp.createdBy.fullName,
            products: dp.productionDetails && dp.productionDetails.length > 0
              ? dp.productionDetails.map((pd: any) => ({
                  productId: pd.productId || pd.product?.id,
                  productName: pd.product?.name || 'Polín',
                  dimensions: pd.product?.dimensions ?? pd.dimensions ?? null,
                  quantityProduced: pd.quantityProduced,
                }))
              : [
                  {
                    productId: (dp as any).productId || 'default',
                    productName: dpSummary.productNames,
                    dimensions: dpSummary.productDimensions,
                    quantityProduced: dpSummary.totalProduced,
                  },
                ],
            totalProduced: dpSummary.totalProduced,
          };
        }

        const prodNodeId = `prod-${dp.id}`;
        if (!nodesMap.has(prodNodeId)) {
          nodesMap.set(prodNodeId, {
            id: prodNodeId,
            type: 'DAILY_PRODUCTION',
            label: `Lote ${dp.productionLot}`,
            data: {
              product: dpSummary.productNames,
              quantityProduced: dpSummary.totalProduced,
            },
          });
        }
        edgesMap.set(`e-${prodNodeId}-${dispNodeId}`, {
          id: `e-${prodNodeId}-${dispNodeId}`,
          source: prodNodeId,
          target: dispNodeId,
          relationship: 'DISPATCHED_IN',
        });

        // Fumigaciones
        for (const f of dp.fumigations) {
          if (!fumigationsMap.has(f.id)) {
            const mappedFum = this.mapFumigationItem(f, dp.id, dp.productionDetails);
            fumigationsMap.set(f.id, mappedFum);
            const fumNodeId = `fum-${f.certificateNumber}`;
            const piecesText =
              mappedFum.quantityProduced && mappedFum.quantityFumigated
                ? `${mappedFum.quantityFumigated} de ${mappedFum.quantityProduced} pcs`
                : mappedFum.quantityFumigated
                  ? `${mappedFum.quantityFumigated} pcs`
                  : undefined;
            nodesMap.set(fumNodeId, {
              id: fumNodeId,
              type: 'FUMIGATION',
              label: `Cert. ${f.certificateNumber}`,
              data: {
                certificateNumber: f.certificateNumber,
                fumigationDate: mappedFum.fumigationDate,
                treatedProducts: mappedFum.treatedProducts,
                items: mappedFum.items,
                quantityFumigated: mappedFum.quantityFumigated,
                quantityProduced: mappedFum.quantityProduced,
                treatedPiecesText: piecesText,
              },
            });
            edgesMap.set(`e-${prodNodeId}-${fumNodeId}`, {
              id: `e-${prodNodeId}-${fumNodeId}`,
              source: prodNodeId,
              target: fumNodeId,
              relationship: 'TREATED_BY',
            });
          }
        }

        for (const fd of (dp as any).fumigationDetails || []) {
          const f = fd.fumigation;
          if (f && !fumigationsMap.has(f.id)) {
            const mappedFum = this.mapFumigationItem(f, dp.id, dp.productionDetails);
            fumigationsMap.set(f.id, mappedFum);
            const fumNodeId = `fum-${f.certificateNumber}`;
            const piecesText =
              mappedFum.quantityProduced && mappedFum.quantityFumigated
                ? `${mappedFum.quantityFumigated} de ${mappedFum.quantityProduced} pcs`
                : mappedFum.quantityFumigated
                  ? `${mappedFum.quantityFumigated} pcs`
                  : undefined;
            nodesMap.set(fumNodeId, {
              id: fumNodeId,
              type: 'FUMIGATION',
              label: `Cert. ${f.certificateNumber}`,
              data: {
                certificateNumber: f.certificateNumber,
                fumigationDate: mappedFum.fumigationDate,
                treatedProducts: mappedFum.treatedProducts,
                items: mappedFum.items,
                quantityFumigated: mappedFum.quantityFumigated,
                quantityProduced: mappedFum.quantityProduced,
                treatedPiecesText: piecesText,
              },
            });
            edgesMap.set(`e-${prodNodeId}-${fumNodeId}`, {
              id: `e-${prodNodeId}-${fumNodeId}`,
              source: prodNodeId,
              target: fumNodeId,
              relationship: 'TREATED_BY',
            });
          }
        }

        // Madera de origen
        for (const pwr of dp.productionWoodReceipts) {
          const wr = pwr.woodReceipt;
          if (!rawMaterialMap.has(wr.id)) {
            rawMaterialMap.set(wr.id, {
              lotNumber: wr.lotNumber,
              supplierName: wr.supplier.name,
              species: wr.species.name,
              woodType: wr.woodType.name,
              quantity: Number(wr.quantity),
              unit: wr.unit,
              yugosQuantity: wr.yugosQuantity,
              reglasQuantity: wr.reglasQuantity,
              receiptDate: wr.receiptDate.toISOString().split('T')[0],
            });

            const wrNodeId = `wood-${wr.id}`;
            nodesMap.set(wrNodeId, {
              id: wrNodeId,
              type: 'WOOD_RECEIPT',
              label: `Madera ${wr.lotNumber}`,
              data: {
                supplier: wr.supplier.name,
                species: wr.species.name,
              },
            });
            edgesMap.set(`e-${wrNodeId}-${prodNodeId}`, {
              id: `e-${wrNodeId}-${prodNodeId}`,
              source: wrNodeId,
              target: prodNodeId,
              relationship: 'SUPPLIES',
            });
          }
        }
      }
    }

    const currentlyDelivered = Math.max(0, totalDispatched - totalReturned);
    const availableInYard = Math.max(0, totalProduced - currentlyDelivered);

    const currentLotStatus: TraceabilityLotStatusDto = {
      initialProduced: totalProduced,
      currentlyDelivered,
      availableInYard,
    };

    return {
      queryType: TraceabilityQueryType.INVOICE,
      queryValue: invoiceNumber,
      production: primaryProduction,
      rawMaterialOrigin: Array.from(rawMaterialMap.values()),
      fumigations: Array.from(fumigationsMap.values()),
      dispatches,
      returns: Array.from(returnsMap.values()),
      currentLotStatus,
      graph: {
        nodes: Array.from(nodesMap.values()),
        edges: Array.from(edgesMap.values()),
      },
    };
  }
}
