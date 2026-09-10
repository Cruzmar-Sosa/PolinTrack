import { ApiPropertyOptional } from '@nestjs/swagger';
import { MovementType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class QueryKardexDto {
  @ApiPropertyOptional({
    description: 'Filtrar movimientos por ID del producto terminado (polín)',
    example: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  })
  @IsOptional()
  @IsUUID('4', { message: 'El productId debe ser un UUID válido' })
  productId?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por tipo de movimiento físico en el ledger',
    enum: MovementType,
    example: MovementType.PRODUCTION,
  })
  @IsOptional()
  @IsEnum(MovementType, {
    message: 'El movementType debe ser PRODUCTION, DISPATCH, RETURN o ADJUSTMENT',
  })
  movementType?: MovementType;

  @ApiPropertyOptional({
    description: 'Fecha inicial para el rango de consulta (YYYY-MM-DD)',
    example: '2026-09-01',
  })
  @IsOptional()
  @IsISO8601({}, { message: 'startDate debe ser una fecha ISO válida (YYYY-MM-DD)' })
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Fecha final para el rango de consulta (YYYY-MM-DD)',
    example: '2026-09-30',
  })
  @IsOptional()
  @IsISO8601({}, { message: 'endDate debe ser una fecha ISO válida (YYYY-MM-DD)' })
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Número de página para paginación',
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Cantidad de registros por página (0 para Todas)',
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  limit?: number = 10;
}
