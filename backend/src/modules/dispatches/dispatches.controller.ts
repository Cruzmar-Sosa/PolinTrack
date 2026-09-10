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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RoleType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DispatchesService } from './dispatches.service';
import { CreateDispatchHeaderDto } from './dto/create-dispatch.dto';
import { QueryDispatchDto } from './dto/query-dispatch.dto';
import {
  DispatchHeaderResponseDto,
  PaginatedDispatchResponseDto,
} from './dto/dispatch-response.dto';

@ApiTags('M07: Salidas / Despachos')
@ApiBearerAuth()
@Controller('dispatches')
export class DispatchesController {
  constructor(private readonly dispatchesService: DispatchesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleType.ADMIN, RoleType.CONTABILIDAD)
  @ApiOperation({
    summary: 'Registrar salida / despacho comercial de polines (EP-DSP-01 / UC-DSP-01)',
    description:
      'Registra una remisión o factura comercial de salida con múltiples líneas de producto/lote. Valida de forma atómica y estricta la disponibilidad de existencias (RN-002), decrementa el inventario en el ledger (-N, RN-010) y garantiza la inmutabilidad de la factura (RN-001).',
  })
  @ApiResponse({
    status: 201,
    description: 'Despacho comercial confirmado y movimientos de inventario registrados',
    type: DispatchHeaderResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Stock insuficiente (INSUFFICIENT_STOCK) o payload inválido',
  })
  @ApiResponse({
    status: 403,
    description: 'Acceso denegado (Rol CONSULTA no autorizado para registrar despachos)',
  })
  @ApiResponse({
    status: 404,
    description: 'Centro cliente, producto o lote de producción no encontrado',
  })
  @ApiResponse({
    status: 409,
    description: 'Número de factura duplicado (INVOICE_NUMBER_ALREADY_EXISTS)',
  })
  async create(
    @Body() dto: CreateDispatchHeaderDto,
    @CurrentUser() user: any,
  ) {
    return this.dispatchesService.create(dto, user);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleType.ADMIN, RoleType.CONTABILIDAD, RoleType.CONSULTA)
  @ApiOperation({
    summary: 'Listar despachos y facturas comerciales (EP-DSP-02 / UC-DSP-02)',
    description:
      'Consulta paginada y filtrada del historial inmutable de despachos por rango de fechas, centro cliente, factura, producto o estado.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista paginada de facturas de despacho',
    type: PaginatedDispatchResponseDto,
  })
  async findAll(@Query() query: QueryDispatchDto) {
    return this.dispatchesService.findAll(query);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleType.ADMIN, RoleType.CONTABILIDAD, RoleType.CONSULTA)
  @ApiOperation({
    summary: 'Consultar detalle inmutable de un despacho (EP-DSP-03)',
    description:
      'Obtiene la información completa del despacho comercial, líneas de detalle, destino, chofer y devoluciones asociadas.',
  })
  @ApiParam({ name: 'id', description: 'UUID del despacho comercial' })
  @ApiResponse({
    status: 200,
    description: 'Detalle del despacho comercial',
    type: DispatchHeaderResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Despacho comercial no encontrado',
  })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.dispatchesService.findOne(id);
  }
}
