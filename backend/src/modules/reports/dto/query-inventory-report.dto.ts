import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';
import { DateRangeDto } from './date-range.dto';

export class QueryInventoryReportDto extends DateRangeDto {
  @ApiPropertyOptional({
    description: 'Filtrar por ID de producto / tipo de polín (opcional)',
    example: 'b1b2c3d4-0000-0000-0000-000000000001',
  })
  @IsOptional()
  @IsUUID('4', { message: 'productId debe ser un UUID v4 válido' })
  productId?: string;

  @ApiPropertyOptional({
    description: 'Fecha de corte acumulada para balance de inventario (formato YYYY-MM-DD)',
    example: '2026-09-09',
  })
  @IsOptional()
  @IsDateString({}, { message: 'asOfDate debe tener formato de fecha válido (YYYY-MM-DD)' })
  asOfDate?: string;
}

