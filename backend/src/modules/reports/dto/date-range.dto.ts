import { BadRequestException } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';

export class DateRangeDto {
  @ApiPropertyOptional({
    description: 'Fecha inicial del rango (formato YYYY-MM-DD)',
    example: '2026-09-01',
  })
  @IsOptional()
  @IsDateString({}, { message: 'startDate debe tener formato de fecha válido (YYYY-MM-DD)' })
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Fecha final del rango (formato YYYY-MM-DD)',
    example: '2026-09-30',
  })
  @IsOptional()
  @IsDateString({}, { message: 'endDate debe tener formato de fecha válido (YYYY-MM-DD)' })
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Número de página para paginación (base 1)',
    example: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page debe ser un número entero' })
  @Min(1, { message: 'page debe ser al menos 1' })
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Cantidad de registros por página (0 para Todas)',
    example: 10,
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit debe ser un número entero' })
  @Min(0, { message: 'limit debe ser al menos 0' })
  limit?: number = 10;
}

/**
 * Valida la Regla de Negocio RN-007: startDate <= endDate.
 * Si startDate > endDate, lanza BadRequestException (400) con el mensaje exacto normativo.
 */
export function validateDateRange(startDate?: string, endDate?: string): { start?: Date; end?: Date } {
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start > end) {
      throw new BadRequestException({
        code: 'INVALID_DATE_RANGE',
        message: 'La fecha inicial no puede ser posterior a la fecha final',
      });
    }

    // Set end to end of day in UTC for inclusive filtering
    const inclusiveEnd = new Date(endDate);
    inclusiveEnd.setUTCHours(23, 59, 59, 999);

    return { start, end: inclusiveEnd };
  }

  const start = startDate ? new Date(startDate) : undefined;
  const end = endDate ? new Date(endDate) : undefined;
  if (end) {
    end.setUTCHours(23, 59, 59, 999);
  }

  return { start, end };
}
