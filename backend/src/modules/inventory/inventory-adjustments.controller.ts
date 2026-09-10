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
import { AdjustmentsService } from './adjustments.service';
import { CreateInventoryAdjustmentDto } from './dto/create-inventory-adjustment.dto';
import { QueryInventoryAdjustmentDto } from './dto/query-inventory-adjustment.dto';
import {
  InventoryAdjustmentResponseDto,
  PaginatedInventoryAdjustmentResponseDto,
} from './dto/inventory-adjustment-response.dto';

@ApiTags('M10: Ajustes de Inventario')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleType.ADMIN) // EXCLUSIVO ADMIN (D-028, UC-ADJ-01, UC-ADJ-02)
@Controller('inventory-adjustments')
export class InventoryAdjustmentsController {
  constructor(private readonly adjustmentsService: AdjustmentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Ejecutar rectificación administrativa de stock de polines (EP-ADJ-01 / UC-ADJ-01)',
    description:
      'Permite exclusivamente al Administrador rectificar existencias físicas en patio. Registra la fotografía inmutable del stock previo y resultante (RN-004A), emite un movimiento firmado en el ledger (RN-010) y valida que el stock no resulte negativo (FA-02). Cero códigos de liberación (D-028).',
  })
  @ApiResponse({
    status: 201,
    description: 'Ajuste de inventario ejecutado y registrado en el ledger',
    type: InventoryAdjustmentResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Decremento excede el stock disponible o motivo personalizado sin justificación suficiente',
  })
  @ApiResponse({
    status: 403,
    description: 'Acceso denegado (Solo el rol ADMIN puede ejecutar ajustes de inventario)',
  })
  @ApiResponse({
    status: 404,
    description: 'Producto no encontrado en el catálogo',
  })
  async create(
    @Body() dto: CreateInventoryAdjustmentDto,
    @CurrentUser() user: any,
  ) {
    return this.adjustmentsService.create(dto, user);
  }

  @Get()
  @ApiOperation({
    summary:
      'Consultar historial inmutable de ajustes administrativos (EP-ADJ-02 / UC-ADJ-02)',
    description:
      'Consulta paginada y filtrada de la auditoría fotográfica de ajustes de inventario ejecutados en la planta. Exclusivo para Administrador.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista paginada de ajustes administrativos de inventario',
    type: PaginatedInventoryAdjustmentResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Acceso denegado (Solo el rol ADMIN puede consultar ajustes de inventario)',
  })
  async findAll(@Query() query: QueryInventoryAdjustmentDto) {
    return this.adjustmentsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Consultar detalle inmutable de un ajuste por ID (EP-ADJ-03)',
    description:
      'Obtiene la fotografía técnica completa del ajuste, producto afectado, variaciones de stock, motivo y administrador responsable.',
  })
  @ApiParam({ name: 'id', description: 'UUID del ajuste de inventario' })
  @ApiResponse({
    status: 200,
    description: 'Detalle del ajuste de inventario',
    type: InventoryAdjustmentResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Acceso denegado (Solo el rol ADMIN puede consultar ajustes de inventario)',
  })
  @ApiResponse({
    status: 404,
    description: 'Ajuste de inventario no encontrado',
  })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.adjustmentsService.findOne(id);
  }
}
