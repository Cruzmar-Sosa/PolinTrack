export interface ProductStock {
  productId: string;
  productName: string;
  dimensions: string;
  stock: number;
}

export interface Kpi1CurrentInventory {
  totalPieces: number;
  byProduct: ProductStock[];
}

export interface Kpi2WoodReceipts {
  timbrePieTablarTotal: number;
  procesadaPiecesTotal: number;
}

export interface Kpi3PolinesDispatched {
  totalPieces: number;
}

export interface Kpi4WoodDispatchedEquivalent {
  totalDispatchedEquivalent: number;
}

export interface ClientCenterDispatch {
  centerName: string;
  pieces: number;
}

export interface DashboardKpisData {
  kpi1_currentInventory: Kpi1CurrentInventory;
  kpi2_woodReceipts: Kpi2WoodReceipts;
  kpi3_polinesDispatched: Kpi3PolinesDispatched;
  kpi4_woodDispatchedEquivalent: Kpi4WoodDispatchedEquivalent;
  kpi5_dispatchesByClientCenter: ClientCenterDispatch[];
}

export type DatePreset = 'TODAY' | 'LAST_7_DAYS' | 'THIS_MONTH' | 'CUSTOM';

export interface DashboardDateFilter {
  preset: DatePreset;
  startDate?: string;
  endDate?: string;
}
