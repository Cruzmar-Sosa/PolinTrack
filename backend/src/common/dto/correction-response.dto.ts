import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CorrectionItemResponseDto {
  @ApiProperty({ example: 'item-uuid-1' })
  id: string;

  @ApiPropertyOptional({ example: 'line-uuid-1' })
  lineId?: string | null;

  @ApiProperty({ example: 'quantity' })
  fieldName: string;

  @ApiPropertyOptional({ example: 'prod-uuid-1' })
  productId?: string | null;

  @ApiPropertyOptional({ example: 'Polín 45x48' })
  productName?: string | null;

  @ApiPropertyOptional({ example: '45x48' })
  dimensions?: string | null;

  @ApiProperty({ example: 100 })
  previousQuantity: number;

  @ApiProperty({ example: 120 })
  newQuantity: number;

  @ApiProperty({ example: 20 })
  deltaQuantity: number;

  @ApiPropertyOptional({ example: 'mov-uuid-1' })
  inventoryMovementId?: string | null;

  @ApiProperty({ example: '2026-10-13T20:30:00.000Z' })
  createdAt: Date;
}

export class CorrectionHistoryResponseDto {
  @ApiProperty({ example: 'corr-uuid-1' })
  id: string;

  @ApiProperty({ example: 'WOOD_RECEIPT' })
  module: string;

  @ApiProperty({ example: 'rec-uuid-1' })
  recordId: string;

  @ApiProperty({ example: 'LT-131026-01' })
  recordCode: string;

  @ApiProperty({ example: 'Ajuste de cubicación final con proveedor' })
  reason: string;

  @ApiProperty({
    example: {
      id: 'user-uuid-1',
      fullName: 'Carlos Mendoza',
      email: 'carlos@polintrack.com',
      role: 'ADMIN',
    },
  })
  correctedBy: {
    id: string;
    fullName: string;
    email: string;
    role: string;
  };

  @ApiPropertyOptional({ example: 'corr-wr-20261013-001' })
  idempotencyKey?: string | null;

  @ApiPropertyOptional()
  metadata?: any;

  @ApiProperty({ example: '2026-10-13T20:30:00.000Z' })
  createdAt: Date;

  @ApiProperty({ type: [CorrectionItemResponseDto] })
  items: CorrectionItemResponseDto[];
}
