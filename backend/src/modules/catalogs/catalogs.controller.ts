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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { CatalogsService } from './catalogs.service';
import { CreateClientCenterDto, UpdateClientCenterDto } from './dto/client-center.dto';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { CreateWoodSpeciesDto, UpdateWoodSpeciesDto, UpdateWoodTypeDto } from './dto/wood-catalog.dto';
import { UpdateStatusDto } from './dto/update-status.dto';

@ApiTags('M02: Catálogos Maestros')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('catalog')
export class CatalogsController {
  constructor(private readonly catalogsService: CatalogsService) {}

  // ==============================================================================
  // 1. ESPECIES BOTÁNICAS DE MADERA
  // ==============================================================================

  @Get('wood-species')
  @Roles(RoleType.ADMIN, RoleType.CONTABILIDAD, RoleType.CONSULTA)
  @ApiOperation({
    summary: 'Listar las especies botánicas de madera (EP-CAT-01)',
    description: 'Catálogo de especies de madera (TECA, PINO, OTRAS) precargado en el sistema.',
  })
  @ApiResponse({ status: 200, description: 'Lista de especies de madera' })
  async getWoodSpecies(@Query('includeInactive') includeInactive?: string) {
    const data = await this.catalogsService.findAllWoodSpecies(includeInactive === 'true');
    return { success: true, data };
  }

  @Post('wood-species')
  @HttpCode(HttpStatus.CREATED)
  @Roles(RoleType.ADMIN, RoleType.CONTABILIDAD)
  @ApiOperation({
    summary: 'Registrar nueva especie botánica de madera (ADMIN, CONTABILIDAD)',
    description: 'Permite incorporar una nueva especie de madera autorizada.',
  })
  @ApiResponse({ status: 201, description: 'Especie registrada exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 403, description: 'Acceso denegado (Requiere ADMIN o CONTABILIDAD)' })
  @ApiResponse({ status: 409, description: 'Especie ya registrada' })
  async createWoodSpecies(
    @Body() body: CreateWoodSpeciesDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.catalogsService.createWoodSpecies(body, user.id);
    return { success: true, data };
  }

  @Put('wood-species/:id')
  @Roles(RoleType.ADMIN, RoleType.CONTABILIDAD)
  @ApiOperation({
    summary: 'Actualizar especie de madera (ADMIN, CONTABILIDAD)',
    description: 'Permite actualizar datos o estado de la especie.',
  })
  @ApiResponse({ status: 200, description: 'Especie actualizada' })
  @ApiResponse({ status: 403, description: 'Acceso denegado (Requiere ADMIN o CONTABILIDAD)' })
  @ApiResponse({ status: 404, description: 'Especie no encontrada' })
  async updateWoodSpecies(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateWoodSpeciesDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.catalogsService.updateWoodSpecies(id, body, user.id);
    return { success: true, data };
  }

  @Patch('wood-species/:id/status')
  @Roles(RoleType.ADMIN, RoleType.CONTABILIDAD)
  @ApiOperation({
    summary: 'Activar o desactivar especie de madera (ADMIN, CONTABILIDAD)',
    description: 'Conmuta el estado operativo sin eliminar físicamente el registro histórico.',
  })
  @ApiResponse({ status: 200, description: 'Estado actualizado' })
  @ApiResponse({ status: 403, description: 'Acceso denegado (Requiere ADMIN o CONTABILIDAD)' })
  async updateWoodSpeciesStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.catalogsService.updateWoodSpeciesStatus(id, body.isActive, user.id);
    return { success: true, data };
  }

  // ==============================================================================
  // 2. TIPOS DE MADERA Y UNIDADES
  // ==============================================================================

  @Get('wood-types')
  @Roles(RoleType.ADMIN, RoleType.CONTABILIDAD, RoleType.CONSULTA)
  @ApiOperation({
    summary: 'Listar los tipos de madera física y sus unidades de medida (EP-CAT-02)',
    description: 'Catálogo de tipos de madera (TIMBRE -> PIE_TABLAR, PROCESADA -> PIEZAS).',
  })
  @ApiResponse({ status: 200, description: 'Lista de tipos de madera' })
  async getWoodTypes(@Query('includeInactive') includeInactive?: string) {
    const data = await this.catalogsService.findAllWoodTypes(includeInactive === 'true');
    return { success: true, data };
  }

  @Put('wood-types/:id')
  @Roles(RoleType.ADMIN)
  @ApiOperation({
    summary: 'Actualizar tipo de madera (ADMIN)',
    description: 'Exclusivo para ADMIN. Permite actualizar descripción, unidad por defecto y estado.',
  })
  @ApiResponse({ status: 200, description: 'Tipo de madera actualizado' })
  @ApiResponse({ status: 403, description: 'Acceso denegado (Requiere ADMIN)' })
  async updateWoodType(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateWoodTypeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.catalogsService.updateWoodType(id, body, user.id);
    return { success: true, data };
  }

  @Patch('wood-types/:id/status')
  @Roles(RoleType.ADMIN)
  @ApiOperation({
    summary: 'Activar o desactivar tipo de madera (ADMIN)',
    description: 'Exclusivo para ADMIN. Conmuta el estado operativo.',
  })
  @ApiResponse({ status: 200, description: 'Estado actualizado' })
  @ApiResponse({ status: 403, description: 'Acceso denegado (Requiere ADMIN)' })
  async updateWoodTypeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.catalogsService.updateWoodTypeStatus(id, body.isActive, user.id);
    return { success: true, data };
  }

  // ==============================================================================
  // 3. PRODUCTOS / POLINES NORMALIZADOS
  // ==============================================================================

  @Get('products')
  @Roles(RoleType.ADMIN, RoleType.CONTABILIDAD, RoleType.CONSULTA)
  @ApiOperation({
    summary: 'Listar los polines normalizados de producto terminado (EP-CAT-03)',
    description: 'Catálogo comercial de polines terminados.',
  })
  @ApiResponse({ status: 200, description: 'Lista de polines terminados' })
  async getProducts(@Query('includeInactive') includeInactive?: string) {
    const data = await this.catalogsService.findAllProducts(includeInactive === 'true');
    return { success: true, data };
  }

  @Post('products')
  @HttpCode(HttpStatus.CREATED)
  @Roles(RoleType.ADMIN, RoleType.CONTABILIDAD)
  @ApiOperation({
    summary: 'Registrar nuevo producto o polín normalizado (ADMIN, CONTABILIDAD)',
    description: 'Valida unicidad de denominación comercial.',
  })
  @ApiResponse({ status: 201, description: 'Producto registrado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 403, description: 'Acceso denegado (Requiere ADMIN o CONTABILIDAD)' })
  @ApiResponse({ status: 409, description: 'Denominación ya registrada' })
  async createProduct(
    @Body() body: CreateProductDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.catalogsService.createProduct(body, user.id);
    return { success: true, data };
  }

  @Put('products/:id')
  @Roles(RoleType.ADMIN, RoleType.CONTABILIDAD)
  @ApiOperation({
    summary: 'Actualizar producto o polín normalizado (ADMIN, CONTABILIDAD)',
    description: 'Permite modificar nombre, dimensiones y estado.',
  })
  @ApiResponse({ status: 200, description: 'Producto actualizado' })
  @ApiResponse({ status: 403, description: 'Acceso denegado (Requiere ADMIN o CONTABILIDAD)' })
  async updateProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateProductDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.catalogsService.updateProduct(id, body, user.id);
    return { success: true, data };
  }

  @Patch('products/:id/status')
  @Roles(RoleType.ADMIN, RoleType.CONTABILIDAD)
  @ApiOperation({
    summary: 'Activar o desactivar producto o polín normalizado (ADMIN, CONTABILIDAD)',
    description: 'Conmuta el estado operativo sin borrar registros históricos.',
  })
  @ApiResponse({ status: 200, description: 'Estado actualizado' })
  @ApiResponse({ status: 403, description: 'Acceso denegado (Requiere ADMIN o CONTABILIDAD)' })
  async updateProductStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.catalogsService.updateProductStatus(id, body.isActive, user.id);
    return { success: true, data };
  }

  // ==============================================================================
  // 4. CENTROS DE DESTINO / PLANTAS CLIENTE
  // ==============================================================================

  @Get('client-centers')
  @Roles(RoleType.ADMIN, RoleType.CONTABILIDAD, RoleType.CONSULTA)
  @ApiOperation({
    summary: 'Listar las plantas cliente de destino (EP-CAT-04)',
    description: 'Catálogo maestro de centros de clientes receptores de polines.',
  })
  @ApiResponse({ status: 200, description: 'Lista de plantas cliente' })
  async getClientCenters(@Query('includeInactive') includeInactive?: string) {
    const data = await this.catalogsService.findAllClientCenters(includeInactive === 'true');
    return { success: true, data };
  }

  @Post('client-centers')
  @HttpCode(HttpStatus.CREATED)
  @Roles(RoleType.ADMIN, RoleType.CONTABILIDAD)
  @ApiOperation({
    summary: 'Registrar nueva planta cliente de destino (ADMIN, CONTABILIDAD)',
    description: 'Incorpora nuevas instalaciones receptoras.',
  })
  @ApiResponse({ status: 201, description: 'Centro cliente registrado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 403, description: 'Acceso denegado (Requiere ADMIN o CONTABILIDAD)' })
  @ApiResponse({ status: 409, description: 'Nombre de centro ya registrado' })
  async createClientCenter(
    @Body() body: CreateClientCenterDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.catalogsService.createClientCenter(body, user.id);
    return { success: true, data };
  }

  @Put('client-centers/:id')
  @Roles(RoleType.ADMIN, RoleType.CONTABILIDAD)
  @ApiOperation({
    summary: 'Actualizar planta cliente de destino (ADMIN, CONTABILIDAD)',
    description: 'Permite modificar nombre, ubicación y estado.',
  })
  @ApiResponse({ status: 200, description: 'Centro cliente actualizado' })
  @ApiResponse({ status: 403, description: 'Acceso denegado (Requiere ADMIN o CONTABILIDAD)' })
  async updateClientCenter(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateClientCenterDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.catalogsService.updateClientCenter(id, body, user.id);
    return { success: true, data };
  }

  @Patch('client-centers/:id/status')
  @Roles(RoleType.ADMIN, RoleType.CONTABILIDAD)
  @ApiOperation({
    summary: 'Activar o desactivar planta cliente de destino (ADMIN, CONTABILIDAD)',
    description: 'Conmuta el estado operativo sin borrar registros históricos.',
  })
  @ApiResponse({ status: 200, description: 'Estado actualizado' })
  @ApiResponse({ status: 403, description: 'Acceso denegado (Requiere ADMIN o CONTABILIDAD)' })
  async updateClientCenterStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.catalogsService.updateClientCenterStatus(id, body.isActive, user.id);
    return { success: true, data };
  }
}
