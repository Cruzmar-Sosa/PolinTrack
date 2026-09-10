import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateWoodReceiptDto {
  @ApiProperty({
    description: 'UUID del proveedor de madera registrado en el catálogo',
    example: '594aeb10-8867-4469-a5db-93152720926f',
  })
  @IsUUID('4', { message: 'El supplierId debe ser un UUID v4 válido' })
  @IsNotEmpty({ message: 'El proveedor es obligatorio' })
  supplierId: string;

  @ApiProperty({
    description: 'UUID de la especie de madera (TECA, PINO, OTRAS)',
    example: '3ca7b810-9dad-11d1-80b4-00c04fd430c1',
  })
  @IsUUID('4', { message: 'El speciesId debe ser un UUID v4 válido' })
  @IsNotEmpty({ message: 'La especie de madera es obligatoria' })
  speciesId: string;

  @ApiProperty({
    description: 'UUID del tipo de madera (TIMBRE o PROCESADA)',
    example: '4ca7b810-9dad-11d1-80b4-00c04fd430c2',
  })
  @IsUUID('4', { message: 'El woodTypeId debe ser un UUID v4 válido' })
  @IsNotEmpty({ message: 'El tipo de madera es obligatorio' })
  woodTypeId: string;

  @ApiProperty({
    description: 'Cantidad física recibida (pt para TIMBRE, piezas para PROCESADA)',
    example: 1250.5,
    minimum: 0.01,
  })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'La cantidad debe ser un número con hasta 2 decimales' },
  )
  @Min(0.01, { message: 'La cantidad debe ser estrictamente mayor que cero (> 0)' })
  quantity: number;

  @ApiPropertyOptional({
    description: 'Cantidad de Yugos en piezas (solo aplicable para madera PROCESADA, RN-016-B)',
    example: 120,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La cantidad de Yugos debe ser un número entero' })
  @Min(0, { message: 'La cantidad de Yugos no puede ser negativa' })
  yugosQuantity?: number;

  @ApiPropertyOptional({
    description: 'Cantidad de Reglas en piezas (solo aplicable para madera PROCESADA, RN-016-B)',
    example: 80,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La cantidad de Reglas debe ser un número entero' })
  @Min(0, { message: 'La cantidad de Reglas no puede ser negativa' })
  reglasQuantity?: number;

  @ApiProperty({
    description: 'Fecha física de recepción en patio (formato YYYY-MM-DD)',
    example: '2026-09-02',
  })
  @IsISO8601(
    { strict: true },
    { message: 'La receiptDate debe tener formato de fecha válido (YYYY-MM-DD)' },
  )
  @IsNotEmpty({ message: 'La fecha de recepción es obligatoria' })
  receiptDate: string;

  @ApiProperty({
    description: 'Hora de recepción (formato HH:mm o HH:mm:ss)',
    example: '08:30:00',
  })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/, {
    message: 'La receiptTime debe tener formato de hora válido (HH:mm o HH:mm:ss)',
  })
  @IsNotEmpty({ message: 'La hora de recepción es obligatoria' })
  receiptTime: string;

  @ApiPropertyOptional({
    description: 'Número de guía de transporte / remisión forestal (referencia física)',
    example: 'GUIA-2026-0914',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'El número de guía no puede exceder 100 caracteres' })
  guideNumber?: string;

  @ApiPropertyOptional({
    description: 'Descripción o condición física de la madera recibida',
    example: 'Madera verde en buen estado',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'El estado de la madera no puede exceder 100 caracteres' })
  woodStatus?: string;
}
