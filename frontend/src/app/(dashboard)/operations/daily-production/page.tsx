'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/lib/auth-context';
import {
  PageTitle,
  MutedText,
  Badge,
  Button,
  Skeleton,
  EmptyState,
  ErrorState,
  Dialog,
  Drawer,
  TablePagination,
} from '@/components/ui';
import {
  Factory,
  Calendar,
  Layers,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Info,
  CheckCircle2,
  AlertCircle,
  Clock,
  User,
  ExternalLink,
  X,
  FileText,
  Boxes,
  Trash2,
} from 'lucide-react';
import {
  formatDate,
  formatTime,
  formatDateLong,
  formatDateTime,
} from '@/lib/date-formatters';

interface ProductItem {
  id: string;
  name: string;
  dimensions: string;
  isActive: boolean;
}

interface LinkedWoodReceipt {
  id: string;
  lotNumber: string;
  quantity: number | string;
  unit: string;
  supplier?: {
    id: string;
    name: string;
  };
  species?: {
    id: string;
    name: string;
  };
  woodType?: {
    id: string;
    name: string;
  };
}

interface ProductionDetailItem {
  id: string;
  productId: string;
  quantityProduced: number;
  product: {
    id: string;
    name: string;
    dimensions: string;
  };
}

interface DailyProduction {
  id: string;
  productionLot: string;
  productionDate: string;
  isoWeek: number;
  isoYear: number;
  productId?: string;
  quantityProduced?: number;
  product?: {
    id: string;
    name: string;
    dimensions: string;
  };
  productionDetails?: ProductionDetailItem[];
  totalQuantity?: number;
  linkedWoodReceipts?: LinkedWoodReceipt[];
  createdById?: string;
  createdBy?: {
    id: string;
    fullName: string;
    email: string;
  };
  fumigationsCount?: number;
  createdAt: string;
}

interface WoodReceiptOption {
  id: string;
  lotNumber: string;
  supplier: { name: string };
  species: { name: string };
  woodType: { name: string };
  quantity: number | string;
  unit: string;
}

interface ProductFormRow {
  productId: string;
  quantity: string;
}

// Client-side helper to preview ISO 8601 week matching standard ISO
function calculateISOWeek(dateStr: string): { isoWeek: number; previewLot: string } {
  if (!dateStr) return { isoWeek: 1, previewLot: 'LT-DDMMYY-WXX' };
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  if (isNaN(d.getTime())) return { isoWeek: 1, previewLot: 'LT-DDMMYY-WXX' };

  const dayOfWeek = d.getUTCDay();
  const isoDay = dayOfWeek === 0 ? 7 : dayOfWeek;
  d.setUTCDate(d.getUTCDate() + 4 - isoDay);

  const isoYear = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const dayOfYear = Math.floor((d.getTime() - yearStart.getTime()) / 86400000) + 1;
  const isoWeek = Math.ceil(dayOfYear / 7);

  const parts = dateStr.split('-');
  const shortYear = parts[0].slice(2);
  const weekStr = String(isoWeek).padStart(2, '0');
  const previewLot = `LT-${parts[2]}${parts[1]}${shortYear}-W${weekStr}`;

  return { isoWeek, previewLot };
}

export default function DailyProductionPage() {
  const { role, session } = useAuth();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

  // Data states
  const [productions, setProductions] = useState<DailyProduction[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [woodReceiptOptions, setWoodReceiptOptions] = useState<WoodReceiptOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProductFilter, setSelectedProductFilter] = useState('');
  const [selectedWeekFilter, setSelectedWeekFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Reset page to 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedProductFilter, selectedWeekFilter, startDate, endDate]);

  // Modal Create
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [formProductionDate, setFormProductionDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [formProducts, setFormProducts] = useState<ProductFormRow[]>([
    { productId: '', quantity: '' },
  ]);
  const [formWoodReceiptIds, setFormWoodReceiptIds] = useState<string[]>([]);

  // Drawer / Detail Modal
  const [selectedProduction, setSelectedProduction] = useState<DailyProduction | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const isMutationAllowed = role === 'ADMIN' || role === 'CONTABILIDAD';

  // Dynamic preview calculation
  const { isoWeek: currentPreviewWeek, previewLot: currentPreviewLot } = useMemo(() => {
    return calculateISOWeek(formProductionDate);
  }, [formProductionDate]);

  // Load all operational and catalog data
  const loadData = async () => {
    if (!session?.access_token) return;
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const headers = { Authorization: `Bearer ${session.access_token}` };

      const [resProd, resCatalogProducts, resReceipts] = await Promise.all([
        fetch(`${apiUrl}/daily-productions?limit=0`, { headers }),
        fetch(`${apiUrl}/catalog/products?includeInactive=false`, { headers }),
        fetch(`${apiUrl}/wood-receipts?limit=0`, { headers }),
      ]);

      if (!resProd.ok) {
        throw new Error('Error al consultar el historial de producción');
      }

      const [jsonProd, jsonCatalog, jsonReceipts] = await Promise.all([
        resProd.json(),
        resCatalogProducts.json(),
        resReceipts.json(),
      ]);

      setProductions(jsonProd.data || []);
      setProducts(jsonCatalog.data || []);
      setWoodReceiptOptions(jsonReceipts.data || []);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error de conexión con el servidor');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [session?.access_token]);

  // Filtered and Chronologically Sorted productions list (Regla 1: createdAt DESC / productionDate DESC)
  const filteredProductions = useMemo(() => {
    return productions
      .filter((p) => {
        // Search matching lot or any product name/dimensions
        const details = p.productionDetails || [];
        const hasMatchingDetailSearch = details.some(
          (d) =>
            d.product?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            d.product?.dimensions?.toLowerCase().includes(searchTerm.toLowerCase()),
        );
        const matchesLegacySearch =
          p.product?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.product?.dimensions?.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesSearch =
          !searchTerm ||
          p.productionLot.toLowerCase().includes(searchTerm.toLowerCase()) ||
          hasMatchingDetailSearch ||
          matchesLegacySearch;

        const matchesProduct =
          !selectedProductFilter ||
          (details.length > 0
            ? details.some((d) => d.productId === selectedProductFilter)
            : p.productId === selectedProductFilter);

        const matchesWeek =
          !selectedWeekFilter || p.isoWeek === parseInt(selectedWeekFilter, 10);

        const matchesStart =
          !startDate || p.productionDate >= startDate;

        const matchesEnd =
          !endDate || p.productionDate <= endDate;

        return matchesSearch && matchesProduct && matchesWeek && matchesStart && matchesEnd;
      })
      .sort((a, b) => {
        // 1. Business date: productionDate DESC
        const dateA = new Date(a.productionDate).getTime();
        const dateB = new Date(b.productionDate).getTime();
        if (dateB !== dateA) return dateB - dateA;
        // 2. Creation timestamp: createdAt DESC
        const createdA = new Date(a.createdAt).getTime();
        const createdB = new Date(b.createdAt).getTime();
        if (createdB !== createdA) return createdB - createdA;
        // 3. Deterministic id DESC
        return b.id.localeCompare(a.id);
      });
  }, [productions, searchTerm, selectedProductFilter, selectedWeekFilter, startDate, endDate]);

  const totalPages = useMemo(() => {
    if (pageSize === 0) return 1;
    return Math.ceil(filteredProductions.length / pageSize) || 1;
  }, [filteredProductions.length, pageSize]);

  const paginatedProductions = useMemo(() => {
    if (pageSize === 0) return filteredProductions;
    const start = (currentPage - 1) * pageSize;
    return filteredProductions.slice(start, start + pageSize);
  }, [filteredProductions, currentPage, pageSize]);

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setFormError(null);
    setFormProductionDate(new Date().toISOString().split('T')[0]);
    setFormProducts([
      { productId: products[0]?.id || '', quantity: '' },
    ]);
    setFormWoodReceiptIds([]);
    setIsCreateModalOpen(true);
  };

  // Row management for multiple products
  const handleAddProductRow = () => {
    const usedIds = new Set(formProducts.map((p) => p.productId));
    const nextAvailable = products.find((p) => !usedIds.has(p.id))?.id || products[0]?.id || '';
    setFormProducts((prev) => [...prev, { productId: nextAvailable, quantity: '' }]);
  };

  const handleRemoveProductRow = (index: number) => {
    if (formProducts.length <= 1) return;
    setFormProducts((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateProductRow = (
    index: number,
    field: 'productId' | 'quantity',
    value: string,
  ) => {
    setFormProducts((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  // Total quantity in create form
  const totalFormPieces = useMemo(() => {
    return formProducts.reduce((acc, row) => {
      const q = parseInt(row.quantity, 10);
      return acc + (isNaN(q) || q <= 0 ? 0 : q);
    }, 0);
  }, [formProducts]);

  // Submit Create Production
  const handleSubmitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (formProducts.length === 0) {
      setFormError('Debe agregar al menos un producto terminado.');
      return;
    }

    // Validate each row
    for (let i = 0; i < formProducts.length; i++) {
      const row = formProducts[i];
      if (!row.productId) {
        setFormError(`La fila #${i + 1} no tiene un producto seleccionado.`);
        return;
      }
      const qty = parseInt(row.quantity, 10);
      if (isNaN(qty) || qty <= 0) {
        setFormError(
          `La cantidad producida en la fila #${i + 1} debe ser un número entero mayor a cero.`,
        );
        return;
      }
    }

    // Check duplicate products
    const productIds = formProducts.map((r) => r.productId);
    const uniqueIds = new Set(productIds);
    if (uniqueIds.size !== productIds.length) {
      setFormError(
        'No puede seleccionar el mismo producto más de una vez en la misma jornada. Ingrese la cantidad consolidada en una sola fila.',
      );
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    if (formProductionDate > todayStr) {
      setFormError('La fecha de producción no puede ser posterior al día de hoy.');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload: any = {
        productionDate: formProductionDate,
        products: formProducts.map((r) => ({
          productId: r.productId,
          quantityProduced: parseInt(r.quantity, 10),
        })),
      };

      if (formWoodReceiptIds.length > 0) {
        payload.woodReceiptIds = formWoodReceiptIds;
      }

      const res = await fetch(`${apiUrl}/daily-productions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      const resJson = await res.json();

      if (!res.ok) {
        throw new Error(resJson.message || 'Error al registrar la orden de producción diaria.');
      }

      const lotCreated = resJson.data?.productionLot || currentPreviewLot;
      const weekCreated = resJson.data?.isoWeek || currentPreviewWeek;
      setSuccessMessage(
        `Jornada de producción registrada exitosamente. Lote oficial generado: ${lotCreated} (Semana ISO ${weekCreated}) con ${formProducts.length} producto(s) y ${totalFormPieces} piezas.`,
      );
      setTimeout(() => setSuccessMessage(null), 7000);
      setIsCreateModalOpen(false);
      loadData();
      setCurrentPage(1);
    } catch (err: any) {
      setFormError(err.message || 'Error inesperado al registrar la producción.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleWoodReceiptSelection = (receiptId: string) => {
    setFormWoodReceiptIds((prev) =>
      prev.includes(receiptId) ? prev.filter((id) => id !== receiptId) : [...prev, receiptId],
    );
  };

  const handleOpenDetail = (prod: DailyProduction) => {
    setSelectedProduction(prod);
    setIsDrawerOpen(true);
  };

  // Helper to get normalized product details list
  const getProductDetailsList = (p: DailyProduction): ProductionDetailItem[] => {
    if (p.productionDetails && p.productionDetails.length > 0) {
      return p.productionDetails;
    }
    if (p.product) {
      return [
        {
          id: p.id,
          productId: p.productId || '',
          quantityProduced: p.quantityProduced || 0,
          product: p.product,
        },
      ];
    }
    return [];
  };

  return (
    <div className="space-y-6">
      {/* Header & Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-3">
            <PageTitle>Producción Diaria de Polines</PageTitle>
            <Badge variant="default">M04: Producción</Badge>
          </div>
          <MutedText>
            Registro de piezas fabricadas por jornada con soporte multiproducto, cálculo automático de semana ISO y emisión de Lote oficial (<strong>LT-DDMMYY-WXX</strong>).
          </MutedText>
        </div>

        <div className="flex items-center gap-3">
          {isMutationAllowed ? (
            <Button
              variant="default"
              onClick={handleOpenCreateModal}
              className="bg-[#1D71CB] hover:bg-[#165ba3] text-white flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>+ Registrar Producción</span>
            </Button>
          ) : (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2 rounded-lg font-medium flex items-center gap-2">
              <Info className="w-3.5 h-3.5 text-amber-600" />
              <span>Modo Solo Lectura (Rol CONSULTA)</span>
            </div>
          )}
        </div>
      </div>

      {/* Global Banners */}
      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="font-medium">{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-sm flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-rose-700 hover:text-rose-900 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center gap-3">
        <div className="flex-1 w-full relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por lote (LT-...), producto o dimensiones..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
          />
        </div>

        <div className="w-full md:w-56">
          <select
            value={selectedProductFilter}
            onChange={(e) => setSelectedProductFilter(e.target.value)}
            className="w-full py-2 px-3 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
          >
            <option value="">Todos los Productos</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.dimensions})
              </option>
            ))}
          </select>
        </div>

        <div className="w-full md:w-44">
          <select
            value={selectedWeekFilter}
            onChange={(e) => setSelectedWeekFilter(e.target.value)}
            className="w-full py-2 px-3 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
          >
            <option value="">Todas las Semanas</option>
            {Array.from({ length: 53 }, (_, i) => i + 1).map((w) => (
              <option key={w} value={w}>
                Semana W{String(w).padStart(2, '0')}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
            title="Fecha inicial"
          />
          <span className="text-slate-400 text-xs">a</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
            title="Fecha final"
          />
        </div>

        <button
          onClick={loadData}
          title="Actualizar listado"
          className="p-2 text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Production Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : filteredProductions.length === 0 ? (
          <div className="p-12">
            <EmptyState
              title="No se encontraron órdenes de producción"
              description={
                searchTerm || selectedProductFilter || selectedWeekFilter || startDate || endDate
                  ? 'No hay registros que coincidan con los filtros aplicados.'
                  : 'Aún no se han registrado jornadas de producción en el sistema.'
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-semibold uppercase tracking-wider">
                  <th className="py-3 px-3 w-12 text-center">N.º</th>
                  <th className="py-3 px-4">Lote Producción</th>
                  <th className="py-3 px-4">Fecha</th>
                  <th className="py-3 px-4">Semana ISO</th>
                  <th className="py-3 px-4">Productos / Dimensiones</th>
                  <th className="py-3 px-4 text-right">Cantidad Producida</th>
                  <th className="py-3 px-4">Origen Patio</th>
                  <th className="py-3 px-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedProductions.map((p, idx) => {
                  const details = getProductDetailsList(p);
                  const totalPieces = details.reduce((sum, d) => sum + d.quantityProduced, 0);
                  const rowNumber = pageSize === 0 ? idx + 1 : (currentPage - 1) * pageSize + idx + 1;

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3 text-center font-mono text-xs text-slate-400 font-semibold">
                        #{rowNumber}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-[#1D71CB] whitespace-nowrap">
                        {p.productionLot}
                      </td>
                      <td className="py-3 px-4 text-slate-700 whitespace-nowrap font-medium">
                        {formatDate(p.productionDate)}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200 font-mono whitespace-nowrap">
                          W{String(p.isoWeek).padStart(2, '0')} / {p.isoYear}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="space-y-1">
                          {details.map((det) => (
                            <div key={det.id} className="text-xs">
                              <span className="font-semibold text-slate-900">{det.product?.name}</span>
                              <span className="text-slate-500 font-mono ml-1.5 text-[11px]">
                                ({det.product?.dimensions})
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="space-y-1">
                          {details.map((det) => (
                            <div key={det.id} className="text-xs">
                              <span className="font-bold text-slate-900 text-sm">
                                {det.quantityProduced.toLocaleString('es-NI')}
                              </span>{' '}
                              <span className="text-xs font-medium text-slate-500">pcs</span>
                            </div>
                          ))}
                          {details.length > 1 && (
                            <div className="border-t border-slate-200 pt-1 mt-1">
                              <span className="text-[10px] text-slate-400 mr-1 uppercase font-semibold">Total:</span>
                              <span className="font-bold text-[#1D71CB] text-sm">
                                {totalPieces.toLocaleString('es-NI')}
                              </span>{' '}
                              <span className="text-[10px] font-medium text-slate-500">pcs</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {p.linkedWoodReceipts && p.linkedWoodReceipts.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {p.linkedWoodReceipts.map((wr, idx) => (
                              <span
                                key={idx}
                                className="text-[11px] font-mono font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200"
                              >
                                {wr.lotNumber}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">No vinculado</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleOpenDetail(p)}
                          className="text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded transition"
                        >
                          Ficha Técnica
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalRecords={filteredProductions.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setCurrentPage(1);
          }}
          isLoading={isLoading}
        />
      </div>

      {/* Drawer Lateral de Detalle */}
      <Drawer
        isOpen={isDrawerOpen && !!selectedProduction}
        onClose={() => setIsDrawerOpen(false)}
        subtitle="Ficha Técnica de Producción"
        title={selectedProduction?.productionLot}
        size="md"
      >
        {selectedProduction && (
          <div className="space-y-6">
            {/* Desglose de Productos */}
            <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Productos Terminados Fabricados
                    </h4>
                    <span className="text-[10px] font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded border border-blue-200">
                      {getProductDetailsList(selectedProduction).length} producto(s)
                    </span>
                  </div>

                  <div className="space-y-2">
                    {getProductDetailsList(selectedProduction).map((det) => (
                      <div
                        key={det.id}
                        className="bg-blue-50/70 border border-blue-200 p-3 rounded-xl flex items-center justify-between"
                      >
                        <div>
                          <p className="text-xs font-bold text-slate-900">
                            {det.product?.name}
                          </p>
                          <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                            Dimensiones: {det.product?.dimensions}
                          </p>
                        </div>
                        <span className="px-2.5 py-1 bg-[#1D71CB] text-white rounded-lg text-xs font-bold font-mono">
                          {det.quantityProduced.toLocaleString('es-NI')} pcs
                        </span>
                      </div>
                    ))}
                  </div>

                  {getProductDetailsList(selectedProduction).length > 1 && (
                    <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-600">Total Jornada:</span>
                      <span className="font-bold text-slate-900 text-sm font-mono">
                        {getProductDetailsList(selectedProduction)
                          .reduce((sum, d) => sum + d.quantityProduced, 0)
                          .toLocaleString('es-NI')}{' '}
                        piezas
                      </span>
                    </div>
                  )}
                </div>

                {/* Detalles de Operación */}
                <div className="space-y-3 pt-4 border-t border-slate-100">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Detalles de la Jornada
                  </h4>
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-slate-400">Fecha de Producción:</span>
                      <p className="font-semibold text-slate-800 mt-0.5">
                        {formatDate(selectedProduction.productionDate)}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {formatDateLong(selectedProduction.productionDate)}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-400">Semana ISO:</span>
                      <p className="font-mono font-semibold text-slate-800 mt-0.5">
                        W{String(selectedProduction.isoWeek).padStart(2, '0')} / {selectedProduction.isoYear}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Materia prima vinculada (Trazabilidad M:N) */}
                <div className="space-y-3 pt-4 border-t border-slate-100">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Lotes de Patio Consumidos (Trazabilidad M:N)
                  </h4>
                  {selectedProduction.linkedWoodReceipts && selectedProduction.linkedWoodReceipts.length > 0 ? (
                    <div className="space-y-2">
                      {selectedProduction.linkedWoodReceipts.map((item, idx) => (
                        <div
                          key={idx}
                          className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs flex items-center justify-between"
                        >
                          <div>
                            <span className="font-mono font-bold text-slate-800">
                              {item.lotNumber}
                            </span>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {item.supplier?.name || 'Proveedor no especificado'}
                            </p>
                          </div>
                          <span className="font-semibold text-slate-700">
                            {Number(item.quantity).toLocaleString()} {item.unit === 'PIE_TABLAR' ? 'pt' : 'pcs'}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">
                      No se asociaron lotes de madera de patio referenciales a esta orden.
                    </p>
                  )}
                </div>

                {/* Auditoría */}
                <div className="space-y-2 pt-4 border-t border-slate-100 text-xs">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Auditoría Técnica
                  </h4>
                  <p className="text-slate-500">
                    Registrado por:{' '}
                    <strong className="text-slate-700">
                      {selectedProduction.createdBy?.fullName || 'Sistema'}
                    </strong>
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Creado el: {formatDateTime(selectedProduction.createdAt).full}
                  </p>
                  <div className="p-2.5 rounded bg-slate-100 text-[11px] text-slate-600 border border-slate-200 mt-2">
                    🔒 Registro inmutable con incremento de stock validado en el Ledger (RN-010).
                  </div>
                </div>
          </div>
        )}
      </Drawer>

      {/* Modal de Registro de Producción Multiproducto */}
      <Dialog
        isOpen={isCreateModalOpen}
        onClose={() => !isSubmitting && setIsCreateModalOpen(false)}
        size="lg"
        headerVariant="industrial"
        subtitle="Operación M04 — Planta de Aserrío"
        title="Registrar Producción Diaria de Polines"
      >
        <form onSubmit={handleSubmitCreate} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Lote de Producción (READONLY) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1 flex items-center justify-between">
                  <span>Lote Oficial de Producción</span>
                  <span className="text-[10px] font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded border border-blue-200">
                    READONLY — Determinístico
                  </span>
                </label>
                <div className="w-full text-sm bg-slate-100 border border-slate-300 rounded-lg p-2.5 text-slate-800 font-mono font-bold flex items-center justify-between">
                  <span>[ {currentPreviewLot} ]</span>
                  <span className="text-xs font-sans font-normal text-slate-500">
                    Semana ISO W{String(currentPreviewWeek).padStart(2, '0')}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  El servidor calcula automáticamente la semana ISO 8601 y asigna el identificador canónico único por día (<strong>LT-DDMMYY-WXX</strong>).
                </p>
              </div>

              {/* Fecha de Producción */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Fecha de la Jornada de Producción *
                </label>
                <input
                  type="date"
                  max={new Date().toISOString().split('T')[0]}
                  value={formProductionDate}
                  onChange={(e) => setFormProductionDate(e.target.value)}
                  className="w-full text-sm bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  required
                />
              </div>

              {/* Productos Fabricados en la Jornada (Multiproducto) */}
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700 uppercase">
                    Productos Terminados Fabricados *
                  </label>
                  <button
                    type="button"
                    onClick={handleAddProductRow}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 hover:underline"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Agregar otro producto</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {formProducts.map((row, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
                    >
                      <div className="flex-1">
                        <select
                          value={row.productId}
                          onChange={(e) => handleUpdateProductRow(idx, 'productId', e.target.value)}
                          className="w-full text-sm bg-white border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                          required
                        >
                          <option value="">-- Seleccionar Polín --</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} — {p.dimensions}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="w-full sm:w-36">
                        <input
                          type="number"
                          step="1"
                          min="1"
                          placeholder="Cantidad pcs"
                          value={row.quantity}
                          onChange={(e) => handleUpdateProductRow(idx, 'quantity', e.target.value)}
                          className="w-full text-sm bg-white border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
                          required
                        />
                      </div>

                      {formProducts.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveProductRow(idx)}
                          className="text-slate-400 hover:text-rose-600 p-2 rounded-lg hover:bg-rose-50 transition shrink-0 self-end sm:self-auto"
                          title="Eliminar producto"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="p-2.5 rounded-lg bg-blue-50/60 border border-blue-200 flex items-center justify-between text-xs">
                  <span className="text-blue-900 font-medium">
                    Total piezas a producir en la jornada:
                  </span>
                  <span className="font-bold text-[#1D71CB] text-sm font-mono">
                    {totalFormPieces.toLocaleString('es-NI')} pcs
                  </span>
                </div>
              </div>

              {/* Lotes de Patio Origen (Opcional M:N) */}
              <div className="pt-2 border-t border-slate-200">
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1 flex items-center justify-between">
                  <span>Lotes de Madera de Patio Origen (Trazabilidad M:N)</span>
                  <span className="text-[10px] text-slate-400 font-normal">Opcional</span>
                </label>
                <div className="max-h-36 overflow-y-auto border border-slate-300 rounded-lg p-2 space-y-1.5 bg-slate-50">
                  {woodReceiptOptions.length === 0 ? (
                    <p className="text-xs text-slate-400 italic p-1">
                      No hay lotes de materia prima disponibles para vincular.
                    </p>
                  ) : (
                    woodReceiptOptions.map((opt) => (
                      <label
                        key={opt.id}
                        className="flex items-center gap-2 p-1.5 rounded hover:bg-white cursor-pointer text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={formWoodReceiptIds.includes(opt.id)}
                          onChange={() => toggleWoodReceiptSelection(opt.id)}
                          className="rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span className="font-mono font-semibold text-slate-800">
                          {opt.lotNumber}
                        </span>
                        <span className="text-slate-500">
                          ({opt.supplier.name} • {opt.woodType.name})
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-sm font-semibold bg-[#1D71CB] hover:bg-[#165ba3] text-white rounded-lg shadow transition disabled:opacity-50 flex items-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <span className="animate-spin text-xs">⏳</span>
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <span>Guardar Producción</span>
                  )}
                </button>
              </div>
            </form>
      </Dialog>
    </div>
  );
}
