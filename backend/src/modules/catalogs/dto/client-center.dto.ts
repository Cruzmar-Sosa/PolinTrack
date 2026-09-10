import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateClientCenterDto {
  @ApiProperty({
    description: 'Nombre oficial de la planta cliente o centro de destino',
    example: 'Planta 7 — Chinandega Norte',
    maxLength: 255,
  })
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre del centro cliente es requerido' })
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(255, { message: 'El nombre no puede exceder 255 caracteres' })
  name: string;

  @ApiPropertyOptional({
    description: 'Ubicación geográfica, departamento o sector del centro',
    example: 'Chinandega, Km 132 Carretera Panamericana',
    maxLength: 255,
  })
  @IsOptional()
  @IsString({ message: 'La ubicación debe ser una cadena de texto' })
  @MaxLength(255, { message: 'La ubicación no puede exceder 255 caracteres' })
  location?: string;
}

export class UpdateClientCenterDto {
  @ApiPropertyOptional({
    description: 'Nombre oficial de la planta cliente o centro de destino',
    example: 'Planta 7 — Chinandega Actualizada',
    maxLength: 255,
  })
  @IsOptional()
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(255, { message: 'El nombre no puede exceder 255 caracteres' })
  name?: string;

  @ApiPropertyOptional({
    description: 'Ubicación geográfica, departamento o sector del centro',
    example: 'Chinandega, Km 134 Carretera Panamericana',
    maxLength: 255,
  })
  @IsOptional()
  @IsString({ message: 'La ubicación debe ser una cadena de texto' })
  @MaxLength(255, { message: 'La ubicación no puede exceder 255 caracteres' })
  location?: string;

  @ApiPropertyOptional({
    description: 'Estado operativo del centro',
    example: true,
  })
  @IsOptional()
  isActive?: boolean;
}
