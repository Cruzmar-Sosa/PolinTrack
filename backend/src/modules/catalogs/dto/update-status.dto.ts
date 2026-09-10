import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateStatusDto {
  @ApiProperty({
    description: 'Estado operativo del registro (activo o inactivo)',
    example: true,
  })
  @IsBoolean({ message: 'El estado isActive debe ser un valor booleano' })
  isActive: boolean;
}
