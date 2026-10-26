import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter (H-01 Unit Tests)', () => {
  let filter: HttpExceptionFilter;
  let mockResponse: any;
  let mockRequest: any;
  let mockHost: any;
  let capturedStatus: number;
  let capturedBody: any;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    capturedStatus = 0;
    capturedBody = null;

    mockResponse = {
      status: jest.fn().mockImplementation((status: number) => {
        capturedStatus = status;
        return mockResponse;
      }),
      json: jest.fn().mockImplementation((body: any) => {
        capturedBody = body;
        return mockResponse;
      }),
    };

    mockRequest = {
      url: '/api/v1/test-endpoint',
    };

    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    };
  });

  describe('Standard HttpExceptions', () => {
    it('debe preservar estado, código y formato de BadRequestException', () => {
      const exception = new BadRequestException('Parámetro inválido');

      filter.catch(exception, mockHost);

      expect(capturedStatus).toBe(HttpStatus.BAD_REQUEST);
      expect(capturedBody.success).toBe(false);
      expect(capturedBody.error.code).toBe('VALIDATION_ERROR');
      expect(capturedBody.error.message).toBe('Parámetro inválido');
      expect(capturedBody.error.path).toBe('/api/v1/test-endpoint');
      expect(capturedBody.error.timestamp).toBeDefined();
    });

    it('debe preservar estado y código canónico para NotFoundException', () => {
      const exception = new NotFoundException('Elemento no encontrado');

      filter.catch(exception, mockHost);

      expect(capturedStatus).toBe(HttpStatus.NOT_FOUND);
      expect(capturedBody.error.code).toBe('RESOURCE_NOT_FOUND');
      expect(capturedBody.error.message).toBe('Elemento no encontrado');
    });

    it('debe preservar estado y código canónico para ConflictException', () => {
      const exception = new ConflictException('Conflicto detectado');

      filter.catch(exception, mockHost);

      expect(capturedStatus).toBe(HttpStatus.CONFLICT);
      expect(capturedBody.error.code).toBe('CONFLICT');
      expect(capturedBody.error.message).toBe('Conflicto detectado');
    });

    it('debe mapear UnauthorizedException a INVALID_CREDENTIALS si no trae código propio', () => {
      const exception = new UnauthorizedException('No autorizado');

      filter.catch(exception, mockHost);

      expect(capturedStatus).toBe(HttpStatus.UNAUTHORIZED);
      expect(capturedBody.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('debe mapear ForbiddenException a FORBIDDEN_ROLE si no trae código propio', () => {
      const exception = new ForbiddenException('Acceso restringido');

      filter.catch(exception, mockHost);

      expect(capturedStatus).toBe(HttpStatus.FORBIDDEN);
      expect(capturedBody.error.code).toBe('FORBIDDEN_ROLE');
    });

    it('debe respetar el código personalizado si la excepción lo provee en su cuerpo', () => {
      const exception = new BadRequestException({
        code: 'CUSTOM_DOMAIN_ERROR',
        message: 'Regla de negocio violada',
      });

      filter.catch(exception, mockHost);

      expect(capturedStatus).toBe(HttpStatus.BAD_REQUEST);
      expect(capturedBody.error.code).toBe('CUSTOM_DOMAIN_ERROR');
      expect(capturedBody.error.message).toBe('Regla de negocio violada');
    });
  });

  describe('PrismaClientKnownRequestError - Mapeo selectivo H-01', () => {
    it('P2002: debe mapear error de unicidad a 409 CONFLICT con target sanitizado sin filtrar SQL', () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the constraint: quantity_corrections_idempotency_key_key',
        {
          code: 'P2002',
          clientVersion: '5.x',
          meta: { target: ['idempotency_key'] },
        },
      );

      filter.catch(prismaError, mockHost);

      expect(capturedStatus).toBe(HttpStatus.CONFLICT);
      expect(capturedBody.success).toBe(false);
      expect(capturedBody.error.code).toBe('CONFLICT');
      expect(capturedBody.error.message).toBe(
        'Ya existe un registro con el valor o identificador especificado',
      );
      // No debe contener el mensaje interno de Prisma ni el nombre del constraint SQL en el mensaje principal
      expect(capturedBody.error.message).not.toContain('quantity_corrections_idempotency_key_key');
      expect(capturedBody.error.message).not.toContain('Unique constraint failed');
      // Debe contener detalle sanitizado
      expect(capturedBody.error.details).toEqual([
        {
          field: 'idempotency_key',
          message: "El valor para 'idempotency_key' ya se encuentra en uso",
        },
      ]);
    });

    it('P2002: debe sanitizar sufijos _key de constraints internos en el target', () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the constraint: users_email_key',
        {
          code: 'P2002',
          clientVersion: '5.x',
          meta: { target: 'email_key' },
        },
      );

      filter.catch(prismaError, mockHost);

      expect(capturedStatus).toBe(HttpStatus.CONFLICT);
      expect(capturedBody.error.code).toBe('CONFLICT');
      expect(capturedBody.error.details).toEqual([
        {
          field: 'email',
          message: "El valor para 'email' ya se encuentra en uso",
        },
      ]);
    });

    it('P2025: debe mapear registro inexistente en update/delete a 404 RESOURCE_NOT_FOUND', () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'An operation failed because it depends on one or more records that were required but not found. Record to update not found.',
        {
          code: 'P2025',
          clientVersion: '5.x',
        },
      );

      filter.catch(prismaError, mockHost);

      expect(capturedStatus).toBe(HttpStatus.NOT_FOUND);
      expect(capturedBody.error.code).toBe('RESOURCE_NOT_FOUND');
      expect(capturedBody.error.message).toBe('El recurso solicitado no fue encontrado o no existe');
      expect(capturedBody.error.message).not.toContain('Record to update not found');
    });

    it('P2003: debe mapear violación de clave foránea a 400 FOREIGN_KEY_VIOLATION sin filtrar schema', () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Foreign key constraint failed on the field: `supplierId` referencing `suppliers` table',
        {
          code: 'P2003',
          clientVersion: '5.x',
          meta: { field_name: 'supplierId' },
        },
      );

      filter.catch(prismaError, mockHost);

      expect(capturedStatus).toBe(HttpStatus.BAD_REQUEST);
      expect(capturedBody.error.code).toBe('FOREIGN_KEY_VIOLATION');
      expect(capturedBody.error.message).toBe(
        'Referencia a entidad relacionada inválida o inexistente',
      );
      expect(capturedBody.error.message).not.toContain('suppliers');
    });

    it('P2023: debe mapear inconsistencia de identificador/columna a 400 INVALID_IDENTIFIER', () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Inconsistent column data: Malformed UUID value',
        {
          code: 'P2023',
          clientVersion: '5.x',
        },
      );

      filter.catch(prismaError, mockHost);

      expect(capturedStatus).toBe(HttpStatus.BAD_REQUEST);
      expect(capturedBody.error.code).toBe('INVALID_IDENTIFIER');
      expect(capturedBody.error.message).toBe('Identificador o parámetro con formato no válido');
    });

    it('códigos Prisma de infraestructura/conexión no mapeables (e.g. P1001, P2024) deben ser 500 genérico', () => {
      const connectionError = new Prisma.PrismaClientKnownRequestError(
        "Can't reach database server at `localhost:5433`",
        {
          code: 'P1001',
          clientVersion: '5.x',
        },
      );

      filter.catch(connectionError, mockHost);

      expect(capturedStatus).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(capturedBody.error.code).toBe('INTERNAL_SERVER_ERROR');
      expect(capturedBody.error.message).toBe('Error interno del servidor');
      expect(capturedBody.error.details).toEqual([]);
      // No filtrar puerto ni host
      expect(JSON.stringify(capturedBody)).not.toContain('5433');
      expect(JSON.stringify(capturedBody)).not.toContain('localhost');
    });
  });

  describe('PrismaClientValidationError y Errores de Motor', () => {
    it('PrismaClientValidationError debe mapearse a 400 VALIDATION_ERROR sin exponer AST interno', () => {
      const validationError = new Prisma.PrismaClientValidationError(
        'Invalid `prisma.user.create()` invocation: Argument `email` is missing.',
        { clientVersion: '5.x' },
      );

      filter.catch(validationError, mockHost);

      expect(capturedStatus).toBe(HttpStatus.BAD_REQUEST);
      expect(capturedBody.error.code).toBe('VALIDATION_ERROR');
      expect(capturedBody.error.message).toBe(
        'Los datos proporcionados son incompatibles con la operación solicitada',
      );
      expect(JSON.stringify(capturedBody)).not.toContain('prisma.user.create');
    });

    it('PrismaClientInitializationError debe responder 500 genérico sin filtrar credenciales', () => {
      const initError = new Prisma.PrismaClientInitializationError(
        'Authentication failed against database user `postgres` with password `secret_db_pass`',
        '5.x',
      );

      filter.catch(initError, mockHost);

      expect(capturedStatus).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(capturedBody.error.code).toBe('INTERNAL_SERVER_ERROR');
      expect(capturedBody.error.message).toBe('Error interno del servidor');
      expect(JSON.stringify(capturedBody)).not.toContain('secret_db_pass');
      expect(JSON.stringify(capturedBody)).not.toContain('postgres');
    });

    it('PrismaClientRustPanicError debe responder 500 genérico', () => {
      const panicError = new Prisma.PrismaClientRustPanicError('Query engine panicked', '5.x');

      filter.catch(panicError, mockHost);

      expect(capturedStatus).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(capturedBody.error.code).toBe('INTERNAL_SERVER_ERROR');
      expect(capturedBody.error.message).toBe('Error interno del servidor');
    });
  });

  describe('Errores genéricos inesperados', () => {
    it('debe capturar Error imprevisto y responder 500 sin exponer stack trace', () => {
      const unexpectedError = new Error('Unexpected NullReference in unmapped code path');

      filter.catch(unexpectedError, mockHost);

      expect(capturedStatus).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(capturedBody.error.code).toBe('INTERNAL_SERVER_ERROR');
      expect(capturedBody.error.message).toBe('Error interno del servidor');
      expect(capturedBody.error.details).toEqual([]);
      expect(JSON.stringify(capturedBody)).not.toContain('NullReference');
      expect(capturedBody.error.stack).toBeUndefined();
    });
  });
});
