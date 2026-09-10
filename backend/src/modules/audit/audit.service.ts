import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '@prisma/client';
import { sanitizeAuditData } from './audit-sanitizer';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';
import { AuditLogsResponseDto } from './dto/audit-log-response.dto';

export interface RecordAuditLogParams {
  tableName: string;
  recordId: string;
  action: string;
  oldValues?: any;
  newValues?: any;
  correctionReason?: string;
  userId: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registro asíncrono y no bloqueante de auditoría técnica forense (AuditLog).
   * Envuelto en try/catch para garantizar que NUNCA interrumpa la transacción de negocio del cliente.
   */
  async recordAuditLog(params: RecordAuditLogParams): Promise<void> {
    try {
      // 1. Validar que userId sea UUID válido
      if (!params.userId || !UUID_REGEX.test(params.userId)) {
        this.logger.warn(
          `[AuditService] Omitiendo log para tabla ${params.tableName}: userId no es un UUID válido (${params.userId})`,
        );
        return;
      }

      // 2. Validar que recordId sea UUID válido
      let finalRecordId = params.recordId;
      if (!finalRecordId || !UUID_REGEX.test(finalRecordId)) {
        this.logger.warn(
          `[AuditService] recordId no es UUID válido (${finalRecordId}) para tabla ${params.tableName}. Se omite registro en audit_logs`,
        );
        return;
      }

      // 3. Sanitización estricta de valores previos y nuevos (Cero contraseñas ni tokens)
      const sanitizedOldValues = params.oldValues
        ? sanitizeAuditData(params.oldValues)
        : null;
      const sanitizedNewValues = params.newValues
        ? sanitizeAuditData(params.newValues)
        : null;

      // 4. Inserción directa en PostgreSQL audit_logs
      await this.prisma.auditLog.create({
        data: {
          tableName: params.tableName,
          recordId: finalRecordId,
          action: params.action,
          oldValues: sanitizedOldValues ?? Prisma.DbNull,
          newValues: sanitizedNewValues ?? Prisma.DbNull,
          correctionReason: params.correctionReason || null,
          userId: params.userId,
        },
      });

      this.logger.debug(
        `[AuditService] Registrado audit_log [${params.action}] sobre ${params.tableName}:${finalRecordId} por usuario ${params.userId}`,
      );
    } catch (err: any) {
      // INVARIANTE: Si falla el guardado de auditoría, se captura el error y NO se interrumpe al cliente.
      this.logger.error(
        `[AuditService] ⚠️ Fallo al persistir registro de auditoría en audit_logs: ${err?.message}`,
        err?.stack,
      );
    }
  }

  /**
   * Consulta de registros de auditoría técnica forense (exclusivo para ADMIN).
   */
  async getAuditLogs(query: QueryAuditLogDto): Promise<AuditLogsResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {};

    if (query.tableName) {
      where.tableName = query.tableName;
    }

    if (query.action) {
      where.action = query.action;
    }

    if (query.userId) {
      where.userId = query.userId;
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {
        ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
        ...(query.endDate
          ? {
              lte: (() => {
                const end = new Date(query.endDate);
                end.setUTCHours(23, 59, 59, 999);
                return end;
              })(),
            }
          : {}),
      };
    }

    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              fullName: true,
              email: true,
              role: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const data = rows.map((r) => ({
      id: r.id,
      tableName: r.tableName,
      recordId: r.recordId,
      action: r.action,
      oldValues: r.oldValues,
      newValues: r.newValues,
      correctionReason: r.correctionReason,
      userId: r.userId,
      user: {
        fullName: r.user.fullName,
        email: r.user.email,
        role: r.user.role,
      },
      createdAt: r.createdAt.toISOString(),
    }));

    return {
      success: true,
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }
}
