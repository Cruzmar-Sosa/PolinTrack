import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class QueryAuditLogDto {
  @ApiPropertyOptional({
    description: 'Filtrar por nombre de tabla/entidad (ej. users, suppliers, wood_receipts)',
    example: 'wood_receipts',
  })
  @IsOptional()
  @IsString()
  tableName?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por tipo de acción (ej. INSERT, UPDATE, CORRECTION, DELETE)',
    example: 'INSERT',
  })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por ID de usuario actor',
    example: 'a1b2c3d4-0000-0000-0000-000000000001',
  })
  @IsOptional()
  @IsUUID('4')
  userId?: string;

  @ApiPropertyOptional({
    description: 'Fecha inicial para filtro de auditoría (YYYY-MM-DD)',
    example: '2026-09-01',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Fecha final para filtro de auditoría (YYYY-MM-DD)',
    example: '2026-09-30',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Página (base 1)',
    example: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Cantidad por página',
    example: 50,
    default: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;
}
