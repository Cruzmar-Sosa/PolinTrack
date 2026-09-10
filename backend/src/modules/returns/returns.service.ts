import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DispatchStatus, MovementType, ReturnTypeEnum } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { InventoryLedgerService } from '../inventory/inventory-ledger.service';
import { CreateReturnHeaderDto } from './dto/create-return.dto';
import { QueryReturnDto } from './dto/query-return.dto';
import { PaginatedReturnResponseDto } from './dto/return-response.dto';

@Injectable()
export class ReturnsService {
  private readonly logger = new Logger(ReturnsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryLedgerService: InventoryLedgerService,
  ) {}

  /**
   * Registra una devolución comercial no destructiva vinculada a un despacho existente (UC-RET-01 / EP-RET-01).
   * Ejecuta bloqueo pesimista a nivel de fila para evitar condiciones de carrera,
   * valida que la cantidad devuelta no supere el remanente despachado, incrementa el stock en el ledger (+N)
   * y preserva la inmutabilidad histórica del despacho original (RN-001, RN-010, RN-013).
   */
  async create(
    dto: CreateReturnHeaderDto,
    user: { id: string; email: string; role: string },
  ) {
    // 1. Validación previa: Existencia del despacho original
    const dispatchHeader = await this.prisma.dispatchHeader.findUnique({
      where: { id: dto.dispatchHeaderId },
      include: {
        dispatchDetails: true,
        clientCenter: true,
      },
    });

    if (!dispatchHeader) {
      throw new NotFoundException({
        code: 'DISPATCH_NOT_FOUND',
        message: `El despacho original con ID '${dto.dispatchHeaderId}' no existe en el sistema`,
      });
    }

    // 2. Validación cronológica de fecha calendario: returnDate >= dispatchDate (FA-02, RN-013)
    const returnCalendarDate = dto.returnDate.trim().split('T')[0];
    const dispatchCalendarDate = (
      dispatchHeader.dispatchDate instanceof Date
        ? dispatchHeader.dispatchDate.toISOString()
        : String(dispatchHeader.dispatchDate)
    ).split('T')[0];

    if (returnCalendarDate < dispatchCalendarDate) {
      throw new BadRequestException({
        code: 'INVALID_RETURN_DATE',
        message: `La fecha de devolución (${returnCalendarDate}) no puede ser anterior a la fecha original del despacho (${dispatchCalendarDate}) [FA-02]`,
      });
    }

    const returnDateObj = new Date(returnCalendarDate + 'T00:00:00.000Z');

    // 3. Validación de pertenencia: todos los dispatchDetailId deben pertenecer a este despacho
    const validDetailIds = new Set(dispatchHeader.dispatchDetails.map((d) => d.id));
    for (const detail of dto.details) {
      if (!validDetailIds.has(detail.dispatchDetailId)) {
        throw new BadRequestException({
          code: 'DETAIL_NOT_IN_DISPATCH',
          message: `La línea de detalle con ID '${detail.dispatchDetailId}' no pertenece al despacho '${dispatchHeader.invoiceNumber}'`,
        });
      }
    }

    // 4. Consolidación de piezas devueltas por línea de detalle
    const returnedByDetail = new Map<string, number>();
    for (const item of dto.details) {
      const cur = returnedByDetail.get(item.dispatchDetailId) || 0;
      returnedByDetail.set(item.dispatchDetailId, cur + item.quantityReturned);
    }

    // 5. Transacción atómica con bloqueo pesimista ordenado para prevenir race conditions
    const sortedDetailIds = [...returnedByDetail.keys()].sort();

    const createdReturn = await this.prisma.$transaction(async (tx) => {
      // Bloqueo pesimista a nivel de fila en orden determinístico sobre las líneas del despacho
      for (const detId of sortedDetailIds) {
        await tx.$queryRaw`SELECT id, quantity_dispatched, quantity_returned_accumulated FROM dispatch_details WHERE id = ${detId}::uuid FOR UPDATE`;
      }

      // Obtener el estado fresco de todas las líneas del despacho dentro de la transacción
      const freshDetails = await tx.dispatchDetail.findMany({
        where: { dispatchHeaderId: dto.dispatchHeaderId },
        include: { product: true },
      });

      const freshDetailsMap = new Map(freshDetails.map((d) => [d.id, d]));

      // Validación estricta de remanente disponible para devolver en cada línea (RN-013, D-020)
      for (const [detId, qtyReturned] of returnedByDetail.entries()) {
        const line = freshDetailsMap.get(detId)!;
        const availableToReturn = line.quantityDispatched - line.quantityReturnedAccumulated;

        if (qtyReturned > availableToReturn) {
          throw new BadRequestException({
            code: 'RETURN_QUANTITY_EXCEEDS_DISPATCHED',
            message: `La cantidad a devolver (${qtyReturned}) supera el remanente despachado disponible (${availableToReturn}) para el producto '${line.product.name}' (RN-013)`,
          });
        }
      }

      // Determinación precisa del tipo de devolución (TOTAL vs PARCIAL)
      let totalDispatchedAllLines = 0;
      let totalReturnedAllLinesAfter = 0;

      for (const line of freshDetails) {
        totalDispatchedAllLines += line.quantityDispatched;
        const additionalReturn = returnedByDetail.get(line.id) || 0;
        totalReturnedAllLinesAfter += line.quantityReturnedAccumulated + additionalReturn;
      }

      const isTotalReturn = totalReturnedAllLinesAfter === totalDispatchedAllLines;
      const returnType = isTotalReturn ? ReturnTypeEnum.TOTAL : ReturnTypeEnum.PARCIAL;
      const newDispatchStatus = isTotalReturn
        ? DispatchStatus.RETURNED_TOTAL
        : DispatchStatus.RETURNED_PARTIAL;

      // Inserción de la nueva cabecera de devolución (ReturnHeader)
      const returnHeader = await tx.returnHeader.create({
        data: {
          dispatchHeaderId: dto.dispatchHeaderId,
          returnDate: returnDateObj,
          returnType,
          reason: dto.reason.trim(),
          observations: dto.observations?.trim() || null,
          registeredById: user.id,
        },
      });

      // Inserción de líneas de devolución, actualización de acumulador y emisión en el ledger
      for (const item of dto.details) {
        const line = freshDetailsMap.get(item.dispatchDetailId)!;

        // Inserción de ReturnDetail
        const createdReturnDetail = await tx.returnDetail.create({
          data: {
            returnHeaderId: returnHeader.id,
            dispatchDetailId: item.dispatchDetailId,
            productId: line.productId,
            quantityReturned: item.quantityReturned,
          },
        });

        // Actualización atómica del contador acumulado en DispatchDetail
        // Regla RN-001: quantityDispatched PERMANECE 100% INTACTO
        await tx.dispatchDetail.update({
          where: { id: item.dispatchDetailId },
          data: {
            quantityReturnedAccumulated: {
              increment: item.quantityReturned,
            },
          },
        });

        // Reincorporación de inventario en el ledger append-only (MovementType.RETURN, +deltaQuantity, RN-010)
        await this.inventoryLedgerService.recordMovement(
          {
            productId: line.productId,
            movementType: MovementType.RETURN,
            quantity: item.quantityReturned,
            referenceTable: 'return_details',
            referenceId: createdReturnDetail.id,
            performedById: user.id,
          },
          tx,
        );
      }

      // Actualización informativa del estado del despacho (RN-013)
      await tx.dispatchHeader.update({
        where: { id: dto.dispatchHeaderId },
        data: { status: newDispatchStatus },
      });

      // Registro de auditoría técnica forense (AuditLog)
      const totalPiecesReturned = dto.details.reduce((sum, d) => sum + d.quantityReturned, 0);
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'CREATE',
          tableName: 'return_headers',
          recordId: returnHeader.id,
          newValues: JSON.stringify({
            id: returnHeader.id,
            dispatchHeaderId: returnHeader.dispatchHeaderId,
            invoiceNumber: dispatchHeader.invoiceNumber,
            clientCenterName: dispatchHeader.clientCenter.name,
            returnDate: dto.returnDate,
            returnType,
            reason: returnHeader.reason,
            linesCount: dto.details.length,
            totalQuantityReturned: totalPiecesReturned,
            newDispatchStatus,
          }),
        },
      });

      this.logger.log(
        `✅ Devolución comercial registrada: ID=${returnHeader.id}, Factura=${dispatchHeader.invoiceNumber}, Tipo=${returnType}, Piezas=${totalPiecesReturned}`,
      );

      return returnHeader;
    });

    // 6. Retorno de la entidad completa con sus relaciones
    return this.findOne(createdReturn.id);
  }

  /**
   * Consulta paginada y filtrada de devoluciones comerciales (EP-RET-02 / UC-RET-02).
   */
  async findAll(query: QueryReturnDto): Promise<PaginatedReturnResponseDto> {
    const page = Math.max(1, query.page || 1);
    const limit = query.limit !== undefined ? Number(query.limit) : 10;
    const isAll = limit === 0 || limit >= 10000;
    const skip = isAll ? undefined : (page - 1) * limit;
    const take = isAll ? undefined : limit;

    const where: any = {};

    if (query.dispatchHeaderId) {
      where.dispatchHeaderId = query.dispatchHeaderId;
    }

    if (query.returnType) {
      where.returnType = query.returnType;
    }

    if (query.startDate || query.endDate) {
      where.returnDate = {};
      if (query.startDate) {
        where.returnDate.gte = new Date(query.startDate + 'T00:00:00.000Z');
      }
      if (query.endDate) {
        where.returnDate.lte = new Date(query.endDate + 'T23:59:59.999Z');
      }
    }

    const [total, returns] = await Promise.all([
      this.prisma.returnHeader.count({ where }),
      this.prisma.returnHeader.findMany({
        where,
        skip,
        take,
        orderBy: [{ returnDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        include: {
          dispatchHeader: {
            select: {
              id: true,
              invoiceNumber: true,
              dispatchDate: true,
              clientCenterId: true,
              clientCenter: {
                select: {
                  id: true,
                  name: true,
                  location: true,
                },
              },
            },
          },
          registeredBy: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
          returnDetails: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  dimensions: true,
                },
              },
              dispatchDetail: {
                select: {
                  id: true,
                  quantityDispatched: true,
                  quantityReturnedAccumulated: true,
                  dimensions: true,
                  dailyProduction: {
                    select: {
                      id: true,
                      productionLot: true,
                    },
                  },
                  product: {
                    select: {
                      id: true,
                      name: true,
                      dimensions: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    const mappedReturns = returns.map((r) => {
      const clientCenter = r.dispatchHeader?.clientCenter
        ? {
            id: r.dispatchHeader.clientCenter.id,
            name: r.dispatchHeader.clientCenter.name,
            location: r.dispatchHeader.clientCenter.location,
          }
        : undefined;

      return {
        ...r,
        clientCenter,
        dispatchHeader: {
          id: r.dispatchHeader.id,
          invoiceNumber: r.dispatchHeader.invoiceNumber,
          dispatchDate: r.dispatchHeader.dispatchDate,
          clientCenter,
          clientCenterName: clientCenter?.name,
        },
      };
    });

    const totalPages = isAll ? 1 : Math.ceil(total / limit) || 1;

    return {
      success: true,
      data: mappedReturns as any,
      meta: {
        total,
        page: isAll ? 1 : page,
        limit: isAll ? total : limit,
        totalPages,
      },
    };
  }

  /**
   * Obtiene el detalle inmutable de una devolución por ID (EP-RET-03).
   */
  async findOne(id: string) {
    const returnRecord = await this.prisma.returnHeader.findUnique({
      where: { id },
      include: {
        dispatchHeader: {
          select: {
            id: true,
            invoiceNumber: true,
            dispatchDate: true,
            status: true,
            clientCenter: {
              select: {
                id: true,
                name: true,
                location: true,
              },
            },
          },
        },
        registeredBy: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        returnDetails: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                dimensions: true,
              },
            },
            dispatchDetail: {
              select: {
                id: true,
                quantityDispatched: true,
                quantityReturnedAccumulated: true,
                dimensions: true,
                dailyProduction: {
                  select: {
                    id: true,
                    productionLot: true,
                  },
                },
                product: {
                  select: {
                    id: true,
                    name: true,
                    dimensions: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!returnRecord) {
      throw new NotFoundException({
        code: 'RETURN_NOT_FOUND',
        message: `Devolución comercial con ID '${id}' no encontrada`,
      });
    }

    const clientCenter = returnRecord.dispatchHeader?.clientCenter
      ? {
          id: returnRecord.dispatchHeader.clientCenter.id,
          name: returnRecord.dispatchHeader.clientCenter.name,
          location: returnRecord.dispatchHeader.clientCenter.location,
        }
      : undefined;

    return {
      success: true,
      data: {
        ...returnRecord,
        clientCenter,
        dispatchHeader: {
          id: returnRecord.dispatchHeader.id,
          invoiceNumber: returnRecord.dispatchHeader.invoiceNumber,
          dispatchDate: returnRecord.dispatchHeader.dispatchDate,
          status: returnRecord.dispatchHeader.status,
          clientCenter,
          clientCenterName: clientCenter?.name,
        },
      },
    };
  }
}
