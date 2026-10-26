import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { DateRangeDto } from './date-range.dto';

export class QueryDistributionCentersReportDto extends DateRangeDto {
  @ApiPropertyOptional({
    description: 'Filtrar por ID de centro cliente (opcional)',
    example: 'c1b2c3d4-0000-0000-0000-000000000001',
  })
  @IsOptional()
  @IsUUID('4', { message: 'clientCenterId debe ser un UUID v4 válido' })
  clientCenterId?: string;

  @ApiPropertyOptional({
    description: 'Cantidad de registros por página (mínimo 1, máximo 100, predeterminado 50)',
    example: 50,
    default: 50,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit debe ser un número entero' })
  @Min(1, { message: 'limit debe ser al menos 1' })
  @Max(100, { message: 'El límite máximo permitido por página es 100' })
  limit?: number = 50;
}
