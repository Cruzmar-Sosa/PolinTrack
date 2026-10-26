import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorCode = 'INTERNAL_SERVER_ERROR';
    let message = 'Ocurrió un error inesperado en el servidor';
    let details: any[] = [];

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, any>;
        message = resObj.message || exception.message || message;
        errorCode = resObj.error || resObj.code || errorCode;

        if (Array.isArray(resObj.message)) {
          message = resObj.message[0] || message;
          details = resObj.message.map((msg: string) => ({ constraint: msg }));
        }

        if (resObj.details) {
          details = resObj.details;
        }

        if (resObj.code) {
          errorCode = resObj.code;
        }
      }

      // Map HTTP status to canonical error codes if generic
      if (status === HttpStatus.UNAUTHORIZED && errorCode === 'Unauthorized') {
        errorCode = 'INVALID_CREDENTIALS';
      } else if (status === HttpStatus.FORBIDDEN && errorCode === 'Forbidden') {
        errorCode = 'FORBIDDEN_ROLE';
      } else if (status === HttpStatus.NOT_FOUND && errorCode === 'Not Found') {
        errorCode = 'RESOURCE_NOT_FOUND';
      } else if (status === HttpStatus.BAD_REQUEST && errorCode === 'Bad Request') {
        errorCode = 'VALIDATION_ERROR';
      } else if (status === HttpStatus.CONFLICT && (errorCode === 'Conflict' || !errorCode)) {
        errorCode = 'CONFLICT';
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      this.logger.warn(`Prisma KnownRequestError [${exception.code}]: ${exception.message}`);

      switch (exception.code) {
        case 'P2002': {
          status = HttpStatus.CONFLICT;
          errorCode = 'CONFLICT';
          message = 'Ya existe un registro con el valor o identificador especificado';

          const targets = Array.isArray(exception.meta?.target)
            ? (exception.meta.target as string[])
            : typeof exception.meta?.target === 'string'
              ? [exception.meta.target]
              : [];

          const sanitizeTargetField = (raw: string): string => {
            if (raw === 'idempotency_key' || raw === 'idempotencyKey') {
              return 'idempotency_key';
            }
            if (raw.endsWith('_key_key')) {
              return 'idempotency_key';
            }
            const clean = raw.replace(/(_key|_unique)$/, '');
            const parts = clean.split('_');
            if (parts.length >= 2) {
              parts.shift();
              return parts.join('_');
            }
            return clean;
          };

          const safeFields = targets
            .map(sanitizeTargetField)
            .filter((t) => /^[a-zA-Z0-9_]+$/.test(t) && !t.includes(' '));

          if (safeFields.length > 0) {
            details = safeFields.map((field) => ({
              field,
              message: `El valor para '${field}' ya se encuentra en uso`,
            }));
          }
          break;
        }

        case 'P2025': {
          status = HttpStatus.NOT_FOUND;
          errorCode = 'RESOURCE_NOT_FOUND';
          message = 'El recurso solicitado no fue encontrado o no existe';
          break;
        }

        case 'P2003': {
          status = HttpStatus.BAD_REQUEST;
          errorCode = 'FOREIGN_KEY_VIOLATION';
          message = 'Referencia a entidad relacionada inválida o inexistente';
          break;
        }

        case 'P2023': {
          status = HttpStatus.BAD_REQUEST;
          errorCode = 'INVALID_IDENTIFIER';
          message = 'Identificador o parámetro con formato no válido';
          break;
        }

        default: {
          this.logger.error(
            `Prisma Unhandled KnownRequestError [${exception.code}]: ${exception.message}`,
            exception.stack,
          );
          status = HttpStatus.INTERNAL_SERVER_ERROR;
          errorCode = 'INTERNAL_SERVER_ERROR';
          message = 'Error interno del servidor';
          details = [];
          break;
        }
      }
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      this.logger.warn(`Prisma ValidationError: ${exception.message}`);
      status = HttpStatus.BAD_REQUEST;
      errorCode = 'VALIDATION_ERROR';
      message = 'Los datos proporcionados son incompatibles con la operación solicitada';
      details = [];
    } else if (
      exception instanceof Prisma.PrismaClientInitializationError ||
      exception instanceof Prisma.PrismaClientRustPanicError ||
      exception instanceof Prisma.PrismaClientUnknownRequestError
    ) {
      this.logger.error(
        `Prisma Engine/System Error: ${(exception as Error).message}`,
        (exception as Error).stack,
      );
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      errorCode = 'INTERNAL_SERVER_ERROR';
      message = 'Error interno del servidor';
      details = [];
    } else if (exception instanceof Error) {
      this.logger.error(`Unhandled Exception: ${exception.message}`, exception.stack);
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      errorCode = 'INTERNAL_SERVER_ERROR';
      message = 'Error interno del servidor';
      details = [];
    }

    response.status(status).json({
      success: false,
      error: {
        code: errorCode,
        message,
        details,
        timestamp: new Date().toISOString(),
        path: request?.url || '',
      },
    });
  }
}
