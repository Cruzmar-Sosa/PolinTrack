import {
  ExecutionContext,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../../database/prisma.service';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private supabase: SupabaseClient | null = null;
  private readonly jwtService: JwtService;

  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    @Optional() jwtService?: JwtService,
  ) {
    super();

    const jwtSecret =
      configService.get<string>('SUPABASE_JWT_SECRET') ||
      configService.get<string>('JWT_SECRET');

    if (!jwtSecret || jwtSecret.trim().length < 16) {
      throw new Error(
        'Configuración insegura detectada: Se requiere SUPABASE_JWT_SECRET o JWT_SECRET (mínimo 16 caracteres) para la inicialización de JwtAuthGuard.',
      );
    }

    this.jwtService = jwtService || new JwtService({ secret: jwtSecret.trim() });

    const supabaseUrl = configService.get<string>('SUPABASE_URL', '');
    const supabaseAnonKey = configService.get<string>('SUPABASE_ANON_KEY', '');
    if (supabaseUrl && supabaseAnonKey) {
      this.supabase = createClient(supabaseUrl, supabaseAnonKey);
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Token de autenticación no proporcionado',
      });
    }

    const token = authHeader.replace('Bearer ', '').trim();

    // 1. Verificación local autoritativa de tokens JWT (eliminada doble validación redundante)
    try {
      const payload: any = this.jwtService.verify(token);
      if (payload && (payload.sub || payload.email)) {
        const user = await this.prisma.user.findFirst({
          where: {
            OR: [
              ...(payload.sub ? [{ id: payload.sub }] : []),
              ...(payload.email ? [{ email: payload.email }] : []),
            ],
          },
        });

        if (!user) {
          throw new UnauthorizedException({
            code: 'INVALID_CREDENTIALS',
            message: 'Usuario no registrado en el sistema operativo',
          });
        }

        if (!user.isActive) {
          throw new UnauthorizedException({
            code: 'USER_INACTIVE',
            message: 'El usuario se encuentra inactivo. Contacte al administrador.',
          });
        }

        request.user = {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
        };

        return true;
      }
    } catch (err: any) {
      // Si la excepción fue lanzada por usuario inexistente o inactivo en la base de datos,
      // se debe propagar de inmediato para no intentar reactivar mediante GoTrue.
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      // Si el token falló por firma o expiración en la verificación local, continúa al fallback defensivo.
    }

    // 2. Fallback defensivo: Verificación autoritativa con Supabase GoTrue Auth API
    if (!this.supabase) {
      throw new UnauthorizedException({
        code: 'TOKEN_INVALID',
        message: 'Token de autenticación inválido o no reconocido',
      });
    }

    let data: any;
    let error: any;
    try {
      const result = await this.supabase.auth.getUser(token);
      data = result.data;
      error = result.error;
    } catch (apiError: any) {
      throw new UnauthorizedException({
        code: 'AUTH_PROVIDER_ERROR',
        message: 'Error al contactar con el proveedor de autenticación Supabase Auth',
      });
    }

    if (error || !data?.user) {
      const isExpired = error?.message?.toLowerCase().includes('expired');
      throw new UnauthorizedException({
        code: isExpired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
        message: isExpired
          ? 'El token de sesión ha expirado. Inicie sesión nuevamente.'
          : 'Token de autenticación inválido o no reconocido por Supabase Auth',
      });
    }

    const supabaseUser = data.user;

    // 3. Resolver usuario en public.users
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { id: supabaseUser.id },
          ...(supabaseUser.email ? [{ email: supabaseUser.email }] : []),
        ],
      },
    });

    if (!user) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Usuario no registrado en el sistema operativo',
      });
    }

    if (!user.isActive) {
      throw new UnauthorizedException({
        code: 'USER_INACTIVE',
        message: 'El usuario se encuentra inactivo. Contacte al administrador.',
      });
    }

    request.user = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    };

    return true;
  }
}
