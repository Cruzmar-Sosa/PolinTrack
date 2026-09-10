export type TraceabilityQueryType = 'LOT_PRODUCTION' | 'LOT_WOOD' | 'INVOICE';

export interface TraceabilityWoodOrigin {
  lotNumber: string;
  supplierName: string;
  species: string;
  woodType: string;
  quantity: number;
  unit: string;
  yugosQuantity?: number | null;
  reglasQuantity?: number | null;
  receiptDate: string;
}

export interface TraceabilityProduction {
  lot: string;
  product: string;
  dimensions: string;
  productionDate: string;
  isoWeek: number;
  quantityProduced: number;
  supervisor: string;
}

export interface TraceabilityFumigation {
  id?: string;
  certificateNumber: string;
  fumigationDate: string;
  certificateDownloadUrl?: string;
  treatedProducts?: string[];
  certificateUrl?: string;
}

export interface TraceabilityDispatch {
  invoiceNumber: string;
  clientCenter: string;
  dispatchDate: string;
  quantityDispatched: number;
  driverName?: string | null;
}

export interface TraceabilityReturn {
  invoiceNumber: string;
  clientCenter?: string;
  returnDate: string;
  quantityReturned: number;
  reason: string;
  registeredBy: string;
}

export interface TraceabilityLotStatus {
  initialProduced: number;
  currentlyDelivered: number;
  availableInYard: number;
}

export interface TraceabilityGraphNode {
  id: string;
  type: string;
  label: string;
  data: any;
}

export interface TraceabilityGraphEdge {
  id: string;
  source: string;
  target: string;
  relationship: string;
}

export interface TraceabilityData {
  queryType: TraceabilityQueryType;
  queryValue: string;
  production?: TraceabilityProduction;
  rawMaterialOrigin: TraceabilityWoodOrigin[];
  fumigations: TraceabilityFumigation[];
  dispatches: TraceabilityDispatch[];
  returns: TraceabilityReturn[];
  currentLotStatus?: TraceabilityLotStatus;
  graph?: {
    nodes: TraceabilityGraphNode[];
    edges: TraceabilityGraphEdge[];
  };
}

export type OnDrillDownFn = (type: TraceabilityQueryType, value: string) => void;
