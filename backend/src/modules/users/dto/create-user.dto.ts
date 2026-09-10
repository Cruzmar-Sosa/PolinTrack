import { ApiProperty } from '@nestjs/swagger';
import { RoleType } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({
    description: 'Correo electrónico institucional único',
    example: 'operador@polintrack.com',
  })
  @IsEmail({}, { message: 'El correo electrónico no tiene un formato válido' })
  @IsNotEmpty({ message: 'El correo electrónico es obligatorio' })
  email: string;

  @ApiProperty({
    description: 'Contraseña inicial de acceso (mínimo 8 caracteres)',
    example: 'PolinTrack2026!Temporal',
    minLength: 8,
  })
  @IsString({ message: 'La contraseña debe ser una cadena de texto' })
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @IsNotEmpty({ message: 'La contraseña es obligatoria' })
  password: string;

  @ApiProperty({
    description: 'Nombre y apellidos completos del usuario operativo',
    example: 'Juan Carlos Pérez',
    minLength: 3,
  })
  @IsString({ message: 'El nombre completo debe ser una cadena de texto' })
  @MinLength(3, { message: 'El nombre completo debe tener al menos 3 caracteres' })
  @IsNotEmpty({ message: 'El nombre completo es obligatorio' })
  fullName: string;

  @ApiProperty({
    description: 'Rol del sistema asignado (ADMIN, CONTABILIDAD, CONSULTA)',
    enum: RoleType,
    example: RoleType.CONSULTA,
  })
  @IsEnum(RoleType, {
    message: 'El rol debe ser uno de los 3 roles autorizados: ADMIN, CONTABILIDAD, CONSULTA (RN-004)',
  })
  @IsNotEmpty({ message: 'El rol es obligatorio' })
  role: RoleType;
}
