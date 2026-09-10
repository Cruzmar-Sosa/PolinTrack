import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class QueryDailyProductionDto {
  @ApiPropertyOptional({
    description: 'Fecha inicial para el rango de consulta (YYYY-MM-DD)',
    example: '2026-09-01',
  })
  @IsOptional()
  @IsISO8601({}, { message: 'startDate debe ser una fecha válida (YYYY-MM-DD)' })
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Fecha final para el rango de consulta (YYYY-MM-DD)',
    example: '2026-09-30',
  })
  @IsOptional()
  @IsISO8601({}, { message: 'endDate debe ser una fecha válida (YYYY-MM-DD)' })
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por ID del polín terminado',
    example: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  })
  @IsOptional()
  @IsUUID('4', { message: 'productId debe ser un UUID válido' })
  productId?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por número de semana ISO del año (1..53)',
    example: 36,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'isoWeek debe ser un número entero' })
  @Min(1, { message: 'isoWeek mínimo es 1' })
  @Max(53, { message: 'isoWeek máximo es 53' })
  isoWeek?: number;

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
