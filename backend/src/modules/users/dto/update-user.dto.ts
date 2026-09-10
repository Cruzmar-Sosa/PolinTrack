import { ApiPropertyOptional } from '@nestjs/swagger';
import { RoleType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateUserDto {
  @ApiPropertyOptional({
    description: 'Nombre y apellidos completos del usuario',
    example: 'Juan Carlos Pérez Actualizado',
    minLength: 3,
  })
  @IsOptional()
  @IsString({ message: 'El nombre completo debe ser una cadena de texto' })
  @MinLength(3, { message: 'El nombre completo debe tener al menos 3 caracteres' })
  fullName?: string;

  @ApiPropertyOptional({
    description: 'Rol del sistema asignado (ADMIN, CONTABILIDAD, CONSULTA)',
    enum: RoleType,
    example: RoleType.CONTABILIDAD,
  })
  @IsOptional()
  @IsEnum(RoleType, {
    message: 'El rol debe ser uno de los 3 roles autorizados: ADMIN, CONTABILIDAD, CONSULTA (RN-004)',
  })
  role?: RoleType;

  @ApiPropertyOptional({
    description: 'Nueva contraseña administrativa (opcional)',
    example: 'NuevaPassword2026!Segura',
    minLength: 8,
  })
  @IsOptional()
  @IsString({ message: 'La contraseña debe ser una cadena de texto' })
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  password?: string;
}
