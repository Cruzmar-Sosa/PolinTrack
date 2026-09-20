'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Dialog, Badge, Button, Skeleton } from '@/components/ui';
import {
  Layers,
  Calendar,
  User,
  Info,
  AlertCircle,
  CheckCircle2,
  Package,
} from 'lucide-react';

export interface ProductCatalogItem {
  id: string;
  name: string;
  dimensions: string;
  isActive?: boolean;
}

export interface InitialInventoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (lotCreated: string, totalPieces: number) => void;
  initialProducts?: ProductCatalogItem[];
}

// Client-side helper to preview Initial Inventory lot format (INV-INI-DDMMYY-XX)
function calculateInitialLotPreview(dateStr: string): string {
  if (!dateStr) return 'INV-INI-DDMMYY-XX';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return 'INV-INI-DDMMYY-XX';
  const shortYear = parts[0].slice(2);
  return `INV-INI-${parts[2]}${parts[1]}${shortYear}-XX`;
}

export function InitialInventoryModal({
  isOpen,
  onClose,
  onSuccess,
  initialProducts,
}: InitialInventoryModalProps) {
  const { user, session } = useAuth();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [productionDate, setProductionDate] = useState(todayStr);
  const [products, setProducts] = useState<ProductCatalogItem[]>(initialProducts || []);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Dynamic preview lot string
  const previewLot = useMemo(() => {
    return calculateInitialLotPreview(productionDate);
  }, [productionDate]);

  // Load catalog products if not provided
  useEffect(() => {
    if (!isOpen) return;

    setProductionDate(new Date().toISOString().split('T')[0]);
    setErrorMessage(null);

    if (initialProducts && initialProducts.length > 0) {
      setProducts(initialProducts);
      const resetMap: Record<string, string> = {};
      initialProducts.forEach((p) => {
        resetMap[p.id] = '';
      });
      setQuantities(resetMap);
      return;
    }

    const fetchProducts = async () => {
      try {
        setIsLoadingProducts(true);
        const headers: Record<string, string> = {};
        if (session?.access_token) {
          headers.Authorization = `Bearer ${session.access_token}`;
        }
        const res = await fetch(`${apiUrl}/catalog/products?includeInactive=false`, { headers });
        if (!res.ok) {
          throw new Error('No se pudo consultar el catálogo de productos');
        }
        const json = await res.json();
        const activeList: ProductCatalogItem[] = json.data || [];
        setProducts(activeList);
        const resetMap: Record<string, string> = {};
        activeList.forEach((p) => {
          resetMap[p.id] = '';
        });
        setQuantities(resetMap);
      } catch (err: any) {
        setErrorMessage(err.message || 'Error al cargar productos del catálogo');
      } finally {
        setIsLoadingProducts(false);
      }
    };

    fetchProducts();
  }, [isOpen, initialProducts, session?.access_token, apiUrl]);

  // Sum of all entered pieces
  const totalPieces = useMemo(() => {
    return Object.values(quantities).reduce((sum, val) => {
      const q = parseInt(val, 10);
      return sum + (isNaN(q) || q <= 0 ? 0 : q);
    }, 0);
  }, [quantities]);

  // Active products with quantity > 0
  const validItems = useMemo(() => {
    return Object.entries(quantities)
      .map(([productId, val]) => ({
        productId,
        quantityProduced: parseInt(val, 10),
      }))
      .filter((item) => !isNaN(item.quantityProduced) && item.quantityProduced > 0);
  }, [quantities]);

  const handleQuantityChange = (productId: string, val: string) => {
    // Only allow positive integers or empty string
    if (val !== '' && (!/^\d+$/.test(val) || parseInt(val, 10) < 0)) {
      return;
    }
    setQuantities((prev) => ({
      ...prev,
      [productId]: val,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (productionDate > todayStr) {
      setErrorMessage('La fecha de registro no puede ser posterior al día de hoy.');
      return;
    }

    if (validItems.length === 0 || totalPieces <= 0) {
      setErrorMessage('Debe ingresar una cantidad mayor a cero al menos para un producto.');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload = {
        productionDate,
        isInitialInventory: true,
        products: validItems,
        details: validItems,
      };

      const res = await fetch(`${apiUrl}/daily-productions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || 'Error al registrar el inventario inicial en el sistema.');
      }

      const lotCreated = json.data?.productionLot || previewLot;
      onSuccess(lotCreated, totalPieces);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error inesperado al guardar el inventario inicial.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={() => !isSubmitting && onClose()}
      size="xl"
      headerVariant="industrial"
      subtitle="M04 / M10 — Línea Base Operativa"
      title="Registro de Inventario Inicial Físico"
    >
      <form onSubmit={handleSubmit} className="p-6 space-y-4 max-w-4xl mx-auto overflow-hidden">
        {errorMessage && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2.5 shadow-xs">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-medium">{errorMessage}</span>
          </div>
        )}

        {/* Fila 1: Encabezado Operativo (Fecha, Responsable, Vista Previa Lote) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>Fecha de Registro *</span>
            </label>
            <input
              type="date"
              max={todayStr}
              value={productionDate}
              onChange={(e) => setProductionDate(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:bg-white focus:ring-2 focus:ring-purple-500 focus:outline-none transition font-medium"
              required
            />
            <p className="text-[10px] text-slate-400 mt-1">Corte físico al día de hoy</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <span>Responsable / Supervisor</span>
            </label>
            <div className="w-full text-xs bg-slate-100 border border-slate-300 rounded-lg p-2.5 text-slate-700 flex items-center gap-2 truncate">
              <span className="font-semibold truncate">
                {user?.fullName || user?.email || 'Usuario Actual'}
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-200 text-slate-600 font-mono shrink-0">
                {user?.role || 'AUTH'}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Autenticado en el sistema</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-purple-600" />
                <span>Lote Oficial</span>
              </span>
              <span className="text-[9px] font-semibold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded">
                DETERMINÍSTICO
              </span>
            </label>
            <div className="w-full text-xs bg-purple-50/70 border border-purple-200 rounded-lg p-2.5 text-purple-900 font-mono font-bold flex items-center justify-between">
              <span>[ {previewLot} ]</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Prefijo canónico INV-INI-</p>
          </div>
        </div>

        {/* Fila 2: Banner Informativo */}
        <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs flex items-start gap-2.5 shadow-xs">
          <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-bold">Línea Base de Existencias Operativas</p>
            <p className="text-blue-800 text-[11px] leading-relaxed">
              El Inventario Inicial establece la línea base de existencias operativas. Esta acción no requiere materia prima ni guías forestales de origen. Los saldos ingresarán de forma inmutable al Kardex bajo el tipo <strong>INITIAL_INVENTORY</strong> con un lote oficial habilitado para despachos y fumigaciones.
            </p>
          </div>
        </div>

        {/* Fila 3: Cuadrícula de Carga Rápida (El Core) */}
        <div className="space-y-2 pt-1 border-t border-slate-200">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-bold text-slate-700 uppercase flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-slate-400" />
              <span>Productos Activos del Catálogo ({products.length})</span>
            </label>
            <span className="text-[11px] text-slate-500">
              Solo ingrese cantidades en los productos con existencia física (los vacíos se ignoran)
            </span>
          </div>

          <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white shadow-xs">
            {isLoadingProducts ? (
              <div className="p-4 space-y-3">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : products.length === 0 ? (
              <p className="text-xs text-slate-400 italic p-6 text-center">
                No se encontraron productos terminados activos en el catálogo maestro.
              </p>
            ) : (
              products.map((p) => {
                const currentVal = quantities[p.id] || '';
                const hasValue = parseInt(currentVal, 10) > 0;

                return (
                  <div
                    key={p.id}
                    className={`p-3 px-4 flex items-center justify-between gap-4 transition-colors ${
                      hasValue ? 'bg-purple-50/40' : 'hover:bg-slate-50/70'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 truncate">
                          {p.name}
                        </span>
                        <Badge variant="neutral" size="sm">
                          {p.dimensions}
                        </Badge>
                      </div>
                    </div>

                    <div className="w-40 flex items-center gap-2 shrink-0">
                      <input
                        type="number"
                        step="1"
                        min="0"
                        placeholder="0"
                        value={currentVal}
                        onChange={(e) => handleQuantityChange(p.id, e.target.value)}
                        className="w-full text-right text-xs bg-slate-50 border border-slate-300 rounded-lg p-2 focus:bg-white focus:ring-2 focus:ring-purple-500 focus:outline-none font-mono font-bold text-slate-900 transition"
                      />
                      <span className="text-xs font-medium text-slate-500 w-8">pcs</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Resumen dinámico en vivo */}
          <div className="p-3.5 rounded-xl bg-purple-50 border border-purple-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs shadow-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-purple-600 inline-block animate-pulse" />
              <span className="text-purple-900 font-semibold">
                Total piezas iniciales a inyectar al Kardex:
              </span>
            </div>
            <div className="font-mono text-sm font-bold text-purple-900">
              {totalPieces.toLocaleString('es-NI')}{' '}
              <span className="text-xs font-sans font-normal text-purple-700">
                piezas ({validItems.length} producto{validItems.length !== 1 ? 's' : ''})
              </span>
            </div>
          </div>
        </div>

        {/* Footer / Acciones */}
        <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
          >
            Cancelar
          </button>

          <Button
            type="submit"
            disabled={isSubmitting || totalPieces <= 0}
            className="bg-purple-700 hover:bg-purple-800 text-white font-semibold text-xs px-5 py-2 rounded-lg shadow-sm transition flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <span className="animate-spin text-xs">⏳</span>
                <span>Inyectando Saldos...</span>
              </>
            ) : (
              <>
                <Layers className="w-3.5 h-3.5" />
                <span>Cargar Inventario Inicial ({totalPieces.toLocaleString('es-NI')} pcs)</span>
              </>
            )}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
