import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty } from 'class-validator';

export class UpdateUserStatusDto {
  @ApiProperty({
    description: 'Estado activo o inactivo del usuario (borrado lógico)',
    example: false,
  })
  @IsBoolean({ message: 'El estado isActive debe ser un valor booleano (true o false)' })
  @IsNotEmpty({ message: 'El campo isActive es obligatorio' })
  isActive: boolean;
}
