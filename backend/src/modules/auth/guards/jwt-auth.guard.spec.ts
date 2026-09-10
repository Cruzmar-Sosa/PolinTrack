import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/database/prisma.service';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: Reflector;
  let configService: ConfigService;
  let prisma: PrismaService;

  beforeEach(() => {
    reflector = new Reflector();
    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'SUPABASE_URL') return 'https://mock.supabase.co';
        if (key === 'SUPABASE_ANON_KEY') return 'mock-anon-key';
        return null;
      }),
    } as unknown as ConfigService;
    prisma = {} as PrismaService;

    guard = new JwtAuthGuard(reflector, configService, prisma);
  });

  const createMockContext = (headers: Record<string, string> = {}, isPublic = false): ExecutionContext => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(isPublic);

    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ headers }),
      }),
    } as unknown as ExecutionContext;
  };

  it('should allow access immediately if route is marked @Public()', async () => {
    const context = createMockContext({}, true);
    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should throw UnauthorizedException if Authorization header is missing', async () => {
    const context = createMockContext({});

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    try {
      await guard.canActivate(context);
    } catch (err) {
      const res = (err as UnauthorizedException).getResponse() as any;
      expect(res.code).toBe('INVALID_CREDENTIALS');
      expect(res.message).toContain('Token de autenticación no proporcionado');
    }
  });

  it('should throw UnauthorizedException if Authorization header does not start with Bearer', async () => {
    const context = createMockContext({ authorization: 'Basic dXNlcjpwYXNz' });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });
});
