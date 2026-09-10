import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RoleType } from '@prisma/client';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { QuerySupplierDto } from './dto/query-supplier.dto';
import {
  SingleSupplierResponseDto,
  SuppliersListResponseDto,
} from './dto/supplier-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';

@ApiTags('M02: Catálogos Maestros')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  @Roles(RoleType.ADMIN, RoleType.CONTABILIDAD, RoleType.CONSULTA)
  @ApiOperation({
    summary: 'Listar proveedores de madera (EP-SUP-01)',
    description:
      'Disponible para ADMIN, CONTABILIDAD y CONSULTA. Permite filtrar por estado activo y búsqueda por texto.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de proveedores de madera',
    type: SuppliersListResponseDto,
  })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async findAll(@Query() query: QuerySupplierDto) {
    return this.suppliersService.findAll(query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(RoleType.ADMIN, RoleType.CONTABILIDAD)
  @ApiOperation({
    summary: 'Registrar nuevo proveedor de madera (EP-SUP-02)',
    description:
      'Autorizado para ADMIN y CONTABILIDAD (UC-CAT-01, REQ-FUNC-010). Valida unicidad de nombre de proveedor.',
  })
  @ApiResponse({
    status: 201,
    description: 'Proveedor registrado exitosamente',
    type: SingleSupplierResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Datos de validación inválidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Acceso denegado (Rol CONSULTA)' })
  @ApiResponse({ status: 409, description: 'Nombre de proveedor ya registrado' })
  async create(
    @Body() createSupplierDto: CreateSupplierDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.suppliersService.create(createSupplierDto, user.id);
  }

  @Get(':id')
  @Roles(RoleType.ADMIN, RoleType.CONTABILIDAD, RoleType.CONSULTA)
  @ApiOperation({
    summary: 'Consultar proveedor por ID (EP-SUP-03)',
    description: 'Disponible para todos los roles autenticados.',
  })
  @ApiResponse({
    status: 200,
    description: 'Datos del proveedor localizado',
    type: SingleSupplierResponseDto,
  })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 404, description: 'Proveedor no encontrado' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.suppliersService.findOne(id);
  }

  @Put(':id')
  @Roles(RoleType.ADMIN, RoleType.CONTABILIDAD)
  @ApiOperation({
    summary: 'Actualizar datos de proveedor (EP-SUP-04)',
    description:
      'Autorizado para ADMIN y CONTABILIDAD. Permite actualizar contacto, notas, documentación y estado activo.',
  })
  @ApiResponse({
    status: 200,
    description: 'Proveedor actualizado exitosamente',
    type: SingleSupplierResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Acceso denegado (Rol CONSULTA)' })
  @ApiResponse({ status: 404, description: 'Proveedor no encontrado' })
  @ApiResponse({ status: 409, description: 'Nombre ya utilizado por otro proveedor' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateSupplierDto: UpdateSupplierDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.suppliersService.update(id, updateSupplierDto, user.id);
  }

  @Patch(':id/status')
  @Roles(RoleType.ADMIN, RoleType.CONTABILIDAD)
  @ApiOperation({
    summary: 'Activar o desactivar proveedor de madera',
    description: 'Conmuta el estado operativo del proveedor sin afectar registros históricos.',
  })
  @ApiResponse({ status: 200, description: 'Estado de proveedor actualizado' })
  @ApiResponse({ status: 403, description: 'Acceso denegado (Rol CONSULTA)' })
  @ApiResponse({ status: 404, description: 'Proveedor no encontrado' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('isActive') isActive: boolean,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.suppliersService.update(id, { isActive }, user.id);
  }
}
