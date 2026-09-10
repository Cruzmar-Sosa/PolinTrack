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
import { ReportsService } from './reports.service';
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

@ApiTags('M11: Reportes Operativos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('wood-receipts')
  @Roles(RoleType.ADMIN, RoleType.CONTABILIDAD, RoleType.CONSULTA)
  @ApiOperation({
    summary: 'Reporte 1 - Ingresos de Madera (EP-REP-01 / UC-REP-01)',
    description:
      'Listado histórico de recepción de materia prima con filtrado por rango de fechas (RN-007: startDate <= endDate), proveedor y lote.',
  })
  @ApiResponse({
    status: 200,
    description: 'Datos paginados del reporte de ingresos de madera',
    type: WoodReceiptsReportResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Parámetros inválidos o startDate posterior a endDate (RN-007)',
  })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async getWoodReceiptsReport(@Query() query: QueryWoodReceiptsReportDto) {
    return this.reportsService.getWoodReceiptsReport(query);
  }

  @Get('dispatches')
  @Roles(RoleType.ADMIN, RoleType.CONTABILIDAD, RoleType.CONSULTA)
  @ApiOperation({
    summary: 'Reporte 2 - Salidas y Despachos (EP-REP-02 / UC-REP-01)',
    description:
      'Listado de expedición comercial con desglose de factura, planta cliente, chofer, vehículo y estado.',
  })
  @ApiResponse({
    status: 200,
    description: 'Datos paginados del reporte de despachos comerciales',
    type: DispatchesReportResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Parámetros inválidos o startDate posterior a endDate (RN-007)',
  })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async getDispatchesReport(@Query() query: QueryDispatchesReportDto) {
    return this.reportsService.getDispatchesReport(query);
  }

  @Get('inventory')
  @Roles(RoleType.ADMIN, RoleType.CONTABILIDAD, RoleType.CONSULTA)
  @ApiOperation({
    summary: 'Reporte 3 - Inventario Operativo Consolidado (EP-REP-03 / UC-REP-01)',
    description:
      'Balance consolidado en tiempo real por tipo de polín: producción acumulada, despachos, devoluciones, ajustes y stock disponible en patio.',
  })
  @ApiResponse({
    status: 200,
    description: 'Balance de inventario operativo por producto',
    type: InventoryReportResponseDto,
  })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async getInventoryReport(@Query() query: QueryInventoryReportDto) {
    return this.reportsService.getInventoryReport(query);
  }

  @Get('daily-productions')
  @Roles(RoleType.ADMIN, RoleType.CONTABILIDAD, RoleType.CONSULTA)
  @ApiOperation({
    summary: 'Reporte 4 - Producción Diaria por Semana ISO (EP-REP-04 / UC-REP-01)',
    description:
      'Listado de jornadas de fabricación, semana ISO 8601 (WXX), polines armados y lotes de madera vinculados.',
  })
  @ApiResponse({
    status: 200,
    description: 'Datos paginados del reporte de producción diaria',
    type: DailyProductionsReportResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Parámetros inválidos o startDate posterior a endDate (RN-007)',
  })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async getDailyProductionsReport(
    @Query() query: QueryDailyProductionsReportDto,
  ) {
    return this.reportsService.getDailyProductionsReport(query);
  }

  @Get('fumigations')
  @Roles(RoleType.ADMIN, RoleType.CONTABILIDAD, RoleType.CONSULTA)
  @ApiOperation({
    summary: 'Reporte 5 - Certificados OIRSA y Tratamientos (EP-REP-05 / UC-REP-01)',
    description:
      'Listado de tratamientos fitosanitarios aplicados, certificados oficiales OIRSA y enlaces firmados para descarga del PDF.',
  })
  @ApiResponse({
    status: 200,
    description: 'Datos paginados del reporte de fumigaciones',
    type: FumigationsReportResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Parámetros inválidos o startDate posterior a endDate (RN-007)',
  })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async getFumigationsReport(@Query() query: QueryFumigationsReportDto) {
    return this.reportsService.getFumigationsReport(query);
  }

  @Get('distribution-centers')
  @Roles(RoleType.ADMIN, RoleType.CONTABILIDAD, RoleType.CONSULTA)
  @ApiOperation({
    summary: 'Reporte 6 - Salidas por Centro de Distribución (EP-REP-06 / UC-REP-01)',
    description:
      'Desglose consolidado de movimientos hacia las 7 plantas cliente: piezas despachadas, devoluciones y saldo neto entregado.',
  })
  @ApiResponse({
    status: 200,
    description: 'Consolidado de movimientos por centro de distribución',
    type: DistributionCentersReportResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Parámetros inválidos o startDate posterior a endDate (RN-007)',
  })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async getDistributionCentersReport(
    @Query() query: QueryDistributionCentersReportDto,
  ) {
    return this.reportsService.getDistributionCentersReport(query);
  }
}
