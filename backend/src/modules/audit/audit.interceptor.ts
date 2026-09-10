import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from './audit.service';

const ROUTE_TABLE_MAP: Record<string, string> = {
  users: 'users',
  suppliers: 'suppliers',
  'wood-receipts': 'wood_receipts',
  'daily-production': 'daily_productions',
  'daily-productions': 'daily_productions',
  fumigation: 'fumigations',
  fumigations: 'fumigations',
  dispatches: 'dispatch_headers',
  returns: 'return_headers',
  'inventory-adjustments': 'inventory_adjustments',
  products: 'products',
  catalogs: 'catalogs',
};

const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // Solo interceptar peticiones HTTP
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest();
    const method = (req.method || '').toUpperCase();

    // INVARIANTE: Omitir completamente llamadas de solo lectura (GET, HEAD, OPTIONS)
    if (READ_ONLY_METHODS.has(method)) {
      return next.handle();
    }

    const url: string = req.originalUrl || req.url || '';

    // Omitir endpoints de autenticación puros (/auth/login, /auth/refresh) de audit_logs de tablas
    // ya que no mapean a entidades físicas con UUID de registro propio
    if (url.includes('/auth/login') || url.includes('/auth/refresh')) {
      return next.handle();
    }

    // Inferencia de la tabla a partir de la ruta
    const segments = url.split('?')[0].split('/').filter(Boolean);
    // ej: ['api', 'v1', 'wood-receipts'] -> 'wood-receipts'
    const routeModule = segments[2] || segments[1] || segments[0] || '';
    const tableName = ROUTE_TABLE_MAP[routeModule] || routeModule.replace(/-/g, '_');

    // Determinar acción
    let action = 'INSERT';
    if (method === 'PUT' || method === 'PATCH') {
      action = url.includes('/status') ? 'UPDATE_STATUS' : 'UPDATE';
    } else if (method === 'DELETE') {
      action = 'DELETE';
    }

    return next.handle().pipe(
      tap({
        next: (responseBody) => {
          // Captura del usuario autenticado (JWT)
          const userId = req.user?.sub || req.user?.id;

          // Extracción del UUID del registro afectado
          const recordId =
            responseBody?.data?.id ||
            responseBody?.id ||
            req.params?.id;

          if (!userId || !recordId) {
            return;
          }

          // Despacho asíncrono no bloqueante (fire-and-forget)
          this.auditService
            .recordAuditLog({
              tableName,
              recordId,
              action,
              oldValues: method === 'DELETE' ? req.body : null,
              newValues:
                action === 'DELETE'
                  ? null
                  : responseBody?.data || responseBody || req.body,
              correctionReason:
                req.body?.reason ||
                req.body?.notes ||
                req.body?.observations ||
                `Operación ${action} vía ${method} ${url}`,
              userId,
            })
            .catch((err) => {
              this.logger.error(
                `[AuditInterceptor] Fallo en despacho asíncrono de auditoría: ${err?.message}`,
              );
            });
        },
      }),
    );
  }
}
