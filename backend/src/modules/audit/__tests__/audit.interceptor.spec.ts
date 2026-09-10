import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { AuditInterceptor } from '../audit.interceptor';
import { AuditService } from '../audit.service';

describe('AuditInterceptor', () => {
  let interceptor: AuditInterceptor;
  let auditService: jest.Mocked<AuditService>;

  beforeEach(() => {
    auditService = {
      recordAuditLog: jest.fn().mockResolvedValue(undefined),
      getAuditLogs: jest.fn(),
    } as any;

    interceptor = new AuditInterceptor(auditService);
  });

  function createMockContext(
    method: string,
    url: string,
    body: any = {},
    user: any = null,
    params: any = {},
  ): ExecutionContext {
    return {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({
          method,
          url,
          originalUrl: url,
          body,
          user,
          params,
          ip: '127.0.0.1',
          headers: { 'user-agent': 'Jest-Test' },
        }),
        getResponse: () => ({}),
      }),
    } as unknown as ExecutionContext;
  }

  function createMockCallHandler(responseData: any): CallHandler {
    return {
      handle: () => of(responseData),
    };
  }

  it('debe ignorar completamente llamadas de lectura GET (invariante read-only)', (done) => {
    const context = createMockContext('GET', '/api/v1/dashboard/kpis');
    const handler = createMockCallHandler({ success: true, data: {} });

    interceptor.intercept(context, handler).subscribe({
      next: () => {
        expect(auditService.recordAuditLog).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('debe ignorar endpoints de login /auth/login', (done) => {
    const context = createMockContext('POST', '/api/v1/auth/login', {
      email: 'test@example.com',
      password: 'secret',
    });
    const handler = createMockCallHandler({
      success: true,
      data: { token: 'jwt.token' },
    });

    interceptor.intercept(context, handler).subscribe({
      next: () => {
        expect(auditService.recordAuditLog).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('debe interceptar mutaciones POST en entidades de negocio y despachar registro asíncrono', (done) => {
    const userId = 'a1b2c3d4-0000-0000-0000-000000000001';
    const recordId = 'c1b2c3d4-0000-0000-0000-000000000001';
    const context = createMockContext(
      'POST',
      '/api/v1/wood-receipts',
      { lotNumber: 'LT-010926-01', quantity: 1500 },
      { id: userId },
    );
    const handler = createMockCallHandler({
      success: true,
      data: { id: recordId, lotNumber: 'LT-010926-01' },
    });

    interceptor.intercept(context, handler).subscribe({
      next: () => {
        expect(auditService.recordAuditLog).toHaveBeenCalledWith(
          expect.objectContaining({
            tableName: 'wood_receipts',
            recordId,
            action: 'INSERT',
            userId,
          }),
        );
        done();
      },
    });
  });
});
