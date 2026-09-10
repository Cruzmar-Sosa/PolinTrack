import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RoleType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuditService } from './audit.service';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';
import { AuditLogsResponseDto } from './dto/audit-log-response.dto';

@ApiTags('M11: Auditoría Técnica')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Roles(RoleType.ADMIN)
  @ApiOperation({
    summary: 'Consultar el registro de auditoría técnica forense (Exclusivo ADMIN)',
    description:
      'Retorna el historial inmutable de mutaciones técnicas en entidades de base de datos con paginación, filtros por tabla, acción, usuario y rango de fechas. Exclusivo para administradores del sistema (D-003 / RN-014).',
  })
  @ApiResponse({
    status: 200,
    description: 'Historial de auditoría paginado',
    type: AuditLogsResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'No autenticado (Token ausente o inválido)',
  })
  @ApiResponse({
    status: 403,
    description: 'Acceso denegado (Requiere rol ADMIN)',
  })
  async getAuditLogs(@Query() query: QueryAuditLogDto) {
    return this.auditService.getAuditLogs(query);
  }
}
