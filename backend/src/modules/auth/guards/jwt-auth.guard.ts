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

  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    @Optional() private readonly jwtService?: JwtService,
  ) {
    super();
    if (!this.jwtService) {
      const jwtSecret =
        configService.get<string>('SUPABASE_JWT_SECRET') ||
        configService.get<string>('JWT_SECRET') ||
        'polintrack_jwt_fallback_secret_key_2026';
      this.jwtService = new JwtService({ secret: jwtSecret });
    }

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

    // 1. Verify local JWT tokens if jwtService is available
    if (this.jwtService) {
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
        if (err instanceof UnauthorizedException) {
          throw err;
        }
        // If not local JWT or secret mismatch, fallback to Passport/Supabase
      }
    }

    // 2. Attempt verification via Passport Strategy if configured
    try {
      const passportResult = await super.canActivate(context);
      if (passportResult && request.user) {
        return true;
      }
    } catch (err: any) {
      if (err instanceof UnauthorizedException) {
        const res: any = err.getResponse();
        if (res?.code === 'USER_INACTIVE') {
          throw err;
        }
      }
      // If passport verification fails (e.g. secret mismatch), fallback to Supabase GoTrue Auth API
    }

    // 3. Fallback: Authoritative Supabase Auth verification
    if (!this.supabase) {
      throw new UnauthorizedException({
        code: 'TOKEN_INVALID',
        message: 'Servicio de autenticación no disponible',
      });
    }

    const { data, error } = await this.supabase.auth.getUser(token);

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

    // 3. Resolve user in public.users
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

    // Attach verified user to request
    request.user = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    };

    return true;
  }
}
