'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, Button, Select, Alert } from '@/components/ui';
import {
  Calendar,
  Filter,
  RefreshCw,
  X,
  AlertTriangle,
  Trees,
  Truck,
  Boxes,
  Factory,
  ShieldCheck,
  Building2,
} from 'lucide-react';
import { ReportTab, ReportFilterValues } from './types';
import { ReportsExportActions } from './reports-export-actions';

interface CatalogItem {
  id: string;
  name: string;
}

interface ReportsFilterBarProps {
  activeTab: ReportTab;
  onTabChange: (tab: ReportTab) => void;
  filters: ReportFilterValues;
  onFilterChange: (newFilters: Partial<ReportFilterValues>) => void;
  onApplyFilters: () => void;
  onResetFilters: () => void;
  isLoading: boolean;
  exportFilename: string;
  exportHeaders: string[];
  exportRows: (string | number | null | undefined)[][];
  token?: string;
  apiUrl: string;
}

export function ReportsFilterBar({
  activeTab,
  onTabChange,
  filters,
  onFilterChange,
  onApplyFilters,
  onResetFilters,
  isLoading,
  exportFilename,
  exportHeaders,
  exportRows,
  token,
  apiUrl,
}: ReportsFilterBarProps) {
  // Catalog Options State
  const [suppliers, setSuppliers] = useState<CatalogItem[]>([]);
  const [products, setProducts] = useState<CatalogItem[]>([]);
  const [clientCenters, setClientCenters] = useState<CatalogItem[]>([]);

  // Load Catalogs on Mount
  useEffect(() => {
    if (!token) return;

    // Load Products
    fetch(`${apiUrl}/catalog/products`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          setProducts(json.data.map((p: any) => ({ id: p.id, name: `${p.name} (${p.dimensions})` })));
        }
      })
      .catch(() => {});

    // Load Client Centers
    fetch(`${apiUrl}/catalog/client-centers`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          setClientCenters(json.data.map((c: any) => ({ id: c.id, name: c.name })));
        }
      })
      .catch(() => {});

    // Load Suppliers
    fetch(`${apiUrl}/suppliers`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          setSuppliers(json.data.map((s: any) => ({ id: s.id, name: s.name })));
        }
      })
      .catch(() => {});
  }, [apiUrl, token]);

  // Validation RN-007: startDate <= endDate
  const isDateRangeInvalid = Boolean(
    filters.startDate && filters.endDate && filters.startDate > filters.endDate
  );

  const tabs: Array<{ id: ReportTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'wood-receipts', label: '1. Materia Prima', icon: Trees },
    { id: 'dispatches', label: '2. Despachos', icon: Truck },
    { id: 'inventory', label: '3. Inventario', icon: Boxes },
    { id: 'daily-productions', label: '4. Producción ISO', icon: Factory },
    { id: 'fumigations', label: '5. Fumigaciones OIRSA', icon: ShieldCheck },
    { id: 'distribution-centers', label: '6. Distribución Clientes', icon: Building2 },
  ];

  return (
    <div className="space-y-4">
      {/* 1. REPORT TABS SELECTOR */}
      <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-xl bg-slate-100 border border-slate-200 print:hidden">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                isActive
                  ? 'bg-white text-[#1D71CB] shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#1D71CB]' : 'text-slate-500'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 2. FILTER BAR CARD */}
      <Card className="border-slate-200 shadow-xs print:hidden">
        <CardContent className="p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!isDateRangeInvalid) onApplyFilters();
            }}
            className="space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 items-end">
              {/* Fecha Inicial */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>Fecha Inicial</span>
                </label>
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => onFilterChange({ startDate: e.target.value, page: 1 })}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 font-mono focus:ring-1 focus:ring-blue-500 h-9"
                />
              </div>

              {/* Fecha Final */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>Fecha Final</span>
                </label>
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => onFilterChange({ endDate: e.target.value, page: 1 })}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 font-mono focus:ring-1 focus:ring-blue-500 h-9"
                />
              </div>

              {/* Contextual Filter 1: Supplier (for wood-receipts) */}
              {activeTab === 'wood-receipts' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Proveedor
                  </label>
                  <Select
                    value={filters.supplierId || ''}
                    onChange={(e) => onFilterChange({ supplierId: e.target.value, page: 1 })}
                    className="h-9 text-xs"
                  >
                    <option value="">Todos los proveedores</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              {/* Contextual Filter 2: Client Center (for dispatches & distribution) */}
              {(activeTab === 'dispatches' || activeTab === 'distribution-centers') && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Centro Cliente
                  </label>
                  <Select
                    value={filters.clientCenterId || ''}
                    onChange={(e) => onFilterChange({ clientCenterId: e.target.value, page: 1 })}
                    className="h-9 text-xs"
                  >
                    <option value="">Todas las plantas</option>
                    {clientCenters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              {/* Contextual Filter 3: Product (for inventory & daily-productions) */}
              {(activeTab === 'inventory' || activeTab === 'daily-productions' || activeTab === 'dispatches') && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Producto Terminado
                  </label>
                  <Select
                    value={filters.productId || ''}
                    onChange={(e) => onFilterChange({ productId: e.target.value, page: 1 })}
                    className="h-9 text-xs"
                  >
                    <option value="">Todos los productos</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              {/* Action Buttons: Consultar & Limpiar */}
              <div className="flex items-center gap-2">
                <Button
                  type="submit"
                  disabled={isLoading || isDateRangeInvalid}
                  className="bg-[#1D71CB] hover:bg-[#165EA8] text-white text-xs h-9 px-4 flex items-center gap-1.5 font-semibold flex-1 justify-center"
                >
                  {isLoading ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Filter className="w-3.5 h-3.5" />
                  )}
                  <span>Generar Reporte</span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onResetFilters}
                  disabled={isLoading}
                  className="h-9 px-2.5 text-xs text-slate-600 hover:text-slate-900 border-slate-300"
                  title="Limpiar filtros a valores iniciales"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>

              {/* Export & Print */}
              <div className="sm:col-span-2 md:col-span-1 flex justify-end">
                <ReportsExportActions
                  filename={exportFilename}
                  headers={exportHeaders}
                  rows={exportRows}
                  disabled={isLoading || exportRows.length === 0}
                />
              </div>
            </div>

            {/* STRICT RN-007 IN-LINE VALIDATION BANNER */}
            {isDateRangeInvalid && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2 animate-in fade-in duration-200">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span className="font-semibold">
                  Regla de Negocio RN-007: La fecha inicial no puede ser posterior a la fecha final.
                </span>
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
