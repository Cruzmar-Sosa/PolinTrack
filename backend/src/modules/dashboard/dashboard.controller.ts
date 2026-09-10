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
import { DashboardService } from './dashboard.service';
import { QueryDashboardDto } from './dto/query-dashboard.dto';
import { DashboardResponseDto } from './dto/dashboard-response.dto';

@ApiTags('M01: Dashboard Operativo')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('kpis')
  @Roles(RoleType.ADMIN, RoleType.CONTABILIDAD, RoleType.CONSULTA)
  @ApiOperation({
    summary:
      'Consultar los 5 KPIs consolidados de la planta en tiempo real (EP-DSH-01 / UC-DSH-01)',
    description:
      'Calcula en tiempo real los 5 indicadores de planta confirmados (D-027): 1) Stock disponible actual de 5 polines (RN-010), 2) Entradas de madera en el período (Timbre pt vs Procesada pcs), 3) Salidas de polines en piezas, 4) Madera despachada equivalente, 5) Despachos por cada una de las 7 plantas cliente. Operación 100% READ-ONLY.',
  })
  @ApiResponse({
    status: 200,
    description: 'Los 5 KPIs oficiales de planta consolidados',
    type: DashboardResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Parámetros de fecha inválidos o startDate posterior a endDate (RN-007)',
  })
  @ApiResponse({
    status: 401,
    description: 'No autenticado (Token JWT inválido o ausente)',
  })
  async getKpis(@Query() query: QueryDashboardDto) {
    return this.dashboardService.getKpis(query);
  }
}
