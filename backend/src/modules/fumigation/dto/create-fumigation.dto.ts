import {
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  Validate,
  ValidateNested,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { Transform, Type, plainToInstance } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

@ValidatorConstraint({ name: 'isNotFutureDate', async: false })
export class IsNotFutureDateConstraint implements ValidatorConstraintInterface {
  validate(dateStr: string) {
    if (!dateStr) return false;
    const inputDate = new Date(dateStr + 'T00:00:00.000Z');
    const today = new Date();
    today.setUTCHours(23, 59, 59, 999);
    return inputDate <= today;
  }

  defaultMessage(args: ValidationArguments) {
    return `La fecha de fumigación (${args.value}) no puede ser una fecha futura.`;
  }
}

export class FumigationLotDetailDto {
  @ApiProperty({
    description: 'UUID de la orden de producción diaria amparada por el certificado',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsNotEmpty({ message: 'El dailyProductionId es obligatorio en cada lote' })
  @IsUUID('4', { message: 'El dailyProductionId debe ser un UUID v4 válido' })
  dailyProductionId: string;

  @ApiProperty({
    description: 'Array de UUIDs de los productos tratados pertenecientes a esta orden',
    example: ['b2c3d4e5-f6a7-8901-bcde-f12345678901'],
    type: [String],
  })
  @IsArray({ message: 'productIds debe ser un array de identificadores' })
  @ArrayMinSize(1, { message: 'Debe seleccionar al menos un producto por lote' })
  @IsUUID('4', { each: true, message: 'Cada productId debe ser un UUID v4 válido' })
  productIds: string[];
}

export class CreateFumigationDto {
  @ApiPropertyOptional({
    description:
      'Array de lotes y productos tratados bajo esta certificación fitosanitaria (RN-FUM-MULTI)',
    type: [FumigationLotDetailDto],
  })
  @Transform(({ value }) => {
    let items = value;
    if (typeof value === 'string') {
      try {
        items = JSON.parse(value);
      } catch {
        return value;
      }
    }
    if (Array.isArray(items)) {
      return plainToInstance(FumigationLotDetailDto, items);
    }
    return items;
  })
  @IsOptional()
  @IsArray({ message: 'lots debe ser un array' })
  @ValidateNested({ each: true })
  @Type(() => FumigationLotDetailDto)
  lots?: FumigationLotDetailDto[];

  @ApiPropertyOptional({
    description:
      'UUID del lote de producción diaria (compatibilidad con API legado o registros monoproducto)',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsOptional()
  @IsUUID('4', { message: 'El dailyProductionId debe ser un UUID v4 válido' })
  dailyProductionId?: string;

  @ApiProperty({
    description:
      'Fecha en que se aplicó el tratamiento fitosanitario (YYYY-MM-DD). No puede ser futura.',
    example: '2026-09-02',
  })
  @IsNotEmpty({ message: 'La fecha de fumigación es obligatoria' })
  @IsISO8601(
    { strict: true },
    { message: 'La fecha de fumigación debe tener formato válido YYYY-MM-DD' },
  )
  @Validate(IsNotFutureDateConstraint)
  fumigationDate: string;

  @ApiProperty({
    description: 'Hora de aplicación del tratamiento (HH:mm o HH:mm:ss)',
    example: '14:30:00',
  })
  @IsNotEmpty({ message: 'La hora de fumigación es obligatoria' })
  @IsString({ message: 'La hora de fumigación debe ser una cadena de texto' })
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/, {
    message: 'La hora de fumigación debe tener formato válido HH:mm o HH:mm:ss (24h)',
  })
  fumigationTime: string;

  @ApiProperty({
    description: 'Número oficial del certificado emitido por OIRSA',
    example: 'OIRSA-CERT-2026-0914',
    maxLength: 100,
  })
  @IsNotEmpty({ message: 'El número de certificado OIRSA es obligatorio' })
  @IsString({ message: 'El número de certificado debe ser una cadena de texto' })
  @MaxLength(100, { message: 'El número de certificado no puede exceder 100 caracteres' })
  certificateNumber: string;

  @ApiPropertyOptional({
    description: 'Observaciones técnicas o condiciones operativas del tratamiento',
    example: 'Tratamiento fitosanitario estándar de exportación OIRSA sin incidencias.',
  })
  @IsOptional()
  @IsString({ message: 'Las observaciones deben ser una cadena de texto' })
  observations?: string;
}
