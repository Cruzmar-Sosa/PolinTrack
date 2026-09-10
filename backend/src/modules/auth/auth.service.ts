import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../database/prisma.service';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as bcrypt from 'bcryptjs';
import { LoginRequestDto } from './dto/login-request.dto';
import { LoginResponseDto } from './dto/login-response.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private supabase: SupabaseClient;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL', '');
    const supabaseAnonKey = this.configService.get<string>('SUPABASE_ANON_KEY', '');

    if (!supabaseUrl || !supabaseAnonKey) {
      this.logger.warn('⚠️ SUPABASE_URL o SUPABASE_ANON_KEY no están configurados en AuthService');
    }

    this.supabase = createClient(supabaseUrl, supabaseAnonKey);
  }

  async login(loginDto: LoginRequestDto): Promise<LoginResponseDto> {
    const { email, password } = loginDto;

    // 1. Resolve operational user in public.users first
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      this.logger.warn(`Intento de login para usuario no registrado: ${email}`);
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Correo electrónico o contraseña incorrectos. Verifique sus datos o contacte al Administrador',
      });
    }

    if (!user.isActive) {
      this.logger.warn(`Usuario inactivo intentó acceder: ${email}`);
      throw new UnauthorizedException({
        code: 'USER_INACTIVE',
        message: 'El usuario se encuentra inactivo. Contacte al Administrador.',
      });
    }

    // 2. Attempt authentication with Supabase Auth (IdP)
    let accessToken: string | null = null;
    let refreshToken: string | null = null;
    let expiresInSeconds = 3600;

    try {
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (!error && data?.session) {
        accessToken = data.session.access_token;
        refreshToken = data.session.refresh_token;
        expiresInSeconds = data.session.expires_in;
      }
    } catch {
      // Supabase connection drop - fallback to local hash verification
    }

    // 3. Fallback to bcrypt verification against public.users if Supabase IdP does not have identity
    if (!accessToken) {
      const isPasswordValid = bcrypt.compareSync(password, user.passwordHash);
      if (!isPasswordValid) {
        this.logger.warn(`Intento de login con contraseña incorrecta para: ${email}`);
        throw new UnauthorizedException({
          code: 'INVALID_CREDENTIALS',
          message: 'Correo electrónico o contraseña incorrectos. Verifique sus datos o contacte al Administrador',
        });
      }

      // Issue signed JWT token via JwtService matching JwtStrategy configuration
      accessToken = this.jwtService.sign({
        sub: user.id,
        email: user.email,
        role: user.role,
      });

      refreshToken = this.jwtService.sign(
        { sub: user.id, type: 'refresh' },
        { expiresIn: '7d' },
      );
    }

    return {
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
        },
        accessToken: accessToken!,
        refreshToken: refreshToken || '',
        expiresInSeconds,
      },
    };
  }

  async refresh(refreshToken: string) {
    // 1. Try Supabase Auth refresh
    try {
      const { data, error } = await this.supabase.auth.refreshSession({
        refresh_token: refreshToken,
      });

      if (!error && data?.session) {
        return {
          success: true,
          data: {
            accessToken: data.session.access_token,
            refreshToken: data.session.refresh_token,
            expiresInSeconds: data.session.expires_in,
          },
        };
      }
    } catch {
      // Fallback
    }

    // 2. Fallback via JwtService verification
    try {
      const payload = this.jwtService.verify(refreshToken);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException({
          code: 'TOKEN_INVALID',
          message: 'El refresh token es inválido o el usuario está inactivo',
        });
      }

      const newAccessToken = this.jwtService.sign({
        sub: user.id,
        email: user.email,
        role: user.role,
      });

      return {
        success: true,
        data: {
          accessToken: newAccessToken,
          refreshToken,
          expiresInSeconds: 3600,
        },
      };
    } catch {
      throw new UnauthorizedException({
        code: 'TOKEN_INVALID',
        message: 'El refresh token es inválido o ha caducado',
      });
    }
  }

  async logout() {
    await this.supabase.auth.signOut();
    return {
      success: true,
      message: 'Sesión cerrada exitosamente',
    };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Usuario no encontrado',
      });
    }

    return {
      success: true,
      data: user,
    };
  }
}
