export interface SupplierWoodReceiptItem {
  id: string;
  lotNumber: string;
  receiptDate: string;
  quantity: number | string;
  unit: string;
  guideNumber: string | null;
  species?: { name: string };
  woodType?: { name: string };
}

export interface WoodSupplier {
  id: string;
  name: string;
  legalId: string | null;
  phone: string | null;
  notes: string | null;
  documentUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  woodReceipts?: SupplierWoodReceiptItem[];
  _count?: {
    woodReceipts: number;
  };
}

export interface SupplierFormData {
  name: string;
  legalId: string;
  phone: string;
  address?: string;
  notes: string;
  documentUrl: string;
}

export type SupplierStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';
