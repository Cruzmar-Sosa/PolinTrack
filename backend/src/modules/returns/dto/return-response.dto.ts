import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReturnTypeEnum } from '@prisma/client';

export class ReturnProductResponseDto {
  @ApiProperty({ example: 'p1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id: string;

  @ApiProperty({ example: 'Polín Industrial 3x3x8' })
  name: string;

  @ApiProperty({ example: '3" x 3" x 8\'' })
  dimensions: string;
}

export class ReturnDispatchDetailResponseDto {
  @ApiProperty({ example: 'd1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id: string;

  @ApiProperty({ example: 100 })
  quantityDispatched: number;

  @ApiProperty({ example: 25 })
  quantityReturnedAccumulated: number;

  @ApiProperty({ example: '3" x 3" x 8\'' })
  dimensions: string;

  @ApiPropertyOptional({ type: () => ReturnProductResponseDto })
  product?: ReturnProductResponseDto;

  @ApiPropertyOptional({ example: { id: 'uuid-1', productionLot: 'LT-020926-W36' } })
  dailyProduction?: {
    id: string;
    productionLot: string;
  };
}

export class ReturnUserResponseDto {
  @ApiProperty({ example: 'u1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id: string;

  @ApiProperty({ example: 'Ana Contabilidad' })
  fullName: string;

  @ApiProperty({ example: 'ana@polintrack.com' })
  email: string;
}

export class ReturnClientCenterDto {
  @ApiProperty({ example: 'c1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id: string;

  @ApiPropertyOptional({ example: 'PLT-01' })
  code?: string;

  @ApiProperty({ example: 'Planta 1' })
  name: string;

  @ApiPropertyOptional({ example: 'Km 14 Carretera a Masaya' })
  location?: string | null;
}

export class ReturnDispatchHeaderResponseDto {
  @ApiProperty({ example: 'disp-uuid-1' })
  id: string;

  @ApiProperty({ example: 'F-90210' })
  invoiceNumber: string;

  @ApiProperty({ example: '2026-09-02T00:00:00.000Z' })
  dispatchDate: Date;

  @ApiPropertyOptional({ type: () => ReturnClientCenterDto })
  clientCenter?: ReturnClientCenterDto;

  @ApiPropertyOptional({ example: 'Planta 2 - Matagalpa' })
  clientCenterName?: string;
}

export class ReturnDetailResponseDto {
  @ApiProperty({ example: 'ret-det-uuid-1' })
  id: string;

  @ApiProperty({ example: 'ret-header-uuid-1' })
  returnHeaderId: string;

  @ApiProperty({ example: 'disp-det-uuid-1' })
  dispatchDetailId: string;

  @ApiProperty({ example: 'prod-uuid-1' })
  productId: string;

  @ApiProperty({ example: 25 })
  quantityReturned: number;

  @ApiPropertyOptional({ type: () => ReturnProductResponseDto })
  product?: ReturnProductResponseDto;

  @ApiPropertyOptional({ type: () => ReturnDispatchDetailResponseDto })
  dispatchDetail?: ReturnDispatchDetailResponseDto;
}

export class ReturnHeaderResponseDto {
  @ApiProperty({ example: 'ret-header-uuid-1' })
  id: string;

  @ApiProperty({ example: 'disp-uuid-1' })
  dispatchHeaderId: string;

  @ApiProperty({ example: '2026-09-03T00:00:00.000Z' })
  returnDate: Date;

  @ApiProperty({ enum: ReturnTypeEnum, example: ReturnTypeEnum.PARCIAL })
  returnType: ReturnTypeEnum;

  @ApiProperty({ example: 'Rechazo de calidad en Planta 2 por exceso de humedad' })
  reason: string;

  @ApiPropertyOptional({ example: 'Piezas reingresadas a patio secundario' })
  observations?: string;

  @ApiProperty({ example: 'user-uuid-1' })
  registeredById: string;

  @ApiProperty({ example: '2026-09-03T14:30:00.000Z' })
  createdAt: Date;

  @ApiPropertyOptional({ type: () => ReturnDispatchHeaderResponseDto })
  dispatchHeader?: ReturnDispatchHeaderResponseDto;

  @ApiPropertyOptional({ type: () => ReturnClientCenterDto })
  clientCenter?: ReturnClientCenterDto;

  @ApiPropertyOptional({ type: () => ReturnUserResponseDto })
  registeredBy?: ReturnUserResponseDto;

  @ApiPropertyOptional({ type: [ReturnDetailResponseDto] })
  returnDetails?: ReturnDetailResponseDto[];
}

export class ReturnPaginationMetaDto {
  @ApiProperty({ example: 12 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 1 })
  totalPages: number;
}

export class PaginatedReturnResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: [ReturnHeaderResponseDto] })
  data: ReturnHeaderResponseDto[];

  @ApiProperty({ type: ReturnPaginationMetaDto })
  meta: ReturnPaginationMetaDto;
}
