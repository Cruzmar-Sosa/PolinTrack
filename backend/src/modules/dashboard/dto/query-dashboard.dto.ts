import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class QueryDashboardDto {
  @ApiPropertyOptional({
    description: 'Fecha inicial para el cálculo de KPIs en el período (formato YYYY-MM-DD)',
    example: '2026-09-01',
  })
  @IsOptional()
  @IsDateString({}, { message: 'startDate debe tener formato de fecha válido (YYYY-MM-DD)' })
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Fecha final para el cálculo de KPIs en el período (formato YYYY-MM-DD)',
    example: '2026-09-30',
  })
  @IsOptional()
  @IsDateString({}, { message: 'endDate debe tener formato de fecha válido (YYYY-MM-DD)' })
  endDate?: string;
}
