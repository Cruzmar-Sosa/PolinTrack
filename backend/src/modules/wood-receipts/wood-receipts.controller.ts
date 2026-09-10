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
import { WoodReceiptsService } from './wood-receipts.service';
import { CreateWoodReceiptDto } from './dto/create-wood-receipt.dto';
import { QueryWoodReceiptDto } from './dto/query-wood-receipt.dto';
import {
  SingleWoodReceiptResponseDto,
  WoodReceiptsListResponseDto,
} from './dto/wood-receipt-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('M03: Ingreso de Madera')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('wood-receipts')
export class WoodReceiptsController {
  constructor(private readonly woodReceiptsService: WoodReceiptsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(RoleType.ADMIN, RoleType.CONTABILIDAD)
  @ApiOperation({
    summary: 'Registrar ingreso físico de madera en patio (EP-REC-01)',
    description:
      'Registra recepción de materia prima con lote automático LT-DDMMYY-XX y auto-asignación de unidad (pt o piezas). Autorizado para ADMIN y CONTABILIDAD (UC-REC-01).',
  })
  @ApiResponse({
    status: 201,
    description: 'Ingreso registrado exitosamente con lote oficial',
    type: SingleWoodReceiptResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Datos de ingreso inválidos o fecha futura' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Acceso denegado para el rol CONSULTA' })
  @ApiResponse({ status: 404, description: 'Proveedor o especie no encontrada' })
  async create(@Body() dto: CreateWoodReceiptDto, @Req() req: any) {
    const userId = req.user?.id || req.user?.sub;
    const data = await this.woodReceiptsService.create(dto, userId);
    return {
      success: true,
      data,
    };
  }

  @Get()
  @Roles(RoleType.ADMIN, RoleType.CONTABILIDAD, RoleType.CONSULTA)
  @ApiOperation({
    summary: 'Listar histórico de ingresos de madera con filtros (EP-REC-02)',
    description:
      'Consulta paginada del registro histórico de recepciones de madera con filtros de fecha, proveedor y lote. Valida startDate <= endDate (RN-007). Autorizado para todos los roles.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista paginada de ingresos de madera',
    type: WoodReceiptsListResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Rango de fechas inválido (RN-007)' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async findAll(@Query() query: QueryWoodReceiptDto) {
    return this.woodReceiptsService.findAll(query);
  }

  @Get(':id')
  @Roles(RoleType.ADMIN, RoleType.CONTABILIDAD, RoleType.CONSULTA)
  @ApiOperation({
    summary: 'Obtener detalle de un ingreso de madera por ID (EP-REC-03)',
    description:
      'Retorna la ficha técnica completa del lote de madera, proveedor y metadatos de recepción. Inmutable para todos los roles.',
  })
  @ApiResponse({
    status: 200,
    description: 'Detalle del ingreso de madera encontrado',
    type: SingleWoodReceiptResponseDto,
  })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 404, description: 'Ingreso de madera no encontrado' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.woodReceiptsService.findOne(id);
  }
}
