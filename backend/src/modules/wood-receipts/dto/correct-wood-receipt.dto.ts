import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CorrectWoodReceiptDto {
  @ApiProperty({
    description: 'Justificación operativa obligatoria de la corrección (10 a 500 caracteres)',
    example: 'Ajuste por corrección de cubicación final validada en báscula con proveedor',
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
    example: 'corr-wr-20261013-001',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotencyKey?: string;

  @ApiPropertyOptional({
    description: 'Cantidad física corregida (pt para TIMBRE, admite hasta 2 decimales)',
    example: 1250.75,
    minimum: 0.01,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'La cantidad de madera en pie/pt debe ser un número válido con hasta 2 decimales' },
  )
  @Min(0.01, { message: 'La cantidad debe ser mayor que cero (> 0)' })
  quantity?: number;

  @ApiPropertyOptional({
    description: 'Cantidad de Yugos en piezas (para madera PROCESADA, entero >= 0)',
    example: 150,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La cantidad de yugos debe ser un número entero' })
  @Min(0, { message: 'La cantidad de yugos no puede ser negativa' })
  yugosQuantity?: number;

  @ApiPropertyOptional({
    description: 'Cantidad de Reglas/Tablas en piezas (para madera PROCESADA, entero >= 0)',
    example: 300,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La cantidad de reglas debe ser un número entero' })
  @Min(0, { message: 'La cantidad de reglas no puede ser negativa' })
  reglasQuantity?: number;
}
