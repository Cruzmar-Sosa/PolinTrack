import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleType } from '@prisma/client';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  const createMockContext = (user?: any): ExecutionContext => {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ user }),
      }),
    } as unknown as ExecutionContext;
  };

  it('should allow access if no roles are required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(null);
    const context = createMockContext({ role: RoleType.CONSULTA });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw UnauthorizedException if user is not attached to request', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([RoleType.ADMIN]);
    const context = createMockContext(undefined);

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('should allow ADMIN when ADMIN role is required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([RoleType.ADMIN]);
    const context = createMockContext({ role: RoleType.ADMIN });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow CONTABILIDAD when [ADMIN, CONTABILIDAD] are required', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([RoleType.ADMIN, RoleType.CONTABILIDAD]);
    const context = createMockContext({ role: RoleType.CONTABILIDAD });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw ForbiddenException when CONSULTA attempts to access ADMIN endpoint', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([RoleType.ADMIN]);
    const context = createMockContext({ role: RoleType.CONSULTA });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException when CONSULTA attempts to access CONTABILIDAD endpoint', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([RoleType.ADMIN, RoleType.CONTABILIDAD]);
    const context = createMockContext({ role: RoleType.CONSULTA });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException with code FORBIDDEN_ROLE and message referencing RN-004', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([RoleType.ADMIN]);
    const context = createMockContext({ role: RoleType.CONTABILIDAD });

    try {
      guard.canActivate(context);
      fail('Should have thrown ForbiddenException');
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenException);
      const response = (err as ForbiddenException).getResponse() as any;
      expect(response.code).toBe('FORBIDDEN_ROLE');
      expect(response.message).toContain('RN-004');
    }
  });
});
