import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class QueryWoodReceiptDto {
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
    description: 'Filtrar por proveedor específico',
    example: '594aeb10-8867-4469-a5db-93152720926f',
  })
  @IsOptional()
  @IsUUID('4', { message: 'supplierId debe ser un UUID válido' })
  supplierId?: string;

  @ApiPropertyOptional({
    description: 'Filtrar o buscar por número de lote (ej: LT-020926-01)',
    example: 'LT-020926',
  })
  @IsOptional()
  @IsString()
  lotNumber?: string;

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
