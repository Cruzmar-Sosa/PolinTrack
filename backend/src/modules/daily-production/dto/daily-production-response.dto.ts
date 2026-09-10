import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LinkedWoodReceiptDto {
  @ApiProperty({ example: '1ba7b810-9dad-11d1-80b4-00c04fd430c1' })
  id: string;

  @ApiProperty({ example: 'LT-010926-01' })
  lotNumber: string;

  @ApiProperty({ example: 1250.5 })
  quantity: number;

  @ApiProperty({ example: 'PIE_TABLAR' })
  unit: string;

  @ApiProperty({ example: { name: 'Maderas del Bosque S.A.' } })
  supplier: {
    name: string;
  };
}

export class ProductionDetailResponseDto {
  @ApiProperty({ example: '7ba7b810-9dad-11d1-80b4-00c04fd430c7' })
  id: string;

  @ApiProperty({ example: '6ba7b810-9dad-11d1-80b4-00c04fd430c8' })
  productId: string;

  @ApiProperty({
    example: {
      id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      name: 'Polín 45x48',
      dimensions: '45x48',
    },
  })
  product: {
    id: string;
    name: string;
    dimensions: string;
  };

  @ApiProperty({ example: 500 })
  quantityProduced: number;

  @ApiPropertyOptional({ example: 500 })
  availableStock?: number;
}

export class DailyProductionItemDto {
  @ApiProperty({ example: '7ba7b810-9dad-11d1-80b4-00c04fd430c7' })
  id: string;

  @ApiProperty({ example: 'LT-020926-W36' })
  productionLot: string;

  @ApiProperty({ example: '2026-09-02' })
  productionDate: Date;

  @ApiProperty({ example: 36 })
  isoWeek: number;

  @ApiProperty({ type: [ProductionDetailResponseDto] })
  productionDetails: ProductionDetailResponseDto[];

  @ApiProperty({ example: 500 })
  totalQuantityProduced: number;

  // Campos de compatibilidad con vistas previas
  @ApiPropertyOptional({ example: '6ba7b810-9dad-11d1-80b4-00c04fd430c8' })
  productId?: string;

  @ApiPropertyOptional({
    example: {
      id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      name: 'Polín 45x48',
      dimensions: '45x48',
    },
  })
  product?: {
    id: string;
    name: string;
    dimensions: string;
  };

  @ApiPropertyOptional({ example: 500 })
  quantityProduced?: number;

  @ApiPropertyOptional({ example: 500 })
  availableStock?: number;

  @ApiProperty({ example: '8f02fd0b-a581-486d-8b05-6d1f641688f3' })
  createdById: string;

  @ApiProperty({
    example: {
      id: '8f02fd0b-a581-486d-8b05-6d1f641688f3',
      fullName: 'Operador de Planta',
      email: 'operador@polintrack.com',
    },
  })
  createdBy: {
    id: string;
    fullName: string;
    email: string;
  };

  @ApiPropertyOptional({ type: [LinkedWoodReceiptDto] })
  linkedWoodReceipts?: LinkedWoodReceiptDto[];

  @ApiPropertyOptional({ example: 1 })
  fumigationsCount?: number;

  @ApiProperty({ example: '2026-09-02T18:00:00.000Z' })
  createdAt: Date;
}

export class DailyProductionPaginatedResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: [DailyProductionItemDto] })
  data: DailyProductionItemDto[];

  @ApiProperty({
    example: {
      total: 100,
      page: 1,
      limit: 20,
      totalPages: 5,
    },
  })
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export class SingleDailyProductionResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: DailyProductionItemDto })
  data: DailyProductionItemDto;
}

export { DailyProductionPaginatedResponseDto as DailyProductionListResponseDto };
