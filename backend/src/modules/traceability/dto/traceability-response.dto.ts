import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TraceabilityProductionDto {
  @ApiProperty({ example: 'LT-020926-W36' })
  lot: string;

  @ApiProperty({ example: 'Polín 45x48' })
  product: string;

  @ApiProperty({ example: '45x48' })
  dimensions: string;

  @ApiProperty({ example: '2026-09-02' })
  productionDate: string;

  @ApiProperty({ example: 36 })
  isoWeek: number;

  @ApiProperty({ example: 1500 })
  quantityProduced: number;

  @ApiProperty({ example: 'Carlos Mendoza' })
  supervisor: string;
}

export class TraceabilityRawMaterialDto {
  @ApiProperty({ example: 'LT-020926-01' })
  lotNumber: string;

  @ApiProperty({ example: 'Maderas del Norte S.A.' })
  supplierName: string;

  @ApiProperty({ example: 'TECA' })
  species: string;

  @ApiProperty({ example: 'TIMBRE' })
  woodType: string;

  @ApiProperty({ example: 12500.5 })
  quantity: number;

  @ApiProperty({ example: 'PIE_TABLAR' })
  unit: string;

  @ApiPropertyOptional({ example: 120, description: 'Cantidad de Yugos en piezas' })
  yugosQuantity?: number | null;

  @ApiPropertyOptional({ example: 80, description: 'Cantidad de Reglas en piezas' })
  reglasQuantity?: number | null;

  @ApiProperty({ example: '2026-09-02' })
  receiptDate: string;
}

export class TraceabilityFumigationDto {
  @ApiProperty({ example: 'OIRSA-NIC-2026-9901' })
  certificateNumber: string;

  @ApiProperty({ example: '2026-09-02' })
  fumigationDate: string;

  @ApiProperty({
    example: '/api/v1/fumigations/4d3c2b1a-0000-0000-0000-000000000000/certificate-url',
  })
  certificateDownloadUrl: string;

  @ApiPropertyOptional({ example: ['Polín 45x48'], type: [String] })
  treatedProducts?: string[];
}

export class TraceabilityDispatchDto {
  @ApiProperty({ example: 'F-1002' })
  invoiceNumber: string;

  @ApiProperty({ example: 'Planta 2' })
  clientCenter: string;

  @ApiProperty({ example: '2026-09-02' })
  dispatchDate: string;

  @ApiProperty({ example: 1000 })
  quantityDispatched: number;

  @ApiPropertyOptional({ example: 'Marcos Rivera' })
  driverName?: string | null;
}

export class TraceabilityReturnDto {
  @ApiProperty({ example: 'F-1002' })
  invoiceNumber: string;

  @ApiPropertyOptional({ example: 'Planta 2 - Matagalpa' })
  clientCenter?: string;

  @ApiProperty({ example: '2026-09-03' })
  returnDate: string;

  @ApiProperty({ example: 150 })
  quantityReturned: number;

  @ApiProperty({ example: 'Rechazo de calidad en Planta 2' })
  reason: string;

  @ApiProperty({ example: 'Ana Morales' })
  registeredBy: string;
}

export class TraceabilityLotStatusDto {
  @ApiProperty({ example: 1500 })
  initialProduced: number;

  @ApiProperty({ example: 850 })
  currentlyDelivered: number;

  @ApiProperty({ example: 650 })
  availableInYard: number;
}

export class TraceabilityNodeDto {
  @ApiProperty({ example: 'prod-uuid-1' })
  id: string;

  @ApiProperty({
    example: 'DAILY_PRODUCTION',
    enum: [
      'WOOD_RECEIPT',
      'DAILY_PRODUCTION',
      'FUMIGATION',
      'DISPATCH',
      'RETURN',
    ],
  })
  type: string;

  @ApiProperty({ example: 'Lote LT-020926-W36' })
  label: string;

  @ApiProperty({ example: { quantityProduced: 1500, date: '2026-09-02' } })
  data: Record<string, any>;
}

export class TraceabilityEdgeDto {
  @ApiProperty({ example: 'e-wood-prod-1' })
  id: string;

  @ApiProperty({ example: 'wood-uuid-1' })
  source: string;

  @ApiProperty({ example: 'prod-uuid-1' })
  target: string;

  @ApiProperty({
    example: 'SUPPLIES',
    enum: ['SUPPLIES', 'TREATED_BY', 'DISPATCHED_IN', 'RETURNED_FROM'],
  })
  relationship: string;
}

export class TraceabilityGraphDto {
  @ApiProperty({ type: [TraceabilityNodeDto] })
  nodes: TraceabilityNodeDto[];

  @ApiProperty({ type: [TraceabilityEdgeDto] })
  edges: TraceabilityEdgeDto[];
}

export class TraceabilityDataDto {
  @ApiProperty({ example: 'LOT_PRODUCTION' })
  queryType: string;

  @ApiProperty({ example: 'LT-020926-W36' })
  queryValue: string;

  @ApiPropertyOptional({ type: () => TraceabilityProductionDto })
  production: TraceabilityProductionDto | null;

  @ApiProperty({ type: [TraceabilityRawMaterialDto] })
  rawMaterialOrigin: TraceabilityRawMaterialDto[];

  @ApiProperty({ type: [TraceabilityFumigationDto] })
  fumigations: TraceabilityFumigationDto[];

  @ApiProperty({ type: [TraceabilityDispatchDto] })
  dispatches: TraceabilityDispatchDto[];

  @ApiProperty({ type: [TraceabilityReturnDto] })
  returns: TraceabilityReturnDto[];

  @ApiPropertyOptional({ type: () => TraceabilityLotStatusDto })
  currentLotStatus: TraceabilityLotStatusDto | null;

  @ApiProperty({ type: () => TraceabilityGraphDto })
  graph: TraceabilityGraphDto;
}

export class TraceabilityResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: () => TraceabilityDataDto })
  data: TraceabilityDataDto;
}
