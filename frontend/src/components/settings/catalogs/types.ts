export interface WoodSpeciesItem {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  botanicalName?: string;
  description?: string;
}

export interface WoodTypeItem {
  id: string;
  name: string;
  defaultUnit: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface ProductItem {
  id: string;
  name: string;
  dimensions: string;
  isActive: boolean;
  createdAt: string;
}

export interface ClientCenterItem {
  id: string;
  name: string;
  location: string | null;
  isActive: boolean;
  createdAt: string;
  estimatedFreightHours?: number;
}

export type CatalogTab = 'wood-species' | 'wood-types' | 'products' | 'client-centers';

export interface WoodSpeciesFormData {
  name: string;
}

export interface ProductFormData {
  name: string;
  dimensions: string;
}

export interface ClientCenterFormData {
  name: string;
  location: string;
}

export interface CatalogStatusModalState {
  isOpen: boolean;
  itemType: 'species' | 'product' | 'clientCenter';
  id: string;
  name: string;
  currentStatus: boolean;
}
