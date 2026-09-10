'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import {
  PageTitle,
  MutedText,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Button,
  Select,
  Input,
  Textarea,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableLoading,
  TableEmpty,
  Dialog,
  Alert,
  AccessDenied,
  TablePagination,
} from '@/components/ui';
import {
  SlidersHorizontal,
  ShieldCheck,
  Plus,
  RefreshCw,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Eye,
  ArrowUpRight,
  ArrowDownLeft,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Boxes,
} from 'lucide-react';
import { formatDateTime, formatDateLong } from '@/lib/date-formatters';

interface ProductStock {
  productId: string;
  productName: string;
  dimensions: string;
  availableStock: number;
}

interface InventoryAdjustment {
  id: string;
  productId: string;
  adjustmentType: 'INCREMENT' | 'DECREMENT';
  quantity: number;
  previousStock: number;
  newStock: number;
  reasonType: 'ERROR_INGRESO' | 'CUSTOM';
  reasonNotes?: string | null;
  executedById: string;
  executedAt: string;
  product?: {
    id: string;
    name: string;
    dimensions: string;
  };
  executedBy?: {
    id: string;
    fullName: string;
    email: string;
  };
}

interface AdjustmentsMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export default function InventoryAdjustmentsPage() {
  const { user, role, session, isLoading: isAuthLoading } = useAuth();
  const token = session?.access_token;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

  // Strict RBAC Guard (RN-004): Exclusive to ADMIN
  const isAuthorized = role === 'ADMIN';

  // Data States
  const [adjustments, setAdjustments] = useState<InventoryAdjustment[]>([]);
  const [products, setProducts] = useState<ProductStock[]>([]);
  const [pageSize, setPageSize] = useState<number>(10);
  const [meta, setMeta] = useState<AdjustmentsMeta>({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 1,
  });
  const [isLoadingList, setIsLoadingList] = useState<boolean>(true);
  const [listError, setListError] = useState<string | null>(null);

  // Filter States
  const [filterProduct, setFilterProduct] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  const [filterReason, setFilterReason] = useState<string>('');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');

  // Modal / Form States
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [formProduct, setFormProduct] = useState<string>('');
  const [formType, setFormType] = useState<'INCREMENT' | 'DECREMENT'>('INCREMENT');
  const [formQuantity, setFormQuantity] = useState<string>('');
  const [formReasonType, setFormReasonType] = useState<'ERROR_INGRESO' | 'CUSTOM'>('ERROR_INGRESO');
  const [formReasonNotes, setFormReasonNotes] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Detail Drawer State
  const [selectedAdjustment, setSelectedAdjustment] = useState<InventoryAdjustment | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState<boolean>(false);

  // --------------------------------------------------------------------------
  // 1. Fetch Products & Stock (EP-INV-01)
  // --------------------------------------------------------------------------
  const fetchProducts = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${apiUrl}/inventory`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setProducts(json.data);
        }
      }
    } catch {
      // Non-blocking
    }
  }, [apiUrl, token]);

  // --------------------------------------------------------------------------
  // 2. Fetch Adjustments History (EP-ADJ-02)
  // --------------------------------------------------------------------------
  const fetchAdjustments = useCallback(
    async (page: number = 1, size: number = pageSize) => {
      if (!token) return;
      setIsLoadingList(true);
      setListError(null);
      try {
        const queryParams = new URLSearchParams();
        queryParams.append('page', page.toString());
        queryParams.append('limit', size.toString());

        if (filterProduct) queryParams.append('productId', filterProduct);
        if (filterType) queryParams.append('adjustmentType', filterType);
        if (filterReason) queryParams.append('reasonType', filterReason);
        if (filterStartDate) queryParams.append('startDate', filterStartDate);
        if (filterEndDate) queryParams.append('endDate', filterEndDate);

        const res = await fetch(`${apiUrl}/inventory-adjustments?${queryParams.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error(`Error al consultar historial de ajustes: HTTP ${res.status}`);
        }
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setAdjustments(json.data);
          if (json.meta) {
            setMeta(json.meta);
          }
        } else {
          setAdjustments([]);
        }
      } catch (err: any) {
        setListError(err.message || 'Error de conexión con el servidor de ajustes');
      } finally {
        setIsLoadingList(false);
      }
    },
    [apiUrl, token, filterProduct, filterType, filterReason, filterStartDate, filterEndDate, pageSize]
  );

  useEffect(() => {
    if (isAuthorized) {
      fetchProducts();
      fetchAdjustments(1);
    }
  }, [isAuthorized, fetchProducts, fetchAdjustments]);

  // Handle Clear Filters
  const handleClearFilters = () => {
    setFilterProduct('');
    setFilterType('');
    setFilterReason('');
    setFilterStartDate('');
    setFilterEndDate('');
  };

  // Open Create Modal
  const handleOpenModal = () => {
    setFormProduct(products[0]?.productId || '');
    setFormType('INCREMENT');
    setFormQuantity('');
    setFormReasonType('ERROR_INGRESO');
    setFormReasonNotes('');
    setFormError(null);
    setIsModalOpen(true);
  };

  // --------------------------------------------------------------------------
  // 3. Dynamic Photographic Balance Calculations (TSK-ADJ-DELTA)
  // --------------------------------------------------------------------------
  const selectedProductStock = products.find((p) => p.productId === formProduct);
  const currentStock = selectedProductStock?.availableStock ?? 0;

  // Manejo de cambio en la cantidad con soporte de negativos y sincronización inteligente
  const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    // Permitir vacío, signo negativo aislado, signo positivo aislado o dígitos con signo opcional
    if (val === '' || val === '-' || val === '+' || /^[+-]?\d*$/.test(val)) {
      setFormQuantity(val);
      if (val.startsWith('-')) {
        setFormType('DECREMENT');
      } else if (val.startsWith('+')) {
        setFormType('INCREMENT');
      }
    }
  };

  const handleTypeChange = (newType: 'INCREMENT' | 'DECREMENT') => {
    setFormType(newType);
    // Sincronización bidireccional al conmutar manualmente
    if (newType === 'INCREMENT' && formQuantity.startsWith('-')) {
      setFormQuantity(formQuantity.replace(/^-/, ''));
    } else if (newType === 'DECREMENT' && formQuantity.startsWith('+')) {
      setFormQuantity(formQuantity.replace(/^\+/, ''));
    }
  };

  // Cálculo de delta y stock proyectado (evitando doble negación)
  const cleanDigits = formQuantity.replace(/^[+-]/, '');
  const parsedAbsQty = parseInt(cleanDigits, 10) || 0;
  const isDecrement = formType === 'DECREMENT';
  const delta = isDecrement ? -parsedAbsQty : parsedAbsQty;
  const projectedStock = currentStock + delta;
  const isNegativeStock = projectedStock < 0;
  const isZeroStock = projectedStock === 0 && delta !== 0;

  // --------------------------------------------------------------------------
  // 4. Submit Adjustment (EP-ADJ-01)
  // --------------------------------------------------------------------------
  const handleSubmitAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setFormError(null);

    // Client-side validations
    if (!formProduct) {
      setFormError('Debe seleccionar un producto del catálogo.');
      return;
    }

    if (!parsedAbsQty || parsedAbsQty <= 0) {
      setFormError('La cantidad del ajuste debe ser un número entero distinto de cero.');
      return;
    }

    if (isNegativeStock) {
      setFormError(
        `Operación inválida: El decremento (${parsedAbsQty} pcs) excede el saldo en patio (${currentStock} pcs). El stock resultante no puede ser negativo (FA-02).`
      );
      return;
    }

    if (formReasonType === 'CUSTOM') {
      if (!formReasonNotes || formReasonNotes.trim().length < 10) {
        setFormError('Para ajustes con motivo personalizado, debe incluir una justificación técnica de al menos 10 caracteres.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const payload = {
        productId: formProduct,
        adjustmentType: formType,
        quantity: delta, // Enviamos el delta firmado directamente (ej: -50 o +50)
        reasonType: formReasonType,
        reasonNotes: formReasonNotes.trim() || undefined,
      };

      const res = await fetch(`${apiUrl}/inventory-adjustments`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || `Error al registrar ajuste: HTTP ${res.status}`);
      }

      // Success
      setIsModalOpen(false);
      setSuccessToast(
        `Ajuste de inventario registrado exitosamente: ${selectedProductStock?.productName} (${delta > 0 ? `+${delta}` : delta} pcs). Nuevo stock: ${projectedStock} pcs.`
      );
      setTimeout(() => setSuccessToast(null), 8000);

      // Refresh data
      fetchProducts();
      fetchAdjustments(1);
    } catch (err: any) {
      setFormError(err.message || 'Error inesperado al registrar el ajuste');
    } finally {
      setIsSubmitting(false);
    }
  };

  // View Detail Drawer
  const handleOpenDetail = (adj: InventoryAdjustment) => {
    setSelectedAdjustment(adj);
    setIsDetailOpen(true);
  };

  // Guard Render for Non-Admin
  if (!isAuthLoading && !isAuthorized) {
    return (
      <AccessDenied
        moduleName="Ajustes de Inventario"
        userRole={role}
        ruleCode="RN-004"
        description="El registro y consulta de rectificaciones de stock es exclusivo para Administradores (ADMIN). Su rol operativo actual no tiene permisos para este módulo. La sesión permanece activa."
      />
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/inventory"
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Volver a Existencias & Kardex</span>
            </Link>
          </div>
          <PageTitle>Ajustes de Stock Autorizados</PageTitle>
          <MutedText>
            Rectificación administrativa inmutable de existencias con balance fotográfico y auditoría (RN-004A, D-028).
          </MutedText>
        </div>

        <div className="flex items-center gap-3">
          <Badge variant="destructive">
            <ShieldCheck className="w-3.5 h-3.5 mr-1 inline" />
            ADMIN Only
          </Badge>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              fetchProducts();
              fetchAdjustments(meta.page);
            }}
            disabled={isLoadingList}
            className="flex items-center gap-2 text-slate-700 bg-white shadow-xs"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingList ? 'animate-spin text-blue-600' : ''}`} />
            <span>Actualizar</span>
          </Button>

          <Button
            size="sm"
            onClick={handleOpenModal}
            className="bg-red-600 hover:bg-red-700 text-white shadow-xs flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Ajuste</span>
          </Button>
        </div>
      </div>

      {/* SUCCESS TOAST */}
      {successToast && (
        <Alert variant="success" className="border-emerald-300 bg-emerald-50 text-emerald-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="text-xs font-medium">{successToast}</span>
          </div>
          <button onClick={() => setSuccessToast(null)} className="text-emerald-700 hover:text-emerald-900 text-xs">
            ✕
          </button>
        </Alert>
      )}

      {/* FILTERS BAR */}
      <Card className="shadow-xs border-slate-200 bg-slate-50/50">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
            {/* Product */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Producto</label>
              <Select value={filterProduct} onChange={(e) => setFilterProduct(e.target.value)}>
                <option value="">Todos los productos</option>
                {products.map((p) => (
                  <option key={p.productId} value={p.productId}>
                    {p.productName} ({p.dimensions})
                  </option>
                ))}
              </Select>
            </div>

            {/* Adjustment Type */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo Ajuste</label>
              <Select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                <option value="">Todos los tipos</option>
                <option value="INCREMENT">INCREMENTO (+)</option>
                <option value="DECREMENT">DECREMENTO (-)</option>
              </Select>
            </div>

            {/* Reason */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Motivo</label>
              <Select value={filterReason} onChange={(e) => setFilterReason(e.target.value)}>
                <option value="">Todos los motivos</option>
                <option value="ERROR_INGRESO">Error de Ingreso</option>
                <option value="CUSTOM">Personalizado</option>
              </Select>
            </div>

            {/* Start Date */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Desde</label>
              <Input type="date" value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)} />
            </div>

            {/* End Date */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Hasta</label>
              <Input type="date" value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)} />
            </div>

            {/* Clear Button */}
            <div>
              <Button
                variant="outline"
                size="md"
                onClick={handleClearFilters}
                className="w-full text-slate-600 bg-white"
              >
                <XCircle className="w-4 h-4 mr-1 text-slate-400" />
                <span>Limpiar</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ADJUSTMENTS TABLE */}
      <Card className="shadow-xs border-slate-200">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base text-slate-900 flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-red-600" />
              <span>Historial Inmutable de Ajustes Físicos</span>
            </CardTitle>
            <MutedText>
              Fotografía técnica de saldos previos y resultantes preservados asíncronamente en audit_logs.
            </MutedText>
          </div>
          <Badge variant="neutral">Inmutable (Sin mutaciones)</Badge>
        </CardHeader>
        <CardContent className="p-0">
          {listError && (
            <div className="p-4">
              <Alert variant="destructive">{listError}</Alert>
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[170px]">Fecha / Hora</TableHead>
                <TableHead>Producto Afectado</TableHead>
                <TableHead className="w-[140px]">Tipo</TableHead>
                <TableHead className="text-right w-[110px]">Cantidad</TableHead>
                <TableHead className="text-center w-[170px]">Balance Fotográfico</TableHead>
                <TableHead className="w-[140px]">Motivo</TableHead>
                <TableHead>Ejecutado Por</TableHead>
                <TableHead className="text-right w-[90px]">Detalle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingList ? (
                <TableLoading colSpan={8} message="Consultando historial fotográfico de ajustes..." />
              ) : adjustments.length === 0 ? (
                <TableEmpty
                  colSpan={8}
                  title="Sin ajustes de inventario"
                  message="No se han registrado rectificaciones físicas para los criterios seleccionados."
                />
              ) : (
                adjustments.map((adj) => {
                  const dt = formatDateTime(adj.executedAt);
                  const isInc = adj.adjustmentType === 'INCREMENT';

                  return (
                    <TableRow key={adj.id} className="hover:bg-slate-50/70 transition-colors">
                      <TableCell className="font-mono text-xs text-slate-600">{dt.full}</TableCell>
                      <TableCell className="font-semibold text-slate-900 text-xs">
                        {adj.product ? (
                          <span>
                            {adj.product.name}{' '}
                            <span className="font-mono text-slate-500 font-normal">
                              ({adj.product.dimensions})
                            </span>
                          </span>
                        ) : (
                          <span className="font-mono text-slate-400 text-xs">{adj.productId}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {isInc ? (
                          <Badge variant="success">
                            <ArrowDownLeft className="w-3 h-3 mr-1 inline" />
                            INCREMENTO
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            <ArrowUpRight className="w-3 h-3 mr-1 inline" />
                            DECREMENTO
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-xs tabular-nums">
                        <span className={isInc ? 'text-emerald-700' : 'text-rose-700'}>
                          {isInc ? `+${adj.quantity}` : `-${adj.quantity}`} pcs
                        </span>
                      </TableCell>
                      <TableCell className="text-center font-mono text-xs tabular-nums">
                        <span className="text-slate-500">{adj.previousStock}</span>
                        <span className="text-slate-400 mx-1.5">→</span>
                        <span className="font-bold text-slate-900">{adj.newStock} pcs</span>
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                          {adj.reasonType === 'ERROR_INGRESO' ? 'Error Ingreso' : 'Personalizado'}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">
                        {adj.executedBy?.fullName || 'Administrador'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenDetail(adj)}
                          className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 p-1 h-auto"
                          title="Ver Ficha Técnica del Ajuste"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          {/* PAGINATION */}
          {meta.total > 0 && (
            <TablePagination
              currentPage={meta.page}
              totalPages={meta.totalPages}
              totalRecords={meta.total}
              pageSize={pageSize}
              onPageChange={(newPage) => {
                fetchAdjustments(newPage, pageSize);
              }}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize);
                fetchAdjustments(1, newSize);
              }}
              isLoading={isLoadingList}
            />
          )}
        </CardContent>
      </Card>

      {/* ==================================================================== */}
      {/* MODAL: REGISTRAR AJUSTE DE INVENTARIO                                */}
      {/* ==================================================================== */}
      <Dialog
        isOpen={isModalOpen}
        onClose={() => !isSubmitting && setIsModalOpen(false)}
        title="Registrar Ajuste Autorizado de Inventario"
        description="Rectificación física de existencias en patio. Exclusivo para Administrador (RN-004A, D-028)."
        size="lg"
      >
        <form onSubmit={handleSubmitAdjustment} className="flex flex-col">
          {/* Cuerpo del Formulario con respiro perimetral */}
          <div className="px-6 sm:px-8 py-6 space-y-6 max-h-[75vh] overflow-y-auto pr-4 sm:pr-6">
            {formError && <Alert variant="destructive">{formError}</Alert>}

            {/* Product Select */}
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-600">
                Producto a Rectificar <span className="text-red-500">*</span>
              </label>
              <Select
                value={formProduct}
                onChange={(e) => setFormProduct(e.target.value)}
                required
                disabled={isSubmitting}
              >
                {products.map((p) => (
                  <option key={p.productId} value={p.productId}>
                    {p.productName} ({p.dimensions}) — Stock Actual: {p.availableStock} pcs
                  </option>
                ))}
              </Select>
            </div>

            {/* Adjustment Type & Quantity Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Tipo de Ajuste <span className="text-red-500">*</span>
                </label>
                <Select
                  value={formType}
                  onChange={(e) => handleTypeChange(e.target.value as any)}
                  required
                  disabled={isSubmitting}
                >
                  <option value="INCREMENT">INCREMENTO (+) — Entrada a Patio</option>
                  <option value="DECREMENT">DECREMENTO (-) — Salida por Daño/Descarte</option>
                </Select>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Cantidad a Ajustar (pcs) <span className="text-red-500">*</span>
                </label>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="Ej: 50, -50 o +50"
                  value={formQuantity}
                  onChange={handleQuantityChange}
                  required
                  disabled={isSubmitting}
                  className="font-mono tabular-nums text-right text-sm min-h-[40px]"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Puede ingresar valores negativos directamente (ej. <span className="font-mono font-bold">-50</span> para descontar o <span className="font-mono font-bold">+50</span> para sumar).
                </p>
              </div>
            </div>

            {/* LIVE PHOTOGRAPHIC BALANCE PREVIEW (TSK-ADJ-DELTA / TSK-UI-POLISH) */}
            <div className="p-5 rounded-xl border border-slate-200 bg-slate-50/70 my-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Boxes className="w-4 h-4 text-blue-600" />
                  Fotografía Técnica del Balance
                </span>
                <span className="text-[11px] font-mono text-slate-500 font-semibold">RN-004A Inmutable</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-right">
                {/* Caja 1: Stock Actual */}
                <div className="p-4 sm:p-5 bg-white rounded-xl border border-slate-200 shadow-2xs">
                  <p className="text-[11px] text-slate-500 uppercase font-semibold">Stock Previo</p>
                  <p className="text-xl font-black font-mono tabular-nums text-slate-800 mt-1">
                    {currentStock} pcs
                  </p>
                </div>

                {/* Caja 2: Ajuste (Delta) */}
                <div className="p-4 sm:p-5 bg-white rounded-xl border border-slate-200 shadow-2xs">
                  <p className="text-[11px] text-slate-500 uppercase font-semibold">Ajuste (Δ)</p>
                  <p
                    className={`text-xl font-black font-mono tabular-nums mt-1 ${
                      delta < 0 ? 'text-rose-700' : delta > 0 ? 'text-emerald-700' : 'text-slate-500'
                    }`}
                  >
                    {delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : '0'} pcs
                  </p>
                </div>

                {/* Caja 3: Stock Proyectado */}
                <div
                  className={`p-4 sm:p-5 rounded-xl border shadow-2xs transition-colors ${
                    isNegativeStock
                      ? 'bg-red-50 border-red-300 text-red-700 font-mono font-bold'
                      : isZeroStock
                      ? 'bg-amber-50 border-amber-300 text-amber-900 font-mono font-bold'
                      : 'bg-slate-50 border-slate-200 text-slate-900 font-mono font-bold'
                  }`}
                >
                  <p className="text-[11px] uppercase font-semibold">Stock Proyectado</p>
                  <p className="text-xl font-black font-mono tabular-nums mt-1">
                    {projectedStock} pcs
                  </p>
                  {isZeroStock && (
                    <p className="text-[10px] text-amber-700 font-bold mt-1 font-sans">
                      El patio quedará en cero existencias
                    </p>
                  )}
                </div>
              </div>

              {/* Negative stock alert */}
              {isNegativeStock && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-sans">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>
                    <strong>Operación inválida:</strong> El decremento ({parsedAbsQty} pcs) excede el saldo en patio ({currentStock} pcs).
                  </span>
                </div>
              )}
            </div>

            {/* Reason Type */}
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-600">
                Motivo Técnico del Ajuste <span className="text-red-500">*</span>
              </label>
              <Select
                value={formReasonType}
                onChange={(e) => setFormReasonType(e.target.value as any)}
                required
                disabled={isSubmitting}
              >
                <option value="ERROR_INGRESO">ERROR_INGRESO — Corrección por conteo físico en patio</option>
                <option value="CUSTOM">CUSTOM — Motivo técnico personalizado / Daño biológico / Descarte</option>
              </Select>
            </div>

            {/* Reason Notes */}
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-600">
                Justificación / Observaciones {formReasonType === 'CUSTOM' && <span className="text-red-500">* (Mínimo 10 caracteres)</span>}
              </label>
              <Textarea
                rows={3}
                placeholder={
                  formReasonType === 'CUSTOM'
                    ? 'Especifique detalladamente la justificación técnica de la variación física...'
                    : 'Detalles adicionales sobre el conteo o diferencia detectada (opcional)...'
                }
                value={formReasonNotes}
                onChange={(e) => setFormReasonNotes(e.target.value)}
                required={formReasonType === 'CUSTOM'}
                disabled={isSubmitting}
              />
              {formReasonType === 'CUSTOM' && (
                <p className="text-[11px] text-slate-500 mt-1">
                  Caracteres: {formReasonNotes.trim().length} / 10 requeridos
                </p>
              )}
            </div>
          </div>

          {/* Modal Actions Footer */}
          <div className="px-6 sm:px-8 py-4 bg-slate-50/80 border-t border-slate-100 flex flex-col-reverse sm:flex-row justify-end items-center gap-3 shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsModalOpen(false)}
              disabled={isSubmitting}
              className="w-full sm:w-auto min-h-[40px]"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={
                isSubmitting ||
                projectedStock < 0 ||
                delta === 0 ||
                (formReasonType === 'CUSTOM' && formReasonNotes.trim().length < 10)
              }
              className={`w-full sm:w-auto min-h-[40px] ${
                isDecrement ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'
              } text-white min-w-[140px]`}
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Registrando...</span>
                </span>
              ) : (
                'Registrar Ajuste'
              )}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* ==================================================================== */}
      {/* DRAWER / MODAL: DETALLE DE AJUSTE (EP-ADJ-03)                        */}
      {/* ==================================================================== */}
      <Dialog
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title="Ficha Técnica de Ajuste de Inventario"
        description={`Identificador de Registro: ${selectedAdjustment?.id || ''}`}
        size="md"
      >
        {selectedAdjustment && (
          <div className="space-y-4 pt-2">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500">Producto:</span>
                <span className="font-bold text-slate-900">
                  {selectedAdjustment.product?.name} ({selectedAdjustment.product?.dimensions})
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500">Fecha y Hora:</span>
                <span className="font-mono text-slate-700">
                  {formatDateTime(selectedAdjustment.executedAt).full}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500">Administrador Responsable:</span>
                <span className="font-semibold text-slate-800">
                  {selectedAdjustment.executedBy?.fullName} ({selectedAdjustment.executedBy?.email})
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500">Tipo de Movimiento:</span>
                <Badge
                  variant={selectedAdjustment.adjustmentType === 'INCREMENT' ? 'success' : 'destructive'}
                >
                  {selectedAdjustment.adjustmentType}
                </Badge>
              </div>
            </div>

            {/* Balances */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2.5 rounded-lg bg-slate-100 border border-slate-200">
                <p className="text-[10px] text-slate-500 uppercase">Stock Previo</p>
                <p className="font-mono font-bold text-slate-900 text-sm mt-0.5 tabular-nums">
                  {selectedAdjustment.previousStock} pcs
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-100 border border-slate-200">
                <p className="text-[10px] text-slate-500 uppercase">Variación</p>
                <p
                  className={`font-mono font-bold text-sm mt-0.5 tabular-nums ${
                    selectedAdjustment.adjustmentType === 'INCREMENT' ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {selectedAdjustment.adjustmentType === 'INCREMENT'
                    ? `+${selectedAdjustment.quantity}`
                    : `-${selectedAdjustment.quantity}`}{' '}
                  pcs
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200">
                <p className="text-[10px] text-blue-700 uppercase font-medium">Stock Resultante</p>
                <p className="font-mono font-black text-blue-900 text-sm mt-0.5 tabular-nums">
                  {selectedAdjustment.newStock} pcs
                </p>
              </div>
            </div>

            {/* Motivo y Notas */}
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
              <p className="text-xs font-semibold text-slate-700">
                Motivo:{' '}
                <span className="font-normal font-mono text-slate-900">
                  {selectedAdjustment.reasonType}
                </span>
              </p>
              <p className="text-xs text-slate-600 leading-relaxed">
                <strong>Justificación Técnica:</strong>{' '}
                {selectedAdjustment.reasonNotes || 'Sin justificación adicional registrada.'}
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="outline" size="sm" onClick={() => setIsDetailOpen(false)}>
                Cerrar
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
