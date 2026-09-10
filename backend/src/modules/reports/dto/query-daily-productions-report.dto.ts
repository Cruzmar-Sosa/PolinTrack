import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { DateRangeDto } from './date-range.dto';

export class QueryDailyProductionsReportDto extends DateRangeDto {
  @ApiPropertyOptional({
    description: 'Filtrar por ID de producto (opcional)',
    example: 'b1b2c3d4-0000-0000-0000-000000000001',
  })
  @IsOptional()
  @IsUUID('4', { message: 'productId debe ser un UUID v4 válido' })
  productId?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por número de semana ISO (1..53)',
    example: 36,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'isoWeek debe ser un número entero' })
  @Min(1, { message: 'isoWeek debe ser entre 1 y 53' })
  @Max(53, { message: 'isoWeek debe ser entre 1 y 53' })
  isoWeek?: number;
}
