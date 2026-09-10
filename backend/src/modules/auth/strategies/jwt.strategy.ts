import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';

export interface JwtPayload {
  sub: string;
  email?: string;
  role?: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const jwtSecret =
      configService.get<string>('SUPABASE_JWT_SECRET') ||
      configService.get<string>('JWT_SECRET') ||
      'polintrack_jwt_fallback_secret_key_2026';

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: JwtPayload) {
    const sub = payload.sub;
    const email = payload.email;

    if (!sub && !email) {
      throw new UnauthorizedException({
        code: 'TOKEN_INVALID',
        message: 'Token JWT inválido: no contiene identificador ni correo',
      });
    }

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          ...(sub ? [{ id: sub }] : []),
          ...(email ? [{ email }] : []),
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

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    };
  }
}
