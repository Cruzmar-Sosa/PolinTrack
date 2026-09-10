import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    description: 'Refresh token emitido por el proveedor de autenticación',
    example: 'd8c7e6b5a4...',
  })
  @IsString({ message: 'El refreshToken debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El refreshToken es obligatorio' })
  refreshToken: string;
}
