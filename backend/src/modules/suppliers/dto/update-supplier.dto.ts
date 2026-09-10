import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateSupplierDto {
  @ApiPropertyOptional({
    description: 'Razón social o nombre comercial único del proveedor de madera',
    example: 'Maderas del Norte S.A. (Actualizado)',
    maxLength: 255,
  })
  @IsOptional()
  @IsString({ message: 'El nombre del proveedor debe ser una cadena de texto' })
  @MinLength(3, { message: 'El nombre del proveedor debe tener al menos 3 caracteres' })
  @MaxLength(255, { message: 'El nombre del proveedor no puede exceder 255 caracteres' })
  name?: string;

  @ApiPropertyOptional({
    description: 'Identificación tributaria o fiscal (RUC, Cédula Jurídica, etc.)',
    example: 'J-0310000000002',
    maxLength: 100,
  })
  @IsOptional()
  @IsString({ message: 'La identificación fiscal debe ser una cadena de texto' })
  @MinLength(3, { message: 'La identificación fiscal debe tener al menos 3 caracteres' })
  @MaxLength(100, { message: 'La identificación fiscal no puede exceder 100 caracteres' })
  legalId?: string;

  @ApiPropertyOptional({
    description: 'Teléfono de contacto del proveedor',
    example: '+505 8888-0000',
    maxLength: 50,
  })
  @IsOptional()
  @IsString({ message: 'El teléfono debe ser una cadena de texto' })
  @MaxLength(50, { message: 'El teléfono no puede exceder 50 caracteres' })
  phone?: string;

  @ApiPropertyOptional({
    description: 'Notas u observaciones operativas y comerciales',
    example: 'Nueva certificación fitosanitaria verificada en 2026.',
  })
  @IsOptional()
  @IsString({ message: 'Las notas deben ser una cadena de texto' })
  notes?: string;

  @ApiPropertyOptional({
    description: 'Enlace a documentación o permisos forestales en storage',
    example: 'https://storage.polintrack.com/suppliers/permiso-renovado-2026.pdf',
    maxLength: 500,
  })
  @IsOptional()
  @IsString({ message: 'El enlace del documento debe ser una cadena de texto' })
  @MaxLength(500, { message: 'El enlace del documento no puede exceder 500 caracteres' })
  documentUrl?: string;

  @ApiPropertyOptional({
    description: 'Estado activo o inactivo del proveedor (borrado lógico)',
    example: true,
  })
  @IsOptional()
  @IsBoolean({ message: 'El estado isActive debe ser un valor booleano' })
  isActive?: boolean;
}
