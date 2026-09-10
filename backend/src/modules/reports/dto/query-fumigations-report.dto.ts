import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { DateRangeDto } from './date-range.dto';

export class QueryFumigationsReportDto extends DateRangeDto {
  @ApiPropertyOptional({
    description: 'Filtrar por lote de producción (ej. LT-010926-W36)',
    example: 'LT-010926-W36',
  })
  @IsOptional()
  @IsString({ message: 'productionLot debe ser una cadena de texto' })
  productionLot?: string;
}
