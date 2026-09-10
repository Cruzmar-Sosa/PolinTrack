import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { UnitOfMeasure, WoodSpeciesEnum } from '@prisma/client';

export class CreateWoodSpeciesDto {
  @ApiProperty({
    description: 'Nombre o clave de la especie botánica',
    enum: WoodSpeciesEnum,
    example: WoodSpeciesEnum.TECA,
  })
  @IsEnum(WoodSpeciesEnum, { message: 'Especie botánica inválida (debe ser TECA, PINO u OTRAS)' })
  name: WoodSpeciesEnum;

  @ApiPropertyOptional({
    description: 'Estado activo o inactivo de la especie',
    example: true,
  })
  @IsOptional()
  @IsBoolean({ message: 'isActive debe ser booleano' })
  isActive?: boolean;
}

export class UpdateWoodSpeciesDto {
  @ApiPropertyOptional({
    description: 'Nombre o clave de la especie botánica',
    enum: WoodSpeciesEnum,
    example: WoodSpeciesEnum.TECA,
  })
  @IsOptional()
  @IsEnum(WoodSpeciesEnum, { message: 'Especie botánica inválida (debe ser TECA, PINO u OTRAS)' })
  name?: WoodSpeciesEnum;

  @ApiPropertyOptional({
    description: 'Estado activo o inactivo de la especie de madera',
    example: true,
  })
  @IsOptional()
  @IsBoolean({ message: 'isActive debe ser booleano' })
  isActive?: boolean;
}

export class UpdateWoodTypeDto {
  @ApiPropertyOptional({
    description: 'Descripción operativa o física del tipo de madera',
    example: 'Madera aserrada con corteza y dimensiones brutas',
    maxLength: 255,
  })
  @IsOptional()
  @IsString({ message: 'La descripción debe ser una cadena de texto' })
  @MaxLength(255, { message: 'La descripción no puede exceder 255 caracteres' })
  description?: string;

  @ApiPropertyOptional({
    description: 'Unidad de medida normativa asociada',
    enum: UnitOfMeasure,
    example: UnitOfMeasure.PIE_TABLAR,
  })
  @IsOptional()
  @IsEnum(UnitOfMeasure, { message: 'Unidad de medida inválida' })
  defaultUnit?: UnitOfMeasure;

  @ApiPropertyOptional({
    description: 'Estado activo o inactivo del tipo de madera',
    example: true,
  })
  @IsOptional()
  @IsBoolean({ message: 'isActive debe ser booleano' })
  isActive?: boolean;
}
