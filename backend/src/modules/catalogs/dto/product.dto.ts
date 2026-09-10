import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateProductDto {
  @ApiProperty({
    description: 'Denominación comercial del polín o producto',
    example: 'Polín 50x50 Especial',
    maxLength: 255,
  })
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre del producto es requerido' })
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(255, { message: 'El nombre no puede exceder 255 caracteres' })
  name: string;

  @ApiProperty({
    description: 'Dimensiones normalizadas en centímetros (ej. 45x48, 50x50)',
    example: '50x50',
    maxLength: 100,
  })
  @IsString({ message: 'Las dimensiones deben ser una cadena de texto' })
  @IsNotEmpty({ message: 'Las dimensiones son requeridas' })
  @MaxLength(100, { message: 'Las dimensiones no pueden exceder 100 caracteres' })
  dimensions: string;
}

export class UpdateProductDto {
  @ApiPropertyOptional({
    description: 'Denominación comercial del polín o producto',
    example: 'Polín 50x50 Estándar',
    maxLength: 255,
  })
  @IsOptional()
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(255, { message: 'El nombre no puede exceder 255 caracteres' })
  name?: string;

  @ApiPropertyOptional({
    description: 'Dimensiones normalizadas en centímetros',
    example: '50x50',
    maxLength: 100,
  })
  @IsOptional()
  @IsString({ message: 'Las dimensiones deben ser una cadena de texto' })
  @MaxLength(100, { message: 'Las dimensiones no pueden exceder 100 caracteres' })
  dimensions?: string;

  @ApiPropertyOptional({
    description: 'Estado operativo del producto',
    example: true,
  })
  @IsOptional()
  isActive?: boolean;
}
