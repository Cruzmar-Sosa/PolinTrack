import {
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  Validate,
  ValidateNested,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

@ValidatorConstraint({ name: 'isNotFutureDate', async: false })
export class IsNotFutureDateConstraint implements ValidatorConstraintInterface {
  validate(dateStr: string) {
    if (!dateStr) return false;
    const cleanDateStr = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr.trim();
    const inputDate = new Date(cleanDateStr + 'T00:00:00.000Z');
    if (isNaN(inputDate.getTime())) return false;
    const today = new Date();
    today.setUTCHours(23, 59, 59, 999);
    return inputDate <= today;
  }

  defaultMessage(args: ValidationArguments) {
    return `La fecha de devolución (${args.value}) no puede ser una fecha futura.`;
  }
}

export class CreateReturnDetailDto {
  @ApiProperty({
    description: 'UUID de la línea específica de despacho (DispatchDetail) que se devuelve',
    example: 'd1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsNotEmpty({ message: 'El dispatchDetailId es obligatorio en cada línea de devolución' })
  @IsUUID('4', { message: 'El dispatchDetailId debe ser un UUID v4 válido' })
  dispatchDetailId: string;

  @ApiProperty({
    description: 'Cantidad de piezas a devolver a planta (entero positivo mayor a cero)',
    example: 25,
    minimum: 1,
  })
  @IsNotEmpty({ message: 'La cantidad devuelta es obligatoria' })
  @Type(() => Number)
  @IsInt({ message: 'La cantidad devuelta debe ser un número entero' })
  @Min(1, { message: 'La cantidad devuelta debe ser al menos 1 pieza' })
  quantityReturned: number;
}

export class CreateReturnHeaderDto {
  @ApiProperty({
    description: 'UUID del despacho original asociado (DispatchHeader)',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsNotEmpty({ message: 'El dispatchHeaderId es obligatorio' })
  @IsUUID('4', { message: 'El dispatchHeaderId debe ser un UUID v4 válido' })
  dispatchHeaderId: string;

  @ApiProperty({
    description: 'Fecha en que se recibe físicamente la devolución (YYYY-MM-DD). No puede ser fecha futura ni anterior al despacho.',
    example: '2026-09-03',
  })
  @IsNotEmpty({ message: 'La fecha de devolución (returnDate) es obligatoria' })
  @IsISO8601(
    { strict: true },
    { message: 'returnDate debe tener formato válido YYYY-MM-DD' },
  )
  @Validate(IsNotFutureDateConstraint)
  returnDate: string;

  @ApiProperty({
    description: 'Motivo técnico o comercial de la devolución',
    example: 'Rechazo de calidad en Planta 2 por exceso de humedad',
    maxLength: 255,
  })
  @IsNotEmpty({ message: 'El motivo de la devolución (reason) es obligatorio' })
  @IsString({ message: 'El motivo debe ser una cadena de texto' })
  @MaxLength(255, { message: 'El motivo no puede exceder 255 caracteres' })
  reason: string;

  @ApiPropertyOptional({
    description: 'Observaciones o notas adicionales del retorno',
    example: 'Piezas inspeccionadas y reingresadas a patio secundario',
  })
  @IsOptional()
  @IsString({ message: 'observations debe ser una cadena de texto' })
  observations?: string;

  @ApiProperty({
    description: 'Líneas de piezas devueltas (1..N ítems)',
    type: [CreateReturnDetailDto],
  })
  @IsArray({ message: 'details debe ser una lista de líneas de devolución' })
  @ArrayMinSize(1, { message: 'La devolución debe contener al menos 1 línea de detalle' })
  @ValidateNested({ each: true })
  @Type(() => CreateReturnDetailDto)
  details: CreateReturnDetailDto[];
}
