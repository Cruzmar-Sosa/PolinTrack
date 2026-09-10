import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private supabaseAdmin: SupabaseClient | null = null;
  private isPlaceholderKey = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL', '');
    const serviceRoleKey = this.configService.get<string>(
      'SUPABASE_SERVICE_ROLE_KEY',
      '',
    );

    this.isPlaceholderKey = !serviceRoleKey || serviceRoleKey.includes('placeholder');

    if (supabaseUrl && serviceRoleKey && !this.isPlaceholderKey) {
      this.supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
    } else {
      this.logger.warn(
        '⚠️ SUPABASE_SERVICE_ROLE_KEY no configurado o es placeholder. La administración de usuarios utilizará persistencia local segura con bcrypt.',
      );
    }
  }

  async findAll(query: QueryUsersDto) {
    const { role, isActive, search, page = 1, limit = 10 } = query;
    const isAll = limit === 0 || limit >= 10000;
    const skip = isAll ? undefined : (page - 1) * limit;
    const take = isAll ? undefined : limit;

    const where: Prisma.UserWhereInput = {};

    if (role) {
      where.role = role;
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    const totalPages = isAll ? 1 : Math.ceil(total / limit) || 1;

    return {
      success: true,
      data: users,
      meta: {
        total,
        page: isAll ? 1 : page,
        limit: isAll ? total : limit,
        totalPages,
      },
    };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Usuario con identificador '${id}' no encontrado en el sistema`,
      });
    }

    return {
      success: true,
      data: user,
    };
  }

  async create(dto: CreateUserDto, adminId: string) {
    const { email, password, fullName, role } = dto;

    // 1. Verify uniqueness in public.users
    const existingInDb = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingInDb) {
      throw new ConflictException({
        code: 'DUPLICATE_EMAIL',
        message: `El correo electrónico '${email}' ya se encuentra registrado en el sistema`,
      });
    }

    // 2. Create identity in Supabase Auth (IdP)
    let authUserId: string;
    let passwordHash = 'supabase_managed_auth_identity';

    if (this.supabaseAdmin && !this.isPlaceholderKey) {
      const { data: authData, error: authError } =
        await this.supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { fullName, role },
        });

      if (authError) {
        if (
          authError.message.toLowerCase().includes('already registered') ||
          authError.message.toLowerCase().includes('already exists')
        ) {
          throw new ConflictException({
            code: 'DUPLICATE_EMAIL',
            message: `El correo '${email}' ya existe en el proveedor de identidad Supabase Auth`,
          });
        }
        throw new BadRequestException({
          code: 'AUTH_IDENTITY_ERROR',
          message: `Error al crear identidad en Supabase Auth: ${authError.message}`,
        });
      }

      if (!authData?.user?.id) {
        throw new BadRequestException({
          code: 'AUTH_IDENTITY_ERROR',
          message: 'Supabase Auth no devolvió un identificador de usuario válido',
        });
      }

      authUserId = authData.user.id;
    } else {
      // Local fallback for local/standalone environments without service role
      authUserId = randomUUID();
      passwordHash = bcrypt.hashSync(password, 10);
    }

    // 3. Create operational profile in public.users strictly with authUserId
    let newUser;
    try {
      newUser = await this.prisma.user.create({
        data: {
          id: authUserId,
          email,
          passwordHash,
          fullName,
          role,
          isActive: true,
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch (dbError) {
      if (this.supabaseAdmin && !this.isPlaceholderKey) {
        await this.supabaseAdmin.auth.admin.deleteUser(authUserId).catch(() => {});
      }
      throw dbError;
    }

    // 4. Register audit log
    try {
      await this.prisma.auditLog.create({
        data: {
          tableName: 'users',
          recordId: newUser.id,
          action: 'INSERT',
          newValues: {
            id: newUser.id,
            email: newUser.email,
            fullName: newUser.fullName,
            role: newUser.role,
            isActive: newUser.isActive,
          },
          userId: adminId,
        },
      });
    } catch (auditError) {
      this.logger.error(`Error al registrar auditoría de creación de usuario: ${auditError}`);
    }

    return {
      success: true,
      data: newUser,
    };
  }

  async update(id: string, dto: UpdateUserDto, adminId: string) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!currentUser) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Usuario con ID '${id}' no encontrado`,
      });
    }

    // 1. Update password in Supabase Auth if provided
    let localPasswordHash: string | undefined;
    if (dto.password) {
      if (this.supabaseAdmin && !this.isPlaceholderKey) {
        const { error } = await this.supabaseAdmin.auth.admin.updateUserById(id, {
          password: dto.password,
        });

        if (error) {
          throw new BadRequestException({
            code: 'AUTH_UPDATE_ERROR',
            message: `No se pudo actualizar la contraseña en Supabase Auth: ${error.message}`,
          });
        }
      } else {
        localPasswordHash = bcrypt.hashSync(dto.password, 10);
      }
    }

    // 2. Update operational profile in public.users
    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.fullName ? { fullName: dto.fullName } : {}),
        ...(dto.role ? { role: dto.role } : {}),
        ...(localPasswordHash ? { passwordHash: localPasswordHash } : {}),
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // 3. Register audit log
    try {
      await this.prisma.auditLog.create({
        data: {
          tableName: 'users',
          recordId: id,
          action: 'UPDATE',
          oldValues: {
            fullName: currentUser.fullName,
            role: currentUser.role,
          },
          newValues: {
            fullName: updatedUser.fullName,
            role: updatedUser.role,
          },
          userId: adminId,
        },
      });
    } catch (auditErr) {
      this.logger.warn(`No se pudo registrar AuditLog para update ${id}: ${auditErr}`);
    }

    return {
      success: true,
      data: updatedUser,
    };
  }

  async updateStatus(id: string, dto: UpdateUserStatusDto, adminId: string) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!currentUser) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Usuario con ID '${id}' no encontrado`,
      });
    }

    if (id === adminId && dto.isActive === false) {
      throw new BadRequestException({
        code: 'CANNOT_DEACTIVATE_SELF',
        message: 'No puede desactivar su propia cuenta de Administrador',
      });
    }

    // 1. Update status in public.users
    const updated = await this.prisma.user.update({
      where: { id },
      data: { isActive: dto.isActive },
      select: {
        id: true,
        isActive: true,
        updatedAt: true,
      },
    });

    // 2. Ban/unban in Supabase Auth if admin client configured
    if (this.supabaseAdmin) {
      try {
        await this.supabaseAdmin.auth.admin.updateUserById(id, {
          ban_duration: dto.isActive ? 'none' : '876000h',
        });
      } catch (authErr) {
        this.logger.warn(`Error al actualizar ban_duration en Supabase Auth para ${id}: ${authErr}`);
      }
    }

    // 3. Register audit log
    try {
      await this.prisma.auditLog.create({
        data: {
          tableName: 'users',
          recordId: id,
          action: 'UPDATE_STATUS',
          oldValues: { isActive: currentUser.isActive },
          newValues: { isActive: dto.isActive },
          userId: adminId,
        },
      });
    } catch (auditErr) {
      this.logger.warn(`No se pudo registrar AuditLog para status ${id}: ${auditErr}`);
    }

    return {
      success: true,
      data: updated,
    };
  }
}
