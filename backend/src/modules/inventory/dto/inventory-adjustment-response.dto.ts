import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AdjustmentType, ReasonType } from '@prisma/client';

export class AdjustmentProductResponseDto {
  @ApiProperty({ example: 'p1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id: string;

  @ApiProperty({ example: 'Polín Industrial 3x3x8' })
  name: string;

  @ApiProperty({ example: '3" x 3" x 8\'' })
  dimensions: string;
}

export class AdjustmentUserResponseDto {
  @ApiProperty({ example: 'u1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id: string;

  @ApiProperty({ example: 'Carlos Admin' })
  fullName: string;

  @ApiProperty({ example: 'admin@polintrack.com' })
  email: string;
}

export class InventoryAdjustmentResponseDto {
  @ApiProperty({ example: 'adj-uuid-1' })
  id: string;

  @ApiProperty({ example: 'prod-uuid-1' })
  productId: string;

  @ApiProperty({ enum: AdjustmentType, example: AdjustmentType.INCREMENT })
  adjustmentType: AdjustmentType;

  @ApiProperty({ example: 50 })
  quantity: number;

  @ApiProperty({ example: 100 })
  previousStock: number;

  @ApiProperty({ example: 150 })
  newStock: number;

  @ApiProperty({ enum: ReasonType, example: ReasonType.ERROR_INGRESO })
  reasonType: ReasonType;

  @ApiPropertyOptional({ example: 'Conteo físico en patio detectó 50 piezas adicionales' })
  reasonNotes?: string;

  @ApiProperty({ example: 'user-uuid-1' })
  executedById: string;

  @ApiProperty({ example: '2026-09-03T15:00:00.000Z' })
  executedAt: Date;

  @ApiPropertyOptional({ type: () => AdjustmentProductResponseDto })
  product?: AdjustmentProductResponseDto;

  @ApiPropertyOptional({ type: () => AdjustmentUserResponseDto })
  executedBy?: AdjustmentUserResponseDto;
}

export class AdjustmentPaginationMetaDto {
  @ApiProperty({ example: 5 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 1 })
  totalPages: number;
}

export class PaginatedInventoryAdjustmentResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: [InventoryAdjustmentResponseDto] })
  data: InventoryAdjustmentResponseDto[];

  @ApiProperty({ type: AdjustmentPaginationMetaDto })
  meta: AdjustmentPaginationMetaDto;
}
