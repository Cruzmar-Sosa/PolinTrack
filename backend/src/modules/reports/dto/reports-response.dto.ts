import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PaginationMetaDto {
  @ApiProperty({ example: 100 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 50 })
  limit: number;

  @ApiProperty({ example: 2 })
  totalPages: number;
}

// -----------------------------------------------------------------------------
// Reporte 1: Ingresos de Madera
// -----------------------------------------------------------------------------
export class WoodReceiptReportItemDto {
  @ApiProperty({ example: 'wr-uuid-1' })
  id: string;

  @ApiProperty({ example: '2026-09-02' })
  receiptDate: string;

  @ApiProperty({ example: '08:30:00' })
  receiptTime: string;

  @ApiProperty({ example: 'Maderas del Norte S.A.' })
  supplierName: string;

  @ApiProperty({ example: 'TECA' })
  speciesName: string;

  @ApiProperty({ example: 'TIMBRE' })
  woodTypeName: string;

  @ApiProperty({ example: 12500.5 })
  quantity: number;

  @ApiProperty({ example: 'PIE_TABLAR' })
  unit: string;

  @ApiPropertyOptional({ example: 120, description: 'Cantidad de Yugos en piezas' })
  yugosQuantity?: number | null;

  @ApiPropertyOptional({ example: 80, description: 'Cantidad de Reglas en piezas' })
  reglasQuantity?: number | null;

  @ApiPropertyOptional({ example: 'Húmeda' })
  woodStatus?: string | null;

  @ApiProperty({ example: 'LT-020926-01' })
  lotNumber: string;

  @ApiPropertyOptional({ example: 'G-10293' })
  guideNumber?: string | null;

  @ApiProperty({ example: 'Carlos Mendoza' })
  receivedBy: string;
}

export class WoodReceiptsReportResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: [WoodReceiptReportItemDto] })
  data: WoodReceiptReportItemDto[];

  @ApiProperty({ type: () => PaginationMetaDto })
  meta: PaginationMetaDto;
}

// -----------------------------------------------------------------------------
// Reporte 2: Salidas y Despachos
// -----------------------------------------------------------------------------
export class DispatchReportItemDto {
  @ApiProperty({ example: 'dh-uuid-1' })
  id: string;

  @ApiProperty({ example: '2026-09-03' })
  dispatchDate: string;

  @ApiProperty({ example: '10:00:00' })
  dispatchTime: string;

  @ApiProperty({ example: 'F-1002' })
  invoiceNumber: string;

  @ApiProperty({ example: 'Planta 2' })
  clientCenterName: string;

  @ApiProperty({ example: 'LT-020926-W36' })
  productionLot: string;

  @ApiProperty({ example: 'Polín 45x48' })
  productName: string;

  @ApiProperty({ example: '45x48' })
  dimensions: string;

  @ApiProperty({ example: 1000 })
  quantityDispatched: number;

  @ApiProperty({ example: 0 })
  quantityReturnedAccumulated: number;

  @ApiPropertyOptional({ example: 'M-12345' })
  vehicleInfo?: string | null;

  @ApiPropertyOptional({ example: 'Marcos Rivera' })
  driverName?: string | null;

  @ApiProperty({ example: 'COMPLETED' })
  status: string;

  @ApiPropertyOptional({ example: 'Despacho normal' })
  observations?: string | null;
}

export class DispatchesReportResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: [DispatchReportItemDto] })
  data: DispatchReportItemDto[];

  @ApiProperty({ type: () => PaginationMetaDto })
  meta: PaginationMetaDto;
}

// -----------------------------------------------------------------------------
// Reporte 3: Inventario Operativo Consolidado
// -----------------------------------------------------------------------------
export class InventoryReportItemDto {
  @ApiProperty({ example: 'prod-uuid-1' })
  productId: string;

  @ApiProperty({ example: 'Polín 45x48' })
  productName: string;

  @ApiProperty({ example: '45x48' })
  dimensions: string;

  @ApiProperty({ example: 5000 })
  totalProduced: number;

  @ApiProperty({ example: 3500 })
  totalDispatched: number;

  @ApiProperty({ example: 200 })
  totalReturned: number;

  @ApiProperty({ example: 50 })
  netAdjustments: number;

  @ApiProperty({ example: 1750 })
  currentAvailableStock: number;
}

export class InventoryReportResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: [InventoryReportItemDto] })
  data: InventoryReportItemDto[];

  @ApiProperty({
    example: {
      totalProduced: 12000,
      totalDispatched: 8000,
      totalReturned: 500,
      totalAvailableStock: 4500,
    },
  })
  summary: {
    totalProduced: number;
    totalDispatched: number;
    totalReturned: number;
    totalAvailableStock: number;
  };
}

// -----------------------------------------------------------------------------
// Reporte 4: Producción Diaria por Semana ISO
// -----------------------------------------------------------------------------
export class DailyProductionReportItemDto {
  @ApiProperty({ example: 'dp-uuid-1' })
  id: string;

  @ApiProperty({ example: '2026-09-02' })
  productionDate: string;

  @ApiProperty({ example: 'LT-020926-W36' })
  productionLot: string;

  @ApiProperty({ example: 36 })
  isoWeek: number;

  @ApiProperty({ example: 'Polín 45x48' })
  productName: string;

  @ApiProperty({ example: '45x48' })
  dimensions: string;

  @ApiProperty({ example: 1500 })
  quantityProduced: number;

  @ApiProperty({ example: ['LT-010926-01', 'LT-010926-02'] })
  woodReceiptLots: string[];

  @ApiProperty({ example: 'Carlos Mendoza' })
  supervisor: string;
}

export class DailyProductionsReportResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: [DailyProductionReportItemDto] })
  data: DailyProductionReportItemDto[];

  @ApiProperty({ type: () => PaginationMetaDto })
  meta: PaginationMetaDto;
}

// -----------------------------------------------------------------------------
// Reporte 5: Fumigaciones y Certificados OIRSA
// -----------------------------------------------------------------------------
export class FumigationReportItemDto {
  @ApiProperty({ example: 'fum-uuid-1' })
  id: string;

  @ApiProperty({ example: '2026-09-02' })
  fumigationDate: string;

  @ApiProperty({ example: '14:00:00' })
  fumigationTime: string;

  @ApiProperty({ example: 'LT-020926-W36' })
  productionLot: string;

  @ApiPropertyOptional({ example: ['LT-020926-W36', 'LT-030926-W36'], type: [String] })
  productionLots?: string[];

  @ApiPropertyOptional({ example: 2 })
  lotsCount?: number;

  @ApiPropertyOptional({ example: ['Polín 45x48', 'Polín 45x47'], type: [String] })
  treatedProducts?: string[];

  @ApiProperty({ example: 'OIRSA-NIC-2026-9901' })
  certificateNumber: string;

  @ApiProperty({ example: 'OIRSA-NIC-2026-9901.pdf' })
  pdfFileName: string;

  @ApiProperty({ example: 102400 })
  fileSizeBytes: number;

  @ApiProperty({ example: '/api/v1/fumigations/fum-uuid-1/certificate-url' })
  certificateDownloadUrl: string;

  @ApiProperty({ example: 'Carlos Mendoza' })
  registeredBy: string;
}

export class FumigationsReportResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: [FumigationReportItemDto] })
  data: FumigationReportItemDto[];

  @ApiProperty({ type: () => PaginationMetaDto })
  meta: PaginationMetaDto;
}

// -----------------------------------------------------------------------------
// Reporte 6: Movimientos por Centro de Distribución
// -----------------------------------------------------------------------------
export class DistributionCenterReportItemDto {
  @ApiProperty({ example: 'cc-uuid-1' })
  clientCenterId: string;

  @ApiProperty({ example: 'Planta 1' })
  clientCenterName: string;

  @ApiProperty({ example: 3500 })
  totalDispatched: number;

  @ApiProperty({ example: 100 })
  totalReturned: number;

  @ApiProperty({ example: 3400 })
  netDelivered: number;

  @ApiProperty({ example: 5 })
  invoicesCount: number;
}

export class DistributionCentersReportResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: [DistributionCenterReportItemDto] })
  data: DistributionCenterReportItemDto[];

  @ApiProperty({
    example: {
      totalDispatched: 15000,
      totalReturned: 400,
      netDelivered: 14600,
      totalInvoicesCount: 22,
    },
  })
  summary: {
    totalDispatched: number;
    totalReturned: number;
    netDelivered: number;
    totalInvoicesCount: number;
  };
}
