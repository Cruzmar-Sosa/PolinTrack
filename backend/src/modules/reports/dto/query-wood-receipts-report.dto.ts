import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { DateRangeDto } from './date-range.dto';

export class QueryWoodReceiptsReportDto extends DateRangeDto {
  @ApiPropertyOptional({
    description: 'Filtrar por número de lote de madera (ej. LT-010926-01)',
    example: 'LT-010926-01',
  })
  @IsOptional()
  @IsString({ message: 'lotNumber debe ser una cadena de texto' })
  lotNumber?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por ID de proveedor',
    example: 'a1b2c3d4-0000-0000-0000-000000000001',
  })
  @IsOptional()
  @IsUUID('4', { message: 'supplierId debe ser un UUID v4 válido' })
  supplierId?: string;
}
