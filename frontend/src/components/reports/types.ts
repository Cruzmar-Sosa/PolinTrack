export type ReportTab =
  | 'wood-receipts'
  | 'dispatches'
  | 'inventory'
  | 'daily-productions'
  | 'fumigations'
  | 'distribution-centers';

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// -----------------------------------------------------------------------------
// Reporte 1: Ingreso de Madera (EP-REP-01)
// -----------------------------------------------------------------------------
export interface WoodReceiptReportItem {
  id: string;
  receiptDate: string;
  receiptTime: string;
  supplierName: string;
  speciesName: string;
  woodTypeName: string;
  quantity: number;
  unit: string;
  yugosQuantity?: number | null;
  reglasQuantity?: number | null;
  woodStatus?: string | null;
  lotNumber: string;
  guideNumber?: string | null;
  receivedBy: string;
}

// -----------------------------------------------------------------------------
// Reporte 2: Salidas y Despachos (EP-REP-02)
// -----------------------------------------------------------------------------
export interface DispatchReportItem {
  id: string;
  dispatchDate: string;
  dispatchTime: string;
  invoiceNumber: string;
  clientCenterName: string;
  productionLot: string;
  productName: string;
  dimensions: string;
  quantityDispatched: number;
  quantityReturnedAccumulated: number;
  vehicleInfo?: string | null;
  driverName?: string | null;
  status: string;
  observations?: string | null;
}

// -----------------------------------------------------------------------------
// Reporte 3: Inventario Operativo Consolidado (EP-REP-03)
// -----------------------------------------------------------------------------
export interface InventoryReportItem {
  productId: string;
  productName: string;
  dimensions: string;
  totalProduced: number;
  totalDispatched: number;
  totalReturned: number;
  netAdjustments: number;
  currentAvailableStock: number;
}

export interface InventoryReportSummary {
  totalProduced: number;
  totalDispatched: number;
  totalReturned: number;
  totalAvailableStock: number;
}

// -----------------------------------------------------------------------------
// Reporte 4: Producción Diaria por Semana ISO (EP-REP-04)
// -----------------------------------------------------------------------------
export interface DailyProductionReportItem {
  id: string;
  productionDate: string;
  productionLot: string;
  isoWeek: number;
  productName: string;
  dimensions: string;
  quantityProduced: number;
  woodReceiptLots: string[];
  supervisor: string;
}

// -----------------------------------------------------------------------------
// Reporte 5: Fumigaciones y Certificados OIRSA (EP-REP-05)
// -----------------------------------------------------------------------------
export interface FumigationReportItem {
  id: string;
  fumigationDate: string;
  fumigationTime: string;
  productionLot: string;
  productionLots?: string[];
  lotsCount?: number;
  treatedProducts?: string[];
  certificateNumber: string;
  pdfFileName: string;
  fileSizeBytes: number;
  certificateDownloadUrl: string;
  registeredBy: string;
}

// -----------------------------------------------------------------------------
// Reporte 6: Movimientos por Centro de Distribución (EP-REP-06)
// -----------------------------------------------------------------------------
export interface DistributionCenterReportItem {
  clientCenterId: string;
  clientCenterName: string;
  totalDispatched: number;
  totalReturned: number;
  netDelivered: number;
  invoicesCount: number;
}

export interface DistributionCenterReportSummary {
  totalDispatched: number;
  totalReturned: number;
  netDelivered: number;
  totalInvoicesCount: number;
}

// -----------------------------------------------------------------------------
// Filtros Comunes
// -----------------------------------------------------------------------------
export interface ReportFilterValues {
  startDate: string;
  endDate: string;
  supplierId?: string;
  clientCenterId?: string;
  productId?: string;
  page: number;
  limit: number;
}
