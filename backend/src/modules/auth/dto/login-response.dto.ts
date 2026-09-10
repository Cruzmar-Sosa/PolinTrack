import { ApiProperty } from '@nestjs/swagger';
import { RoleType } from '@prisma/client';

export class UserProfileDto {
  @ApiProperty({ example: '8f02fd0b-a581-486d-8b05-6d1f641688f3' })
  id: string;

  @ApiProperty({ example: 'admin@polintrack.com' })
  email: string;

  @ApiProperty({ example: 'Carlos Mendoza (Administrador General)' })
  fullName: string;

  @ApiProperty({ enum: RoleType, example: RoleType.ADMIN })
  role: RoleType;
}

export class LoginDataDto {
  @ApiProperty({ type: UserProfileDto })
  user: UserProfileDto;

  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  accessToken: string;

  @ApiProperty({ example: 'd8c7e6b5a4...' })
  refreshToken: string;

  @ApiProperty({ example: 3600 })
  expiresInSeconds: number;
}

export class LoginResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: LoginDataDto })
  data: LoginDataDto;
}
