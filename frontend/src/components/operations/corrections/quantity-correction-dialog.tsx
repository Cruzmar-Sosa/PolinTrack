'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Dialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2, History, AlertTriangle, ShieldCheck, RefreshCw, ArrowRight } from 'lucide-react';

export type CorrectionModuleType = 'WOOD_RECEIPT' | 'DAILY_PRODUCTION' | 'DISPATCH';

export interface QuantityCorrectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  module: CorrectionModuleType;
  recordId: string;
  recordCode: string;
}

export function QuantityCorrectionDialog({
  isOpen,
  onClose,
  onSuccess,
  module,
  recordId,
  recordCode,
}: QuantityCorrectionDialogProps) {
  const { session, user } = useAuth();
  const token = session?.access_token || '';

  const [activeTab, setActiveTab] = useState<'form' | 'history'>('form');
  const [loadingContext, setLoadingContext] = useState<boolean>(true);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  // Context Data
  const [contextData, setContextData] = useState<any>(null);
  const [historyList, setHistoryList] = useState<any[]>([]);

  // Form inputs
  const [reason, setReason] = useState<string>('');

  // Wood Receipt fields
  const [woodQuantity, setWoodQuantity] = useState<string>('');
  const [yugosQuantity, setYugosQuantity] = useState<string>('');
  const [reglasQuantity, setReglasQuantity] = useState<string>('');

  // Daily Production lines state: { [lineId: string]: number | string }
  const [productionLines, setProductionLines] = useState<Record<string, string>>({});
  const [productionProducts, setProductionProducts] = useState<Record<string, string>>({});

  // Dispatch lines state: { [lineId: string]: number | string }
  const [dispatchLines, setDispatchLines] = useState<Record<string, string>>({});
  const [dispatchProducts, setDispatchProducts] = useState<Record<string, string>>({});

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

  const endpointBase = useMemo(() => {
    switch (module) {
      case 'WOOD_RECEIPT':
        return `${apiUrl}/wood-receipts/${recordId}`;
      case 'DAILY_PRODUCTION':
        return `${apiUrl}/daily-productions/${recordId}`;
      case 'DISPATCH':
        return `${apiUrl}/dispatches/${recordId}`;
    }
  }, [apiUrl, module, recordId]);

  // Load Context when Dialog Opens
  useEffect(() => {
    if (!isOpen || !recordId || !token) return;

    setErrorMsg('');
    setSuccessMsg('');
    setActiveTab('form');
    setReason('');
    loadContext();
    loadHistory();
  }, [isOpen, recordId, token]);

  const loadContext = async () => {
    setLoadingContext(true);
    try {
      const res = await fetch(`${endpointBase}/corrections-context`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || 'Error al obtener el contexto de corrección');
      }
      const data = json.data;

      // Resilient Catalog Handling: if products array is missing or empty for production/dispatch,
      // fallback to querying authorized master catalog /catalog/products
      if (module === 'DAILY_PRODUCTION' || module === 'DISPATCH') {
        if (!data.products || data.products.length === 0) {
          try {
            const catRes = await fetch(`${apiUrl}/catalog/products?includeInactive=false`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            const catJson = await catRes.json();
            if (catRes.ok && Array.isArray(catJson.data)) {
              data.products = catJson.data.map((p: any) => ({
                id: p.id,
                name: p.name,
                dimensions: p.dimensions,
                availableStock: p.availableStock ?? 0,
              }));
            }
          } catch (catErr) {
            console.warn('Fallback catalog fetch error:', catErr);
          }
        }
      }

      setContextData(data);

      // Initialize form fields based on module
      if (module === 'WOOD_RECEIPT') {
        setWoodQuantity(String(data.currentQuantity || ''));
        setYugosQuantity(String(data.currentYugosQuantity ?? ''));
        setReglasQuantity(String(data.currentReglasQuantity ?? ''));
      } else if (module === 'DAILY_PRODUCTION') {
        const initialLines: Record<string, string> = {};
        const initialProducts: Record<string, string> = {};
        for (const line of data.lines || []) {
          initialLines[line.lineId] = String(line.currentQuantityProduced);
          initialProducts[line.lineId] = line.productId;
        }
        setProductionLines(initialLines);
        setProductionProducts(initialProducts);
      } else if (module === 'DISPATCH') {
        const initialLines: Record<string, string> = {};
        const initialProducts: Record<string, string> = {};
        for (const line of data.lines || []) {
          initialLines[line.lineId] = String(line.currentQuantityDispatched);
          initialProducts[line.lineId] = line.productId;
        }
        setDispatchLines(initialLines);
        setDispatchProducts(initialProducts);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error de conexión al cargar datos del registro');
    } finally {
      setLoadingContext(false);
    }
  };

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch(`${endpointBase}/corrections`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (res.ok) {
        setHistoryList(json.data || []);
      }
    } catch (err) {
      console.error('Error loading correction history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Validation of Reason
  const trimmedReason = reason.trim();
  const reasonLength = trimmedReason.length;
  const isReasonLengthValid = reasonLength >= 10 && reasonLength <= 500;

  const isReasonGeneric = useMemo(() => {
    const genericPhrases = [
      'error', 'errores', 'error de conteo', 'error de dedo', 'error de captura',
      'correccion', 'corrección', 'correccion de error', 'cambio', 'cambios',
      'ajuste', 'ajuste manual', 'modificacion', 'modificación', 'test', 'prueba',
      'n/a', 'na', 'ninguno', 'ninguna', 'sin motivo'
    ];
    const norm = trimmedReason
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return genericPhrases.includes(norm);
  }, [trimmedReason]);

  // Module Specific Calculations & Validation
  const moduleValidation = useMemo(() => {
    if (!contextData) return { isValid: false, hasChanges: false, error: '' };

    if (module === 'WOOD_RECEIPT') {
      const isTimbre = contextData.woodTypeName === 'TIMBRE';
      const isProcesada = contextData.woodTypeName === 'PROCESADA';

      if (isTimbre) {
        const num = parseFloat(woodQuantity);
        if (isNaN(num) || num <= 0) {
          return { isValid: false, hasChanges: false, error: 'La cantidad debe ser mayor a cero' };
        }
        const hasChange = Math.abs(num - contextData.currentQuantity) >= 0.01;
        return { isValid: hasChange, hasChanges: hasChange, error: hasChange ? '' : 'No se han realizado cambios en la cantidad' };
      } else if (isProcesada) {
        const y = parseInt(yugosQuantity || '0', 10);
        const r = parseInt(reglasQuantity || '0', 10);
        if (isNaN(y) || y < 0 || isNaN(r) || r < 0) {
          return { isValid: false, hasChanges: false, error: 'Yugos y reglas deben ser enteros no negativos' };
        }
        const total = y + r;
        if (total <= 0) {
          return { isValid: false, hasChanges: false, error: 'La suma total de yugos y reglas debe ser mayor a cero' };
        }
        const prevY = contextData.currentYugosQuantity ?? 0;
        const prevR = contextData.currentReglasQuantity ?? 0;
        const hasChange = y !== prevY || r !== prevR;
        return { isValid: hasChange, hasChanges: hasChange, error: hasChange ? '' : 'No se han realizado cambios en el desglose' };
      }
    } else if (module === 'DAILY_PRODUCTION') {
      let hasChange = false;
      const chosenProducts = new Set<string>();
      for (const line of contextData.lines || []) {
        const rawVal = productionLines[line.lineId];
        const val = parseInt(rawVal || '0', 10);
        const selectedProdId = productionProducts[line.lineId] || line.productId;
        const isProdChanged = selectedProdId !== line.productId;

        if (isNaN(val) || val <= 0) {
          return { isValid: false, hasChanges: false, error: `La cantidad de ${line.dimensions} debe ser un entero positivo` };
        }

        if (chosenProducts.has(selectedProdId)) {
          return {
            isValid: false,
            hasChanges: false,
            error: 'No se puede seleccionar la misma medida de polín en más de una línea del lote de producción.',
          };
        }
        chosenProducts.add(selectedProdId);

        if (isProdChanged) {
          if (line.quantityFumigated > 0) {
            return {
              isValid: false,
              hasChanges: false,
              error: `No se puede rectificar el producto ${line.dimensions} porque tiene ${line.quantityFumigated} piezas amparadas en certificado(s) OIRSA.`,
            };
          }
          if (line.quantityNetDispatched > 0) {
            return {
              isValid: false,
              hasChanges: false,
              error: `No se puede rectificar el producto ${line.dimensions} porque tiene ${line.quantityNetDispatched} piezas comprometidas en despachos comerciales netos.`,
            };
          }
          if (line.availableStock < line.currentQuantityProduced) {
            return {
              isValid: false,
              hasChanges: false,
              error: `Stock insuficiente en patio para retirar las ${line.currentQuantityProduced} piezas originales de ${line.dimensions} (Disponible: ${line.availableStock} pcs).`,
            };
          }
          hasChange = true;
        } else {
          if (val < line.minimumAllowedQuantity) {
            return {
              isValid: false,
              hasChanges: false,
              error: `La cantidad de ${line.dimensions} no puede ser menor a ${line.minimumAllowedQuantity} (comprometido en fumigaciones o despachos)`,
            };
          }
          if (val !== line.currentQuantityProduced) {
            hasChange = true;
          }
        }
      }
      return { isValid: hasChange, hasChanges: hasChange, error: hasChange ? '' : 'No se detectaron cambios en las cantidades o medidas producidas' };
    } else if (module === 'DISPATCH') {
      let hasChange = false;
      for (const line of contextData.lines || []) {
        const rawVal = dispatchLines[line.lineId];
        const val = parseInt(rawVal || '0', 10);
        const selectedProdId = dispatchProducts[line.lineId] || line.productId;
        const isProdChanged = selectedProdId !== line.productId;

        if (isNaN(val) || val <= 0) {
          return { isValid: false, hasChanges: false, error: `La cantidad despachada de ${line.dimensions} debe ser un entero positivo` };
        }

        if (isProdChanged) {
          if (line.quantityReturnedAccumulated > 0) {
            return {
              isValid: false,
              hasChanges: false,
              error: `No se puede modificar el producto de la línea (${line.dimensions}) porque cuenta con ${line.quantityReturnedAccumulated} piezas en devoluciones acumuladas.`,
            };
          }
          const targetProduct = contextData.products?.find((p: any) => p.id === selectedProdId);
          const availableStockTarget = targetProduct?.availableStock ?? 0;
          if (val > availableStockTarget) {
            return {
              isValid: false,
              hasChanges: false,
              error: `Stock insuficiente para la nueva medida seleccionada (${targetProduct?.dimensions || 'producto'}) (Disponible: ${availableStockTarget} pcs)`,
            };
          }
          hasChange = true;
        } else {
          if (val < line.minimumAllowedQuantity) {
            return {
              isValid: false,
              hasChanges: false,
              error: `La cantidad de ${line.dimensions} no puede ser menor a ${line.minimumAllowedQuantity} (ya devuelto en remisión)`,
            };
          }
          const delta = val - line.currentQuantityDispatched;
          if (delta > 0 && delta > line.availableStock) {
            return {
              isValid: false,
              hasChanges: false,
              error: `Stock insuficiente en almacén para despachar ${delta} piezas adicionales de ${line.dimensions} (Disponible: ${line.availableStock} pcs)`,
            };
          }
          if (val !== line.currentQuantityDispatched) {
            hasChange = true;
          }
        }
      }
      return { isValid: hasChange, hasChanges: hasChange, error: hasChange ? '' : 'No se detectaron cambios en las cantidades o medidas despachadas' };
    }

    return { isValid: false, hasChanges: false, error: '' };
  }, [
    contextData,
    module,
    woodQuantity,
    yugosQuantity,
    reglasQuantity,
    productionLines,
    productionProducts,
    dispatchLines,
    dispatchProducts,
  ]);

  const isFormValid = isReasonLengthValid && !isReasonGeneric && moduleValidation.isValid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || submitting) return;

    setSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    const idempotencyKey = `corr-${module.toLowerCase()}-${recordId.slice(0, 8)}-${Date.now()}`;

    let payload: any = {
      reason: trimmedReason,
      idempotencyKey,
    };

    if (module === 'WOOD_RECEIPT') {
      if (contextData.woodTypeName === 'TIMBRE') {
        payload.quantity = parseFloat(woodQuantity);
      } else {
        payload.yugosQuantity = parseInt(yugosQuantity || '0', 10);
        payload.reglasQuantity = parseInt(reglasQuantity || '0', 10);
      }
    } else if (module === 'DAILY_PRODUCTION') {
      payload.items = Object.entries(productionLines).map(([lineId, val]) => ({
        lineId,
        productId: productionProducts[lineId],
        quantity: parseInt(val as string, 10),
      }));
    } else if (module === 'DISPATCH') {
      payload.items = Object.entries(dispatchLines).map(([lineId, val]) => ({
        lineId,
        productId: dispatchProducts[lineId],
        quantity: parseInt(val as string, 10),
      }));
    }

    try {
      const res = await fetch(`${endpointBase}/corrections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || 'Error al persistir la corrección');
      }

      setSuccessMsg('¡Corrección guardada y auditada exitosamente!');
      await loadHistory();
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al procesar la corrección en el servidor');
    } finally {
      setSubmitting(false);
    }
  };

  const formatTimestamp = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const hours = d.getHours();
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const formattedHours = String(hours % 12 || 12).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = String(d.getFullYear()).slice(2);
      return `${formattedHours}:${minutes} ${ampm} ${day}/${month}/${year}`;
    } catch {
      return dateStr;
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={`Corrección Auditable de Cantidades — ${recordCode}`}
      subtitle={`Módulo: ${module === 'WOOD_RECEIPT' ? 'Ingreso de Madera' : module === 'DAILY_PRODUCTION' ? 'Producción Diaria' : 'Despacho Comercial'} | Control de Inmutabilidad RN-001`}
      size="xl"
    >
      <div className="space-y-4">
        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab('form')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold border-b-2 transition ${
              activeTab === 'form'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Editar Cantidades
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold border-b-2 transition ${
              activeTab === 'history'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <History className="w-4 h-4" />
            Historial de Correcciones ({historyList.length})
          </button>
        </div>

        {/* Global Alerts */}
        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2 text-rose-800 text-sm">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">No se pudo procesar la corrección:</p>
              <p className="text-xs text-rose-700 mt-0.5">{errorMsg}</p>
            </div>
          </div>
        )}

        {successMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-emerald-800 text-sm">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {loadingContext ? (
          <div className="p-8 text-center text-slate-500 flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
            <span className="text-sm">Cargando contexto y límites de inventario...</span>
          </div>
        ) : activeTab === 'form' ? (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Context Summary Cards */}
            {contextData && (
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                  <span className="font-semibold text-slate-600">Registro Operativo:</span>
                  <Badge variant="neutral" className="font-mono text-slate-800 font-bold bg-white">
                    {recordCode}
                  </Badge>
                  {module === 'WOOD_RECEIPT' && (
                    <span className="text-slate-500">
                      Tipo: <strong className="text-slate-700">{contextData.woodTypeName}</strong> · Especie:{' '}
                      <strong className="text-slate-700">{contextData.speciesName}</strong> · Proveedor:{' '}
                      <strong className="text-slate-700">{contextData.supplierName}</strong>
                    </span>
                  )}
                  {module === 'DAILY_PRODUCTION' && (
                    <span className="text-slate-500">
                      Semana ISO: <strong className="text-slate-700">W{contextData.isoWeek}</strong> · Total Actual:{' '}
                      <strong className="text-slate-700">{contextData.totalQuantityProduced} piezas</strong>
                    </span>
                  )}
                  {module === 'DISPATCH' && (
                    <span className="text-slate-500">
                      Cliente: <strong className="text-slate-700">{contextData.clientCenterName}</strong> · Factura:{' '}
                      <strong className="text-slate-700">{contextData.invoiceNumber}</strong>
                    </span>
                  )}
                </div>

                {/* Module Warning Banner */}
                {module === 'WOOD_RECEIPT' && contextData.linkedProductionsCount > 0 && (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-amber-800 text-xs">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      <strong>Aviso de trazabilidad:</strong> Este ingreso ya está referenciado en{' '}
                      <strong>{contextData.linkedProductionsCount} orden(es) de producción</strong>. La corrección
                      actualizará retroactivamente los reportes de rendimiento y cubicación.
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Editable Fields Section */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                1. Ajuste de Cantidades Admitidas
              </h4>

              {/* M03: Wood Receipt Form */}
              {module === 'WOOD_RECEIPT' && contextData && (
                <div>
                  {contextData.woodTypeName === 'TIMBRE' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Cantidad Actual ({contextData.unit === 'PIE_TABLAR' ? 'pt' : 'piezas'})
                        </label>
                        <div className="p-2.5 bg-slate-100 rounded-lg text-slate-600 font-mono text-sm">
                          {Number(contextData.currentQuantity).toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-800 mb-1">
                          Nueva Cantidad Corregida *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={woodQuantity}
                          onChange={(e) => setWoodQuantity(e.target.value)}
                          className="w-full text-sm bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 font-mono"
                          required
                        />
                        <span className="text-[10px] text-slate-400 mt-1 block">
                          Admite valores decimales según precisión de cubicación en báscula.
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-800 mb-1">
                            Yugos (piezas) *
                          </label>
                          <input
                            type="number"
                            step="1"
                            min="0"
                            value={yugosQuantity}
                            onChange={(e) => setYugosQuantity(e.target.value)}
                            className="w-full text-sm bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 font-mono"
                            required
                          />
                          <span className="text-[10px] text-slate-400 mt-1 block">
                            Actual: {contextData.currentYugosQuantity ?? 0} piezas
                          </span>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-800 mb-1">
                            Reglas / Tablas (piezas) *
                          </label>
                          <input
                            type="number"
                            step="1"
                            min="0"
                            value={reglasQuantity}
                            onChange={(e) => setReglasQuantity(e.target.value)}
                            className="w-full text-sm bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 font-mono"
                            required
                          />
                          <span className="text-[10px] text-slate-400 mt-1 block">
                            Actual: {contextData.currentReglasQuantity ?? 0} piezas
                          </span>
                        </div>
                      </div>

                      {/* Live Server Total Preview */}
                      <div className="p-3 bg-white border border-blue-200 rounded-lg flex items-center justify-between text-xs">
                        <span className="text-slate-600 font-medium">Total Calculado en Servidor:</span>
                        <strong className="text-blue-900 font-mono text-sm font-bold">
                          {(parseInt(yugosQuantity || '0', 10) + parseInt(reglasQuantity || '0', 10))} piezas
                        </strong>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* M04: Daily Production Form */}
              {module === 'DAILY_PRODUCTION' && contextData && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3 min-w-[220px]">
                          Producto / Medida
                          {contextData.products && (
                            <span className="ml-1 text-[10px] font-normal text-slate-500">
                              ({contextData.products.length} activas)
                            </span>
                          )}
                        </th>
                        <th className="py-2.5 px-3 text-right">Cant. Actual</th>
                        <th className="py-2.5 px-3 text-right">Fumigadas</th>
                        <th className="py-2.5 px-3 text-right">Despachos Netos</th>
                        <th className="py-2.5 px-3 text-right">Mínimo Permitido</th>
                        <th className="py-2.5 px-3 text-right">Nueva Cantidad</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {contextData.lines?.map((line: any) => {
                        const currentVal = productionLines[line.lineId] || '';
                        const valNum = parseInt(currentVal, 10);
                        const selectedProdId = productionProducts[line.lineId] || line.productId;
                        const isProdChanged = selectedProdId !== line.productId;
                        const isUnderMin =
                          !isProdChanged &&
                          !isNaN(valNum) &&
                          valNum < line.minimumAllowedQuantity;

                        return (
                          <tr key={line.lineId} className="hover:bg-slate-50">
                            <td className="py-2.5 px-3">
                              <div className="space-y-1">
                                <select
                                  value={selectedProdId}
                                  onChange={(e) =>
                                    setProductionProducts((prev) => ({
                                      ...prev,
                                      [line.lineId]: e.target.value,
                                    }))
                                  }
                                  className="w-full text-xs p-1.5 rounded border border-slate-300 bg-white font-medium text-slate-800 focus:ring-1 focus:ring-blue-500"
                                >
                                  {/* Retain historical original product if deactivated in catalog */}
                                  {contextData.products &&
                                    !contextData.products.some((p: any) => p.id === line.productId) && (
                                      <option key={line.productId} value={line.productId} disabled>
                                        {line.productName} ({line.dimensions}) [Inactivo - Original]
                                      </option>
                                    )}
                                  {contextData.products && contextData.products.length > 0 ? (
                                    contextData.products.map((p: any) => {
                                      const isChosenInOtherLine = Object.entries(productionProducts).some(
                                        ([otherLineId, prodId]) =>
                                          otherLineId !== line.lineId && prodId === p.id,
                                      );
                                      return (
                                        <option
                                          key={p.id}
                                          value={p.id}
                                          disabled={isChosenInOtherLine}
                                        >
                                          {p.name} ({p.dimensions})
                                          {isChosenInOtherLine ? ' — (Asignado en otra línea)' : ''}
                                        </option>
                                      );
                                    })
                                  ) : (
                                    <option value={line.productId}>
                                      {line.productName} ({line.dimensions})
                                    </option>
                                  )}
                                </select>
                                {isProdChanged && (
                                  <div className="flex items-center gap-1.5">
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                      Cambio de Medida
                                    </span>
                                    <span className="text-[10px] text-slate-500">
                                      Original: {line.dimensions}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                              {line.currentQuantityProduced}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-amber-700">
                              {line.quantityFumigated}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-blue-700">
                              {line.quantityNetDispatched}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-700">
                              {line.minimumAllowedQuantity}
                            </td>
                            <td className="py-2.5 px-3 text-right w-36">
                              <input
                                type="number"
                                step="1"
                                min={isProdChanged ? 1 : line.minimumAllowedQuantity}
                                value={currentVal}
                                onChange={(e) =>
                                  setProductionLines((prev) => ({
                                    ...prev,
                                    [line.lineId]: e.target.value,
                                  }))
                                }
                                className={`w-28 text-right text-xs p-1.5 rounded border font-mono ${
                                  isUnderMin
                                    ? 'border-rose-500 bg-rose-50 text-rose-900 focus:ring-rose-500'
                                    : 'border-slate-300 bg-white focus:ring-blue-500'
                                }`}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* M07: Dispatches Form */}
              {module === 'DISPATCH' && contextData && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3 min-w-[220px]">
                          Producto / Medida
                          {contextData.products && (
                            <span className="ml-1 text-[10px] font-normal text-slate-500">
                              ({contextData.products.length} activas)
                            </span>
                          )}
                        </th>
                        <th className="py-2.5 px-3">Lote Origen</th>
                        <th className="py-2.5 px-3 text-right">Cant. Despachada</th>
                        <th className="py-2.5 px-3 text-right">Devoluciones Acum.</th>
                        <th className="py-2.5 px-3 text-right">Stock en Bodega</th>
                        <th className="py-2.5 px-3 text-right">Nueva Cantidad</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {contextData.lines?.map((line: any) => {
                        const currentVal = dispatchLines[line.lineId] || '';
                        const valNum = parseInt(currentVal, 10);
                        const selectedProdId = dispatchProducts[line.lineId] || line.productId;
                        const isProdChanged = selectedProdId !== line.productId;
                        const targetProduct = contextData.products?.find(
                          (p: any) => p.id === selectedProdId,
                        );
                        const effectiveStock = isProdChanged
                          ? targetProduct?.availableStock ?? 0
                          : line.availableStock;
                        const isUnderMin =
                          !isProdChanged &&
                          !isNaN(valNum) &&
                          valNum < line.minimumAllowedQuantity;
                        const isInsufficientStock =
                          !isNaN(valNum) &&
                          (isProdChanged
                            ? valNum > effectiveStock
                            : valNum - line.currentQuantityDispatched > effectiveStock);

                        return (
                          <tr key={line.lineId} className="hover:bg-slate-50">
                            <td className="py-2.5 px-3">
                              <div className="space-y-1">
                                <select
                                  value={selectedProdId}
                                  onChange={(e) =>
                                    setDispatchProducts((prev) => ({
                                      ...prev,
                                      [line.lineId]: e.target.value,
                                    }))
                                  }
                                  className="w-full text-xs p-1.5 rounded border border-slate-300 bg-white font-medium text-slate-800 focus:ring-1 focus:ring-blue-500"
                                >
                                  {/* Retain historical original product if deactivated in catalog */}
                                  {contextData.products &&
                                    !contextData.products.some((p: any) => p.id === line.productId) && (
                                      <option key={line.productId} value={line.productId} disabled>
                                        {line.productName} ({line.dimensions}) [Inactivo - Original]
                                      </option>
                                    )}
                                  {contextData.products && contextData.products.length > 0 ? (
                                    contextData.products.map((p: any) => (
                                      <option key={p.id} value={p.id}>
                                        {p.name} ({p.dimensions}) — Stock: {p.availableStock ?? 0} pcs
                                      </option>
                                    ))
                                  ) : (
                                    <option value={line.productId}>
                                      {line.productName} ({line.dimensions})
                                    </option>
                                  )}
                                </select>
                                {isProdChanged && (
                                  <div className="flex items-center gap-1.5">
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                      Cambio de Medida
                                    </span>
                                    <span className="text-[10px] text-slate-500">
                                      Original: {line.dimensions}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-600">
                              {line.productionLot}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                              {line.currentQuantityDispatched}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-rose-700">
                              {line.quantityReturnedAccumulated}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono">
                              <span
                                className={`font-bold ${
                                  isInsufficientStock
                                    ? 'text-rose-600'
                                    : isProdChanged
                                    ? 'text-blue-700'
                                    : 'text-emerald-700'
                                }`}
                              >
                                {effectiveStock}
                              </span>
                              {isProdChanged && (
                                <span className="block text-[10px] text-slate-500">
                                  (Medida destino)
                                </span>
                              )}
                              {isInsufficientStock && (
                                <span className="block text-[10px] font-bold text-rose-600">
                                  ⚠️ Stock insuficiente
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right w-36">
                              <input
                                type="number"
                                step="1"
                                min={isProdChanged ? 1 : line.minimumAllowedQuantity}
                                value={currentVal}
                                onChange={(e) =>
                                  setDispatchLines((prev) => ({
                                    ...prev,
                                    [line.lineId]: e.target.value,
                                  }))
                                }
                                className={`w-28 text-right text-xs p-1.5 rounded border font-mono ${
                                  isUnderMin || isInsufficientStock
                                    ? 'border-rose-500 bg-rose-50 text-rose-900 focus:ring-rose-500'
                                    : 'border-slate-300 bg-white focus:ring-blue-500'
                                }`}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Justification Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  2. Justificación Operativa Obligatoria *
                </label>
                <span
                  className={`text-[11px] font-mono ${
                    reasonLength < 10
                      ? 'text-rose-500'
                      : reasonLength > 500
                      ? 'text-rose-600'
                      : 'text-slate-500'
                  }`}
                >
                  {reasonLength} / 500 caracteres (mínimo 10)
                </span>
              </div>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Describa detalladamente la causa concreta del error (ej. discrepancia física en recuento de estiba, ajuste por validación de báscula con proveedor, etc.)."
                className={`w-full text-xs p-3 rounded-xl border focus:outline-none transition ${
                  isReasonGeneric
                    ? 'border-rose-400 bg-rose-50/30 focus:ring-2 focus:ring-rose-500'
                    : reasonLength >= 10
                    ? 'border-emerald-300 bg-emerald-50/20 focus:ring-2 focus:ring-emerald-500'
                    : 'border-slate-300 bg-white focus:ring-2 focus:ring-blue-500'
                }`}
                required
              />

              {isReasonGeneric && (
                <p className="text-[11px] text-rose-600 font-medium flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  La justificación ingresada es demasiado genérica o insuficiente. Describa la causa operativa concreta.
                </p>
              )}
              {reasonLength > 0 && reasonLength < 10 && (
                <p className="text-[11px] text-amber-600 font-medium">
                  Faltan {10 - reasonLength} caracteres para alcanzar el mínimo requerido.
                </p>
              )}
            </div>

            {/* Validation Feedback */}
            {moduleValidation.error && (
              <p className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                {moduleValidation.error}
              </p>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!isFormValid || submitting}
                className={`flex items-center gap-2 px-5 py-2 text-xs font-bold text-white rounded-lg shadow-sm transition ${
                  !isFormValid || submitting
                    ? 'bg-slate-400 cursor-not-allowed opacity-60'
                    : 'bg-blue-600 hover:bg-blue-700 active:scale-98'
                }`}
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Guardando y auditando...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Confirmar Corrección Auditable</span>
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          /* History Tab */
          <div className="space-y-4">
            {loadingHistory ? (
              <div className="p-8 text-center text-slate-500 flex flex-col items-center justify-center gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
                <span className="text-sm">Cargando registros inmutables de auditoría...</span>
              </div>
            ) : historyList.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300">
                <History className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-700">Sin correcciones registradas</p>
                <p className="text-xs text-slate-500 mt-1">
                  Este registro mantiene sus cantidades originales intactas desde su creación inicial.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {historyList.map((corr, idx) => (
                  <div
                    key={corr.id}
                    className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs space-y-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="neutral" className="font-mono bg-slate-50 text-slate-800 font-bold">
                          Corrección #{historyList.length - idx}
                        </Badge>
                        <span className="text-xs text-slate-500">
                          {formatTimestamp(corr.createdAt)}
                        </span>
                      </div>
                      <div className="text-xs text-slate-600">
                        Responsable:{' '}
                        <strong className="text-slate-800">
                          {corr.correctedBy?.fullName || 'Usuario del sistema'}
                        </strong>{' '}
                        <Badge variant="default" className="text-[10px] bg-blue-50 text-blue-700">
                          {corr.correctedBy?.role || 'ADMIN'}
                        </Badge>
                      </div>
                    </div>

                    {/* Motivo */}
                    <div className="text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-200/80">
                      <span className="text-slate-500 font-medium">Motivo:</span>{' '}
                      <span className="text-slate-800 font-semibold">{corr.reason}</span>
                    </div>

                    {/* Reclasificación de Producto / Medida */}
                    {corr.metadata?.productReclassifications &&
                      corr.metadata.productReclassifications.length > 0 && (
                        <div className="space-y-1.5">
                          {corr.metadata.productReclassifications.map(
                            (reclass: any, rIdx: number) => (
                              <div
                                key={rIdx}
                                className="flex flex-wrap items-center gap-2 p-2 rounded-lg bg-amber-50 border border-amber-200 text-xs"
                              >
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-200 text-amber-900 border border-amber-300">
                                  Cambio de Medida
                                </span>
                                <span className="font-semibold text-slate-800">
                                  {reclass.previousDimensions || reclass.previousProductName}
                                </span>
                                <ArrowRight className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                                <span className="font-bold text-blue-800">
                                  {reclass.newDimensions || reclass.newProductName}
                                </span>
                                <span className="text-[11px] text-slate-600 ml-auto font-mono">
                                  {reclass.previousQuantity} pcs → {reclass.newQuantity} pcs
                                </span>
                              </div>
                            ),
                          )}
                        </div>
                      )}

                    {/* Detalle de cambios de valores */}
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                          <tr>
                            <th className="py-2 px-3">Campo / Producto</th>
                            <th className="py-2 px-3 text-right">Valor Anterior</th>
                            <th className="py-2 px-3 text-right">Valor Nuevo</th>
                            <th className="py-2 px-3 text-right">Variación (Delta)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {corr.items?.map((item: any) => {
                            const deltaNum = Number(item.deltaQuantity);
                            const isOutReclass =
                              item.fieldName === 'product_reclassification_out';
                            const isInReclass =
                              item.fieldName === 'product_reclassification_in';
                            const fieldLabel = isOutReclass
                              ? `${item.product?.dimensions || item.product?.name} (Retiro por Reclasificación)`
                              : isInReclass
                              ? `${item.product?.dimensions || item.product?.name} (Asignación por Reclasificación)`
                              : item.product?.dimensions ||
                                item.product?.name ||
                                (item.fieldName === 'quantity'
                                  ? 'Cantidad Total'
                                  : item.fieldName === 'yugosQuantity'
                                  ? 'Yugos'
                                  : item.fieldName === 'reglasQuantity'
                                  ? 'Reglas / Tablas'
                                  : item.fieldName);

                            return (
                              <tr key={item.id} className="hover:bg-slate-50/50">
                                <td className="py-2 px-3 font-medium text-slate-800">
                                  <span>{fieldLabel}</span>
                                  {(isOutReclass || isInReclass) && (
                                    <span className="inline-flex items-center ml-2 px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                      Reclasificación
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-right font-mono text-slate-600">
                                  {Number(item.previousQuantity).toLocaleString('es-NI')}
                                </td>
                                <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                                  {Number(item.newQuantity).toLocaleString('es-NI')}
                                </td>
                                <td className="py-2 px-3 text-right font-mono font-bold">
                                  <span
                                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] ${
                                      deltaNum > 0
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        : deltaNum < 0
                                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                        : 'bg-slate-50 text-slate-600'
                                    }`}
                                  >
                                    {deltaNum > 0 ? `+${deltaNum}` : deltaNum}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
