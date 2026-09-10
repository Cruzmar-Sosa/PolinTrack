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
import { Type } from 'class-transformer';
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
    return `La fecha de despacho (${args.value}) no puede ser una fecha futura.`;
  }
}

export class CreateDispatchDetailDto {
  @ApiProperty({
    description: 'UUID del producto terminado (polín)',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsNotEmpty({ message: 'El productId es obligatorio en cada línea de detalle' })
  @IsUUID('4', { message: 'El productId debe ser un UUID v4 válido' })
  productId: string;

  @ApiProperty({
    description: 'UUID del lote de producción diaria del cual se extraen las piezas',
    example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  })
  @IsNotEmpty({ message: 'El dailyProductionId es obligatorio en cada línea de detalle' })
  @IsUUID('4', { message: 'El dailyProductionId debe ser un UUID v4 válido' })
  dailyProductionId: string;

  @ApiProperty({
    description: 'Cantidad de piezas a despachar (entero positivo mayor a cero)',
    example: 50,
    minimum: 1,
  })
  @IsNotEmpty({ message: 'La cantidad a despachar es obligatoria' })
  @Type(() => Number)
  @IsInt({ message: 'La cantidad a despachar debe ser un número entero' })
  @Min(1, { message: 'La cantidad a despachar debe ser al menos 1 pieza' })
  quantityDispatched: number;

  @ApiPropertyOptional({
    description: 'Dimensiones físicas del polín (ej. 3" x 3" x 8\'). Si se omite, se toma del catálogo.',
    example: '3" x 3" x 8\'',
  })
  @IsOptional()
  @IsString({ message: 'Las dimensiones deben ser una cadena de texto' })
  @MaxLength(100, { message: 'Las dimensiones no pueden exceder 100 caracteres' })
  dimensions?: string;
}

export class CreateDispatchHeaderDto {
  @ApiProperty({
    description: 'Número oficial de remisión o factura comercial de salida (único e inmutable)',
    example: 'F-90210',
    maxLength: 100,
  })
  @IsNotEmpty({ message: 'El número de factura (invoiceNumber) es obligatorio' })
  @IsString({ message: 'El invoiceNumber debe ser una cadena de texto' })
  @MaxLength(100, { message: 'El invoiceNumber no puede exceder 100 caracteres' })
  invoiceNumber: string;

  @ApiProperty({
    description: 'UUID del centro cliente / planta de destino (1 de las 7 plantas)',
    example: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
  })
  @IsNotEmpty({ message: 'El clientCenterId es obligatorio' })
  @IsUUID('4', { message: 'El clientCenterId debe ser un UUID v4 válido' })
  clientCenterId: string;

  @ApiProperty({
    description: 'Fecha de expedición/despacho (YYYY-MM-DD). No puede ser fecha futura.',
    example: '2026-09-02',
  })
  @IsNotEmpty({ message: 'La fecha de despacho (dispatchDate) es obligatoria' })
  @IsISO8601(
    { strict: true },
    { message: 'dispatchDate debe tener formato válido YYYY-MM-DD' },
  )
  @Validate(IsNotFutureDateConstraint)
  dispatchDate: string;

  @ApiProperty({
    description: 'Hora de expedición (HH:mm o HH:mm:ss)',
    example: '14:30:00',
  })
  @IsNotEmpty({ message: 'La hora de despacho (dispatchTime) es obligatoria' })
  @IsString({ message: 'dispatchTime debe ser una cadena de texto' })
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/, {
    message: 'dispatchTime debe tener formato válido HH:mm o HH:mm:ss (24h)',
  })
  dispatchTime: string;

  @ApiPropertyOptional({
    description: 'Placa o información del vehículo de transporte',
    example: 'M-12345',
    maxLength: 100,
  })
  @IsOptional()
  @IsString({ message: 'vehicleInfo debe ser una cadena de texto' })
  @MaxLength(100, { message: 'vehicleInfo no puede exceder 100 caracteres' })
  vehicleInfo?: string;

  @ApiPropertyOptional({
    description: 'Nombre del chofer transportista',
    example: 'Carlos Mendoza',
    maxLength: 100,
  })
  @IsOptional()
  @IsString({ message: 'driverName debe ser una cadena de texto' })
  @MaxLength(100, { message: 'driverName no puede exceder 100 caracteres' })
  driverName?: string;

  @ApiPropertyOptional({
    description: 'Observaciones generales del despacho',
    example: 'Entrega prioritaria en Planta 2',
  })
  @IsOptional()
  @IsString({ message: 'observations debe ser una cadena de texto' })
  observations?: string;

  @ApiProperty({
    description: 'Líneas de detalle del despacho (1..N productos/lotes)',
    type: [CreateDispatchDetailDto],
  })
  @IsArray({ message: 'details debe ser una lista de líneas de despacho' })
  @ArrayMinSize(1, { message: 'El despacho debe contener al menos 1 línea de detalle' })
  @ValidateNested({ each: true })
  @Type(() => CreateDispatchDetailDto)
  details: CreateDispatchDetailDto[];
}
