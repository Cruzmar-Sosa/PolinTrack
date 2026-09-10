import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MovementType } from '@prisma/client';

export class KardexMovementItemDto {
  @ApiProperty({ example: '7ca7b810-9dad-11d1-80b4-00c04fd430c9' })
  id: string;

  @ApiProperty({ example: '6ba7b810-9dad-11d1-80b4-00c04fd430c8' })
  productId: string;

  @ApiProperty({
    example: {
      name: 'Polín 45x48',
      dimensions: '45x48',
    },
  })
  product: {
    name: string;
    dimensions: string;
  };

  @ApiProperty({ enum: MovementType, example: MovementType.PRODUCTION })
  movementType: MovementType;

  @ApiProperty({
    description: 'Variación física en el ledger con signo explícito (+ o -)',
    example: 500,
  })
  deltaQuantity: number;

  @ApiProperty({
    description: 'Nombre de la tabla operativa originaria del evento',
    example: 'daily_productions',
  })
  referenceTable: string;

  @ApiProperty({
    description: 'Identificador del registro en la tabla de origen',
    example: '8ba7b810-9dad-11d1-80b4-00c04fd430c0',
  })
  referenceId: string;

  @ApiProperty({ example: '2026-09-02T14:30:00.000Z' })
  timestamp: Date;

  @ApiProperty({
    example: {
      id: '8f02fd0b-a581-486d-8b05-6d1f641688f3',
      fullName: 'Administrador General',
      email: 'admin@polintrack.com',
    },
  })
  performedBy: {
    id: string;
    fullName: string;
    email: string;
  };
}

export class KardexResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: [KardexMovementItemDto] })
  data: KardexMovementItemDto[];

  @ApiProperty({
    example: {
      total: 150,
      page: 1,
      limit: 50,
      totalPages: 3,
    },
  })
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
