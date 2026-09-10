import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { DateRangeDto } from './date-range.dto';

export class QueryDistributionCentersReportDto extends DateRangeDto {
  @ApiPropertyOptional({
    description: 'Filtrar por ID de centro cliente (opcional)',
    example: 'c1b2c3d4-0000-0000-0000-000000000001',
  })
  @IsOptional()
  @IsUUID('4', { message: 'clientCenterId debe ser un UUID v4 válido' })
  clientCenterId?: string;
}
