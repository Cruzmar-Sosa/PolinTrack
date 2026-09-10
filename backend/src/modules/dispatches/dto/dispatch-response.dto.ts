import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DispatchStatus } from '@prisma/client';

export class DispatchClientCenterResponseDto {
  @ApiProperty({ example: 'c3d4e5f6-a7b8-9012-cdef-123456789012' })
  id: string;

  @ApiProperty({ example: 'Planta 2 - Matagalpa' })
  name: string;

  @ApiPropertyOptional({ example: 'Matagalpa, Nicaragua' })
  location?: string;
}

export class DispatchUserResponseDto {
  @ApiProperty({ example: 'u1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id: string;

  @ApiProperty({ example: 'Carlos Operador' })
  fullName: string;

  @ApiProperty({ example: 'carlos@polintrack.com' })
  email: string;
}

export class DispatchProductResponseDto {
  @ApiProperty({ example: 'p1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id: string;

  @ApiProperty({ example: 'Polín Industrial 3x3x8' })
  name: string;

  @ApiProperty({ example: '3" x 3" x 8\'' })
  dimensions: string;
}

export class DispatchDailyProductionResponseDto {
  @ApiProperty({ example: 'd1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id: string;

  @ApiProperty({ example: 'LT-020926-W36' })
  productionLot: string;

  @ApiProperty({ example: '2026-09-02T00:00:00.000Z' })
  productionDate: Date;
}

export class DispatchDetailResponseDto {
  @ApiProperty({ example: 'det-uuid-1' })
  id: string;

  @ApiProperty({ example: 'disp-uuid-1' })
  dispatchHeaderId: string;

  @ApiProperty({ example: 'prod-uuid-1' })
  productId: string;

  @ApiProperty({ example: 'daily-uuid-1' })
  dailyProductionId: string;

  @ApiProperty({ example: 50 })
  quantityDispatched: number;

  @ApiProperty({ example: '3" x 3" x 8\'' })
  dimensions: string;

  @ApiProperty({ example: 0 })
  quantityReturnedAccumulated: number;

  @ApiPropertyOptional({ type: () => DispatchProductResponseDto })
  product?: DispatchProductResponseDto;

  @ApiPropertyOptional({ type: () => DispatchDailyProductionResponseDto })
  dailyProduction?: DispatchDailyProductionResponseDto;
}

export class DispatchHeaderResponseDto {
  @ApiProperty({ example: 'disp-uuid-1' })
  id: string;

  @ApiProperty({ example: 'F-90210' })
  invoiceNumber: string;

  @ApiProperty({ example: '2026-09-02T00:00:00.000Z' })
  dispatchDate: Date;

  @ApiProperty({ example: '1970-01-01T14:30:00.000Z' })
  dispatchTime: Date;

  @ApiProperty({ example: 'center-uuid-1' })
  clientCenterId: string;

  @ApiPropertyOptional({ example: 'M-12345' })
  vehicleInfo?: string;

  @ApiPropertyOptional({ example: 'Carlos Mendoza' })
  driverName?: string;

  @ApiPropertyOptional({ example: 'Entrega prioritaria' })
  observations?: string;

  @ApiProperty({ enum: DispatchStatus, example: DispatchStatus.COMPLETED })
  status: DispatchStatus;

  @ApiProperty({ example: 'user-uuid-1' })
  createdById: string;

  @ApiProperty({ example: '2026-09-02T14:35:00.000Z' })
  createdAt: Date;

  @ApiPropertyOptional({ type: () => DispatchClientCenterResponseDto })
  clientCenter?: DispatchClientCenterResponseDto;

  @ApiPropertyOptional({ type: () => DispatchUserResponseDto })
  createdBy?: DispatchUserResponseDto;

  @ApiPropertyOptional({ type: [DispatchDetailResponseDto] })
  dispatchDetails?: DispatchDetailResponseDto[];

  @ApiPropertyOptional({ type: [Object] })
  returnHeaders?: any[];
}

export class DispatchPaginationMetaDto {
  @ApiProperty({ example: 45 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 3 })
  totalPages: number;
}

export class PaginatedDispatchResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: [DispatchHeaderResponseDto] })
  data: DispatchHeaderResponseDto[];

  @ApiProperty({ type: DispatchPaginationMetaDto })
  meta: DispatchPaginationMetaDto;
}
