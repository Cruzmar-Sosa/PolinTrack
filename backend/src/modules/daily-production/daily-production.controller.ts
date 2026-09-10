import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RoleType } from '@prisma/client';
import { DailyProductionService } from './daily-production.service';
import { CreateDailyProductionDto } from './dto/create-daily-production.dto';
import { QueryDailyProductionDto } from './dto/query-daily-production.dto';
import {
  DailyProductionListResponseDto,
  SingleDailyProductionResponseDto,
} from './dto/daily-production-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('M04: Producción Diaria')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('daily-productions')
export class DailyProductionController {
  constructor(
    private readonly dailyProductionService: DailyProductionService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(RoleType.ADMIN, RoleType.CONTABILIDAD)
  @ApiOperation({
    summary: 'Registrar orden de producción diaria de polines (EP-PRD-01)',
    description:
      'Registra producción física con lote determinístico LT-DDMMYY-WXX (semana ISO 8601), vincula referencialmente lotes de madera de patio e incrementa atómicamente el stock en el ledger (RN-010). Autorizado para ADMIN y CONTABILIDAD.',
  })
  @ApiResponse({
    status: 201,
    description: 'Producción registrada exitosamente con incremento en ledger',
    type: SingleDailyProductionResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Cantidad inválida o fecha futura' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Acceso denegado para el rol CONSULTA' })
  @ApiResponse({ status: 404, description: 'Producto o lote de madera no encontrado' })
  async create(@Body() dto: CreateDailyProductionDto, @Req() req: any) {
    const userId = req.user?.id || req.user?.sub;
    const data = await this.dailyProductionService.create(dto, userId);
    return {
      success: true,
      data,
    };
  }

  @Get()
  @Roles(RoleType.ADMIN, RoleType.CONTABILIDAD, RoleType.CONSULTA)
  @ApiOperation({
    summary: 'Listar histórico de órdenes de producción diaria (EP-PRD-02)',
    description:
      'Consulta paginada del histórico de producciones con filtros por fecha, semana ISO y producto. Valida startDate <= endDate (RN-007). Autorizado para todos los roles.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista paginada de órdenes de producción',
    type: DailyProductionListResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Rango de fechas inválido (RN-007)' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async findAll(@Query() query: QueryDailyProductionDto) {
    return this.dailyProductionService.findAll(query);
  }

  @Get(':id')
  @Roles(RoleType.ADMIN, RoleType.CONTABILIDAD, RoleType.CONSULTA)
  @ApiOperation({
    summary: 'Consultar orden de producción por ID con trazabilidad (EP-PRD-03)',
    description:
      'Retorna detalle completo de la orden, polín fabricado, lotes de madera de origen vinculados y tratamientos de fumigación registrados.',
  })
  @ApiResponse({
    status: 200,
    description: 'Orden de producción encontrada',
    type: SingleDailyProductionResponseDto,
  })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 404, description: 'Orden de producción no encontrada' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.dailyProductionService.findOne(id);
  }
}
