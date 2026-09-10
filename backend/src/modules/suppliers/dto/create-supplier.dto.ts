import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateSupplierDto {
  @ApiProperty({
    description: 'Razón social o nombre comercial único del proveedor de madera',
    example: 'Maderas del Norte S.A.',
    maxLength: 255,
  })
  @IsString({ message: 'El nombre del proveedor debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre o razón social del proveedor es obligatorio' })
  @MinLength(3, { message: 'El nombre del proveedor debe tener al menos 3 caracteres' })
  @MaxLength(255, { message: 'El nombre del proveedor no puede exceder 255 caracteres' })
  name: string;

  @ApiProperty({
    description: 'Identificación tributaria o fiscal única (RUC, Cédula Jurídica, etc.)',
    example: 'J-0310000000001',
    maxLength: 100,
  })
  @IsString({ message: 'La identificación fiscal debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La identificación fiscal (RUC / Cédula) es obligatoria' })
  @MinLength(3, { message: 'La identificación fiscal debe tener al menos 3 caracteres' })
  @MaxLength(100, { message: 'La identificación fiscal no puede exceder 100 caracteres' })
  legalId: string;

  @ApiPropertyOptional({
    description: 'Teléfono de contacto del proveedor',
    example: '+505 8888-9999',
    maxLength: 50,
  })
  @IsOptional()
  @IsString({ message: 'El teléfono debe ser una cadena de texto' })
  @MaxLength(50, { message: 'El teléfono no puede exceder 50 caracteres' })
  phone?: string;

  @ApiPropertyOptional({
    description: 'Notas u observaciones operativas y comerciales',
    example: 'Proveedor certificado de plantaciones de teca en zona norte.',
  })
  @IsOptional()
  @IsString({ message: 'Las notas deben ser una cadena de texto' })
  notes?: string;

  @ApiPropertyOptional({
    description: 'Enlace a documentación o permisos forestales en storage',
    example: 'https://storage.polintrack.com/suppliers/permiso-forestal-2026.pdf',
    maxLength: 500,
  })
  @IsOptional()
  @IsString({ message: 'El enlace del documento debe ser una cadena de texto' })
  @MaxLength(500, { message: 'El enlace del documento no puede exceder 500 caracteres' })
  documentUrl?: string;
}
