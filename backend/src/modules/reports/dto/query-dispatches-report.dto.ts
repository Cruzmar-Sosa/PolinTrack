import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { DateRangeDto } from './date-range.dto';

export class QueryDispatchesReportDto extends DateRangeDto {
  @ApiPropertyOptional({
    description: 'Filtrar por ID de la planta cliente (1 de 7 plantas)',
    example: 'c1b2c3d4-0000-0000-0000-000000000001',
  })
  @IsOptional()
  @IsUUID('4', { message: 'clientCenterId debe ser un UUID v4 válido' })
  clientCenterId?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por lote de producción (ej. LT-010926-W36)',
    example: 'LT-010926-W36',
  })
  @IsOptional()
  @IsString({ message: 'productionLot debe ser una cadena de texto' })
  productionLot?: string;
}
