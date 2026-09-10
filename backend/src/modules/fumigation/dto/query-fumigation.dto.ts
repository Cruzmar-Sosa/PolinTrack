import {
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

@ValidatorConstraint({ name: 'isStartDateBeforeOrEqualEndDate', async: false })
export class IsStartDateBeforeOrEqualEndDateConstraint
  implements ValidatorConstraintInterface
{
  validate(_value: any, args: ValidationArguments) {
    const obj = args.object as any;
    if (obj.startDate && obj.endDate) {
      const start = new Date(obj.startDate);
      const end = new Date(obj.endDate);
      return start <= end;
    }
    return true;
  }

  defaultMessage() {
    return 'La fecha de inicio (startDate) no puede ser posterior a la fecha fin (endDate) [RN-007].';
  }
}

export class QueryFumigationDto {
  @ApiPropertyOptional({
    description: 'Filtrar por UUID del lote de producción diaria',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsOptional()
  @IsUUID('4', { message: 'El dailyProductionId debe ser un UUID v4 válido' })
  dailyProductionId?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por número de certificado OIRSA (búsqueda parcial insensible a mayúsculas)',
    example: 'OIRSA-CERT',
  })
  @IsOptional()
  @IsString({ message: 'El certificateNumber debe ser una cadena de texto' })
  certificateNumber?: string;

  @ApiPropertyOptional({
    description: 'Fecha de inicio del rango de búsqueda (YYYY-MM-DD)',
    example: '2026-09-01',
  })
  @IsOptional()
  @IsISO8601(
    { strict: true },
    { message: 'startDate debe tener formato válido YYYY-MM-DD' },
  )
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Fecha de fin del rango de búsqueda (YYYY-MM-DD)',
    example: '2026-09-30',
  })
  @IsOptional()
  @IsISO8601(
    { strict: true },
    { message: 'endDate debe tener formato válido YYYY-MM-DD' },
  )
  @Validate(IsStartDateBeforeOrEqualEndDateConstraint)
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Número de página',
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La página debe ser un número entero' })
  @Min(1, { message: 'La página debe ser mayor o igual a 1' })
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Cantidad de registros por página (0 para Todas)',
    default: 10,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El límite debe ser un número entero' })
  @Min(0, { message: 'El límite debe ser mayor o igual a 0' })
  limit?: number = 10;
}
