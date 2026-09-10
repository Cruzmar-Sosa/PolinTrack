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
import { ReturnsService } from './returns.service';
import { CreateReturnHeaderDto } from './dto/create-return.dto';
import { QueryReturnDto } from './dto/query-return.dto';
import {
  PaginatedReturnResponseDto,
  ReturnHeaderResponseDto,
} from './dto/return-response.dto';

@ApiTags('M08: Devoluciones')
@ApiBearerAuth()
@Controller('returns')
export class ReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleType.ADMIN, RoleType.CONTABILIDAD)
  @ApiOperation({
    summary: 'Registrar devolución comercial de polines (EP-RET-01 / UC-RET-01)',
    description:
      'Registra un nuevo evento de devolución física vinculado a una factura de despacho previa. Reincorpora las piezas al stock en el ledger (+N, RN-010), incrementa el contador acumulado de devolución y preserva la inmutabilidad histórica del despacho original (RN-001, RN-013).',
  })
  @ApiResponse({
    status: 201,
    description: 'Devolución comercial registrada y piezas reincorporadas al inventario',
    type: ReturnHeaderResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Cantidad devuelta excede remanente despachado (RETURN_QUANTITY_EXCEEDS_DISPATCHED) o fecha inválida',
  })
  @ApiResponse({
    status: 403,
    description: 'Acceso denegado (Rol CONSULTA no autorizado para registrar devoluciones)',
  })
  @ApiResponse({
    status: 404,
    description: 'Despacho original o línea de detalle no encontrado',
  })
  async create(
    @Body() dto: CreateReturnHeaderDto,
    @CurrentUser() user: any,
  ) {
    return this.returnsService.create(dto, user);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleType.ADMIN, RoleType.CONTABILIDAD, RoleType.CONSULTA)
  @ApiOperation({
    summary: 'Listar eventos de devolución (EP-RET-02 / UC-RET-02)',
    description:
      'Consulta paginada y filtrada del historial inmutable de devoluciones por rango de fechas, despacho asociado o tipo (TOTAL/PARCIAL).',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista paginada de devoluciones comerciales',
    type: PaginatedReturnResponseDto,
  })
  async findAll(@Query() query: QueryReturnDto) {
    return this.returnsService.findAll(query);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleType.ADMIN, RoleType.CONTABILIDAD, RoleType.CONSULTA)
  @ApiOperation({
    summary: 'Consultar detalle inmutable de una devolución (EP-RET-03)',
    description:
      'Obtiene la información completa del evento de devolución, líneas devueltas, referencia al despacho original y usuario receptor.',
  })
  @ApiParam({ name: 'id', description: 'UUID de la devolución comercial' })
  @ApiResponse({
    status: 200,
    description: 'Detalle de la devolución comercial',
    type: ReturnHeaderResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Devolución comercial no encontrada',
  })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.returnsService.findOne(id);
  }
}
