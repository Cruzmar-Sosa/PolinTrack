import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CorrectDispatchItemDto {
  @ApiProperty({
    description: 'UUID de la línea de detalle de despacho existente (dispatch_details)',
    example: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  })
  @IsUUID('4', { message: 'El lineId debe ser un UUID v4 válido' })
  @IsNotEmpty({ message: 'El lineId de la línea a corregir es obligatorio' })
  lineId: string;

  @ApiProperty({
    description: 'Nueva cantidad despachada corregida en piezas enteras (> 0)',
    example: 850,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt({ message: 'La cantidad debe ser un número entero' })
  @Min(1, { message: 'La cantidad corregida debe ser un entero positivo mayor a cero' })
  quantity: number;

  @ApiPropertyOptional({
    description: 'UUID del producto en catálogo si se rectifica la medida de polín',
    example: '6ba7b810-9dad-11d1-80b4-00c04fd430c9',
  })
  @IsOptional()
  @IsUUID('4', { message: 'El productId debe ser un UUID v4 válido' })
  productId?: string;
}

export class CorrectDispatchDto {
  @ApiProperty({
    description: 'Justificación operativa obligatoria de la corrección (10 a 500 caracteres)',
    example: 'Ajuste de remisión por discrepancia en conteo durante la carga del camión',
    minLength: 10,
    maxLength: 500,
  })
  @IsString({ message: 'La justificación debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La justificación es obligatoria' })
  @MinLength(10, { message: 'La justificación debe tener al menos 10 caracteres' })
  @MaxLength(500, { message: 'La justificación no puede exceder los 500 caracteres' })
  reason: string;

  @ApiPropertyOptional({
    description: 'Clave de idempotencia única para protección contra doble envío',
    example: 'corr-dsp-20261013-001',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotencyKey?: string;

  @ApiProperty({
    description: 'Lista de líneas de despacho a corregir',
    type: [CorrectDispatchItemDto],
  })
  @IsArray({ message: 'Los items deben enviarse como un arreglo' })
  @ArrayMinSize(1, { message: 'Debe incluir al menos una línea para corregir' })
  @ValidateNested({ each: true })
  @Type(() => CorrectDispatchItemDto)
  items: CorrectDispatchItemDto[];
}
