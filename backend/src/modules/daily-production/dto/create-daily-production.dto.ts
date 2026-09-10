import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class ProductionProductItemDto {
  @ApiProperty({
    description: 'UUID del producto terminado fabricado (1 de los 5 polines)',
    example: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  })
  @IsUUID('4', { message: 'El productId debe ser un UUID v4 válido' })
  @IsNotEmpty({ message: 'El producto terminado es obligatorio' })
  productId: string;

  @ApiProperty({
    description: 'Cantidad de piezas terminadas producidas en la jornada física',
    example: 500,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt({ message: 'La cantidad producida debe ser un número entero' })
  @Min(1, { message: 'La cantidad producida debe ser al menos 1 pieza' })
  quantityProduced: number;
}

export class CreateDailyProductionDto {
  @ApiProperty({
    description: 'Fecha física de la jornada de producción (formato YYYY-MM-DD)',
    example: '2026-09-02',
  })
  @IsISO8601(
    { strict: true },
    { message: 'La productionDate debe tener formato de fecha válido (YYYY-MM-DD)' },
  )
  @IsNotEmpty({ message: 'La fecha de producción es obligatoria' })
  productionDate: string;

  @ApiPropertyOptional({
    description: 'Lista de productos terminados fabricados en la jornada física',
    type: [ProductionProductItemDto],
  })
  @IsOptional()
  @IsArray({ message: 'products debe ser una lista de productos' })
  @ArrayMinSize(1, { message: 'Debe incluir al menos un producto en la lista' })
  @ValidateNested({ each: true })
  @Type(() => ProductionProductItemDto)
  products?: ProductionProductItemDto[];

  // Campos de retrocompatibilidad para clientes que envían producto único
  @ApiPropertyOptional({
    description: 'UUID del producto (retrocompatibilidad para cliente individual)',
  })
  @IsOptional()
  @IsUUID('4', { message: 'El productId debe ser un UUID v4 válido' })
  productId?: string;

  @ApiPropertyOptional({
    description: 'Cantidad producida (retrocompatibilidad para cliente individual)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La cantidad producida debe ser un número entero' })
  @Min(1, { message: 'La cantidad producida debe ser al menos 1 pieza' })
  quantityProduced?: number;

  @ApiPropertyOptional({
    description:
      'Lotes de madera de patio utilizados como materia prima (trazabilidad referencial M:N, sin cálculo de merma D-023)',
    example: [
      '1ba7b810-9dad-11d1-80b4-00c04fd430c1',
      '2ba7b810-9dad-11d1-80b4-00c04fd430c2',
    ],
    type: [String],
  })
  @IsOptional()
  @IsArray({ message: 'woodReceiptIds debe ser una lista de identificadores' })
  @ArrayUnique({ message: 'No se pueden repetir identificadores de lotes de madera' })
  @IsUUID('4', {
    each: true,
    message: 'Cada elemento en woodReceiptIds debe ser un UUID v4 válido',
  })
  woodReceiptIds?: string[];
}
