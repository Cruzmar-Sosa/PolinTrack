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
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import {
  SingleUserResponseDto,
  UsersListResponseDto,
} from './dto/user-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';

@ApiTags('M12: Autenticación & Usuarios')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleType.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar usuarios del sistema con filtros y paginación (EP-USR-01)',
    description: 'Exclusivo para rol ADMIN. Permite filtrar por rol, estado y búsqueda textual.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista paginada de usuarios',
    type: UsersListResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Acceso denegado (Requiere ADMIN)' })
  async findAll(@Query() query: QueryUsersDto) {
    return this.usersService.findAll(query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Crear nuevo usuario y asignar rol operativo (EP-USR-02)',
    description:
      'Exclusivo para rol ADMIN. Crea la identidad en Supabase Auth y el perfil en public.users con el mismo UUID.',
  })
  @ApiResponse({
    status: 201,
    description: 'Usuario creado exitosamente',
    type: SingleUserResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Datos de validación inválidos' })
  @ApiResponse({ status: 403, description: 'Acceso denegado (Requiere ADMIN)' })
  @ApiResponse({ status: 409, description: 'El correo electrónico ya se encuentra registrado' })
  async create(
    @Body() createUserDto: CreateUserDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.usersService.create(createUserDto, admin.id);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Consultar usuario específico por ID (EP-USR-03)',
    description: 'Exclusivo para rol ADMIN. Retorna el perfil operativo sin exponer hashes.',
  })
  @ApiResponse({
    status: 200,
    description: 'Usuario localizado',
    type: SingleUserResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Acceso denegado (Requiere ADMIN)' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar nombre, rol o contraseña de un usuario (EP-USR-04)',
    description: 'Exclusivo para rol ADMIN. Registra cambios en AuditLog.',
  })
  @ApiResponse({
    status: 200,
    description: 'Usuario actualizado exitosamente',
    type: SingleUserResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 403, description: 'Acceso denegado (Requiere ADMIN)' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.usersService.update(id, updateUserDto, admin.id);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Cambiar estado activo / inactivo - Borrado Lógico (EP-USR-05)',
    description:
      'Exclusivo para rol ADMIN. Desactiva o activa lógicamente la cuenta sin eliminar registros históricos (Prohibido DELETE físico).',
  })
  @ApiResponse({
    status: 200,
    description: 'Estado del usuario actualizado exitosamente',
  })
  @ApiResponse({ status: 400, description: 'Intento de desactivar la propia cuenta de ADMIN' })
  @ApiResponse({ status: 403, description: 'Acceso denegado (Requiere ADMIN)' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateStatusDto: UpdateUserStatusDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.usersService.updateStatus(id, updateStatusDto, admin.id);
  }
}
