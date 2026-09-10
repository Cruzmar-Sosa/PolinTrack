import { ApiProperty } from '@nestjs/swagger';
import { RoleType } from '@prisma/client';

export class UserResponseDto {
  @ApiProperty({ example: '8f02fd0b-a581-486d-8b05-6d1f641688f3' })
  id: string;

  @ApiProperty({ example: 'operador@polintrack.com' })
  email: string;

  @ApiProperty({ example: 'Juan Carlos Pérez' })
  fullName: string;

  @ApiProperty({ enum: RoleType, example: RoleType.CONSULTA })
  role: RoleType;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: '2026-09-02T18:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-09-02T18:00:00.000Z' })
  updatedAt: Date;
}

export class UsersListResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: [UserResponseDto] })
  data: UserResponseDto[];

  @ApiProperty({
    example: { total: 10, page: 1, limit: 20, totalPages: 1 },
  })
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export class SingleUserResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: UserResponseDto })
  data: UserResponseDto;
}
