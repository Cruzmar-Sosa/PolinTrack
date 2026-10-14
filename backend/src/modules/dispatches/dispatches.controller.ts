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
import { CorrectDispatchDto } from './dto/correct-dispatch.dto';

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

  @Get(':id/corrections-context')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleType.ADMIN, RoleType.CONTABILIDAD)
  @ApiOperation({
    summary: 'Obtener contexto y límites permitidos antes de editar cantidades de un despacho',
    description:
      'Retorna líneas de despacho con cantidades devueltas acumuladas, mínimo permitido y stock disponible en almacén.',
  })
  @ApiResponse({ status: 200, description: 'Contexto obtenido con éxito' })
  @ApiResponse({ status: 403, description: 'No autorizado para CONSULTA' })
  async getCorrectionContext(@Param('id', ParseUUIDPipe) id: string) {
    return this.dispatchesService.getCorrectionContext(id);
  }

  @Post(':id/corrections')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleType.ADMIN, RoleType.CONTABILIDAD)
  @ApiOperation({
    summary: 'Corregir cantidades de una factura/remisión de despacho (Auditable)',
    description:
      'Modifica cantidades despachadas de líneas existentes. Valida no reducir por debajo de devoluciones ya registradas y disponibilidad en almacén si incrementa. Emite movimientos compensatorios en ledger (MovementType.CORRECTION) y auditoría inmutable.',
  })
  @ApiResponse({ status: 200, description: 'Corrección de despacho aplicada exitosamente' })
  @ApiResponse({ status: 400, description: 'Cantidad inválida o inferior a devoluciones' })
  @ApiResponse({ status: 403, description: 'Acceso denegado para CONSULTA' })
  async correctQuantity(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CorrectDispatchDto,
    @CurrentUser() user: any,
  ) {
    const userId = user?.id || user?.sub;
    return this.dispatchesService.correctQuantity(id, dto, userId);
  }

  @Get(':id/corrections')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleType.ADMIN, RoleType.CONTABILIDAD, RoleType.CONSULTA)
  @ApiOperation({
    summary: 'Consultar historial de correcciones de una factura de despacho',
    description: 'Retorna el historial inmutable de correcciones, actor, fecha, deltas y líneas afectadas.',
  })
  @ApiResponse({ status: 200, description: 'Historial de correcciones encontrado' })
  async getCorrections(@Param('id', ParseUUIDPipe) id: string) {
    return this.dispatchesService.getCorrections(id);
  }
}
