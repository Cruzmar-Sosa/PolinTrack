import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

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
      }
    } else if (exception instanceof Error) {
      this.logger.error(`Unhandled Exception: ${exception.message}`, exception.stack);
      message = 'Error interno del servidor';
    }

    response.status(status).json({
      success: false,
      error: {
        code: errorCode,
        message,
        details,
        timestamp: new Date().toISOString(),
        path: request.url,
      },
    });
  }
}
