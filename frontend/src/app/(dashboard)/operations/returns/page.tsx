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
  TablePagination,
} from '@/components/ui';
import {
  RotateCcw,
  Calendar,
  Building2,
  Plus,
  Search,
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
  ArrowDownLeft,
} from 'lucide-react';
import {
  formatDate,
  formatDateLong,
  formatDateTime,
  getCalendarDate,
  getTodayCalendarDate,
} from '@/lib/date-formatters';
import { Dialog, Drawer } from '@/components/ui/dialog';

interface ReturnDetailItem {
  id: string;
  dispatchDetailId: string;
  quantityReturned: number;
  productId?: string;
  product?: {
    id: string;
    name: string;
    dimensions: string;
  };
  dispatchDetail?: {
    id: string;
    quantityDispatched: number;
    dimensions: string;
    product?: {
      id?: string;
      name: string;
      dimensions?: string;
    };
    dailyProduction?: {
      id?: string;
      productionLot: string;
    };
  };
}

interface ReturnRecord {
  id: string;
  dispatchHeaderId: string;
  dispatchHeader: {
    id: string;
    invoiceNumber: string;
    dispatchDate: string;
    clientCenter?: {
      id?: string;
      code?: string;
      name: string;
      location?: string | null;
    };
    clientCenterName?: string;
  };
  clientCenter?: {
    id?: string;
    code?: string;
    name: string;
    location?: string | null;
  };
  returnDate: string;
  returnType: 'TOTAL' | 'PARCIAL';
  reason: string;
  observations: string | null;
  registeredById?: string;
  registeredBy?: {
    fullName: string;
    email: string;
  };
  returnDetails: ReturnDetailItem[];
  createdAt: string;
}

interface EligibleDispatchLine {
  id: string;
  productId: string;
  productName: string;
  dimensions: string;
  productionLot: string;
  quantityDispatched: number;
  quantityReturnedAccumulated: number;
  availableToReturn: number;
}

interface EligibleDispatch {
  id: string;
  invoiceNumber: string;
  dispatchDate: string;
  clientCenterName: string;
  clientCenter?: {
    id?: string;
    code?: string;
    name: string;
    location?: string | null;
  };
  status: string;
  lines: EligibleDispatchLine[];
}

export default function ReturnsPage() {
  const { role, session } = useAuth();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

  // Data states
  const [returns, setReturns] = useState<ReturnRecord[]>([]);
  const [eligibleDispatches, setEligibleDispatches] = useState<EligibleDispatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [dispatchLinesLookup, setDispatchLinesLookup] = useState<
    Record<string, { productionLot: string; productName: string; dimensions: string; quantityDispatched: number }>
  >({});

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [returnTypeFilter, setReturnTypeFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Reset pagination to page 1 on filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, returnTypeFilter, startDate, endDate]);

  // Modal Create
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [selectedDispatchId, setSelectedDispatchId] = useState('');
  const [formReturnDate, setFormReturnDate] = useState(() => {
    return getTodayCalendarDate();
  });
  const [formReason, setFormReason] = useState('');
  const [formObservations, setFormObservations] = useState('');

  // Return quantities per line map: { [dispatchDetailId]: quantityToReturn }
  const [returnQuantities, setReturnQuantities] = useState<{ [detailId: string]: string }>({});

  // Drawer / Detail Modal
  const [selectedReturn, setSelectedReturn] = useState<ReturnRecord | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const isMutationAllowed = role === 'ADMIN' || role === 'CONTABILIDAD';

  // Load returns and candidate dispatches
  const loadData = async () => {
    if (!session?.access_token) return;
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const headers = { Authorization: `Bearer ${session.access_token}` };

      const [resRet, resDisp] = await Promise.all([
        fetch(`${apiUrl}/returns?limit=0`, { headers }),
        fetch(`${apiUrl}/dispatches?limit=0`, { headers }),
      ]);

      if (!resRet.ok) {
        throw new Error('Error al consultar el historial de devoluciones');
      }

      const [jsonRet, jsonDisp] = await Promise.all([
        resRet.json(),
        resDisp.json(),
      ]);

      setReturns(jsonRet.data || []);

      // Build comprehensive dispatch lines lookup (maps dispatchDetailId -> lot, product, dispatched qty)
      const rawDispatches = jsonDisp.data || [];
      const lineMap: Record<
        string,
        { productionLot: string; productName: string; dimensions: string; quantityDispatched: number }
      > = {};
      for (const d of rawDispatches) {
        for (const det of d.dispatchDetails || []) {
          if (det?.id) {
            lineMap[det.id] = {
              productionLot: det.dailyProduction?.productionLot || '',
              productName: det.product?.name || '',
              dimensions: det.dimensions || det.product?.dimensions || '',
              quantityDispatched: det.quantityDispatched || 0,
            };
          }
        }
      }
      setDispatchLinesLookup(lineMap);

      // Format eligible dispatches that are not totally returned
      const eligible: EligibleDispatch[] = rawDispatches
        .filter((d: any) => d.status !== 'RETURNED_TOTAL')
        .map((d: any) => ({
          id: d.id,
          invoiceNumber: d.invoiceNumber,
          dispatchDate: getCalendarDate(d.dispatchDate) || d.dispatchDate,
          clientCenterName: d.clientCenter?.name || 'Sin planta asignada',
          clientCenter: d.clientCenter,
          status: d.status,
          lines: (d.dispatchDetails || []).map((det: any) => {
            const available = det.quantityDispatched - det.quantityReturnedAccumulated;
            return {
              id: det.id,
              productId: det.productId,
              productName: det.product?.name || 'Polín',
              dimensions: det.dimensions || det.product?.dimensions || '',
              productionLot: det.dailyProduction?.productionLot || '',
              quantityDispatched: det.quantityDispatched,
              quantityReturnedAccumulated: det.quantityReturnedAccumulated,
              availableToReturn: Math.max(0, available),
            };
          }),
        }));

      setEligibleDispatches(eligible);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error de conexión con el servidor');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [session?.access_token]);

  // Filtered returns
  const filteredReturns = useMemo(() => {
    return returns.filter((r) => {
      const matchesSearch =
        !searchTerm ||
        r.dispatchHeader.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.dispatchHeader.clientCenter?.name || r.clientCenter?.name || r.dispatchHeader.clientCenterName || '')
          .toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        r.reason.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesType = !returnTypeFilter || r.returnType === returnTypeFilter;
      const returnDateCal = getCalendarDate(r.returnDate);
      const matchesStart = !startDate || returnDateCal >= startDate;
      const matchesEnd = !endDate || returnDateCal <= endDate;

      return matchesSearch && matchesType && matchesStart && matchesEnd;
    }).sort((a, b) => {
      const dateA = new Date(a.returnDate).getTime() || 0;
      const dateB = new Date(b.returnDate).getTime() || 0;
      if (dateB !== dateA) return dateB - dateA;
      const createdA = new Date(a.createdAt).getTime() || 0;
      const createdB = new Date(b.createdAt).getTime() || 0;
      if (createdB !== createdA) return createdB - createdA;
      return (b.id || '').localeCompare(a.id || '');
    });
  }, [returns, searchTerm, returnTypeFilter, startDate, endDate]);

  // Paginated returns
  const paginatedReturns = useMemo(() => {
    if (pageSize === 0) return filteredReturns;
    const startIndex = (currentPage - 1) * pageSize;
    return filteredReturns.slice(startIndex, startIndex + pageSize);
  }, [filteredReturns, currentPage, pageSize]);

  // Current selected dispatch for modal
  const activeDispatch = useMemo(() => {
    return eligibleDispatches.find((d) => d.id === selectedDispatchId) || null;
  }, [eligibleDispatches, selectedDispatchId]);

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setFormError(null);
    const initialDisp = eligibleDispatches[0];
    setSelectedDispatchId(initialDisp?.id || '');
    setFormReturnDate(getTodayCalendarDate());
    setFormReason('');
    setFormObservations('');

    // Reset return quantities
    const initialQtyMap: { [key: string]: string } = {};
    if (initialDisp) {
      initialDisp.lines.forEach((line) => {
        initialQtyMap[line.id] = '';
      });
    }
    setReturnQuantities(initialQtyMap);
    setIsCreateModalOpen(true);
  };

  // On selecting a different dispatch in the modal
  const handleDispatchSelectChange = (newDispatchId: string) => {
    setSelectedDispatchId(newDispatchId);
    const target = eligibleDispatches.find((d) => d.id === newDispatchId);
    const newQtyMap: { [key: string]: string } = {};
    if (target) {
      target.lines.forEach((line) => {
        newQtyMap[line.id] = '';
      });
    }
    setReturnQuantities(newQtyMap);
  };

  // Submit Create Return
  const handleSubmitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!selectedDispatchId) {
      setFormError('Debe seleccionar la factura de despacho original.');
      return;
    }

    if (!formReason.trim()) {
      setFormError('El motivo de la devolución es obligatorio.');
      return;
    }

    if (!activeDispatch) {
      setFormError('Despacho seleccionado no válido.');
      return;
    }

    // Chronological validation: compare calendar date strings (YYYY-MM-DD)
    const dispatchCalendarDate = getCalendarDate(activeDispatch.dispatchDate);
    const returnCalendarDate = getCalendarDate(formReturnDate);

    if (returnCalendarDate < dispatchCalendarDate) {
      setFormError(
        `La fecha de devolución (${formatDate(returnCalendarDate)}) no puede ser anterior a la fecha del despacho original (${formatDate(dispatchCalendarDate)}).`,
      );
      return;
    }

    const maxCalendarDate = getTodayCalendarDate();
    if (returnCalendarDate > maxCalendarDate) {
      setFormError('La fecha de devolución no puede ser posterior al día de hoy.');
      return;
    }

    // Parse detail quantities
    const detailsPayload: Array<{ dispatchDetailId: string; quantityReturned: number }> = [];

    for (const line of activeDispatch.lines) {
      const qtyStr = returnQuantities[line.id];
      if (qtyStr && qtyStr.trim() !== '') {
        const qty = parseInt(qtyStr, 10);
        if (isNaN(qty) || qty < 0) {
          setFormError(`La cantidad ingresada para ${line.productName} no es válida.`);
          return;
        }
        if (qty > line.availableToReturn) {
          setFormError(
            `La cantidad a devolver para ${line.productName} (${qty} pcs) supera el saldo disponible (${line.availableToReturn} pcs).`,
          );
          return;
        }
        if (qty > 0) {
          detailsPayload.push({
            dispatchDetailId: line.id,
            quantityReturned: qty,
          });
        }
      }
    }

    if (detailsPayload.length === 0) {
      setFormError('Debe ingresar al menos una cantidad mayor a cero en las líneas a devolver.');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload = {
        dispatchHeaderId: selectedDispatchId,
        returnDate: formReturnDate,
        reason: formReason.trim(),
        observations: formObservations.trim() || undefined,
        details: detailsPayload,
      };

      const res = await fetch(`${apiUrl}/returns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      const resJson = await res.json();

      if (!res.ok) {
        throw new Error(resJson.message || 'Error al registrar la devolución comercial.');
      }

      setSuccessMessage(
        `Devolución comercial registrada exitosamente para la Factura '${activeDispatch.invoiceNumber}'. Piezas reincorporadas al inventario.`,
      );
      setTimeout(() => setSuccessMessage(null), 7000);
      setCurrentPage(1);
      setIsCreateModalOpen(false);
      loadData();
    } catch (err: any) {
      setFormError(err.message || 'Error de conexión al registrar la devolución.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenDetail = (ret: ReturnRecord) => {
    setSelectedReturn(ret);
    setIsDrawerOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-3">
            <PageTitle>Devoluciones Comerciales</PageTitle>
            <Badge variant="warning">M08: Devoluciones</Badge>
          </div>
          <MutedText>
            Reingreso de piezas a planta por reclamos de calidad. Preserva la inmutabilidad histórica del despacho y actualiza el Kardex (+N).
          </MutedText>
        </div>

        <div className="flex items-center gap-3">
          {isMutationAllowed ? (
            <Button
              variant="default"
              onClick={handleOpenCreateModal}
              className="bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>+ Registrar Devolución</span>
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
            placeholder="Buscar por factura original, planta cliente o motivo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none transition"
          />
        </div>

        <div className="w-full md:w-44">
          <select
            value={returnTypeFilter}
            onChange={(e) => setReturnTypeFilter(e.target.value)}
            className="w-full py-2 px-3 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none transition"
          >
            <option value="">Todos los Tipos</option>
            <option value="PARCIAL">Parcial</option>
            <option value="TOTAL">Total</option>
          </select>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
            title="Fecha inicial"
          />
          <span className="text-slate-400 text-xs">a</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
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

      {/* Returns Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : filteredReturns.length === 0 ? (
          <div className="p-12">
            <EmptyState
              title="No se encontraron eventos de devolución"
              description={
                searchTerm || returnTypeFilter || startDate || endDate
                  ? 'No hay registros que coincidan con los filtros aplicados.'
                  : 'Aún no se han registrado devoluciones comerciales de polines.'
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Factura Original</th>
                  <th className="py-3 px-4">Fecha Devolución</th>
                  <th className="py-3 px-4">Planta Cliente</th>
                  <th className="py-3 px-4">Tipo</th>
                  <th className="py-3 px-4 text-right">Piezas Devueltas</th>
                  <th className="py-3 px-4">Motivo Principal</th>
                  <th className="py-3 px-4">Registrado Por</th>
                  <th className="py-3 px-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedReturns.map((r) => {
                  const totalReturnedPieces = r.returnDetails.reduce(
                    (sum, item) => sum + item.quantityReturned,
                    0,
                  );

                  return (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {r.dispatchHeader.invoiceNumber}
                      </td>
                      <td className="py-3 px-4 text-slate-700 whitespace-nowrap font-medium">
                        {formatDate(r.returnDate)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">
                          {r.dispatchHeader?.clientCenter?.name ??
                            r.clientCenter?.name ??
                            r.dispatchHeader?.clientCenterName ??
                            'Sin planta asignada'}
                        </div>
                        {(r.dispatchHeader?.clientCenter?.code ?? r.clientCenter?.code) ? (
                          <div className="text-xs text-slate-500 font-mono">
                            {r.dispatchHeader?.clientCenter?.code ?? r.clientCenter?.code}
                          </div>
                        ) : (r.dispatchHeader?.clientCenter?.location ?? r.clientCenter?.location) ? (
                          <div className="text-[11px] text-slate-500 truncate max-w-[180px]">
                            {r.dispatchHeader?.clientCenter?.location ?? r.clientCenter?.location}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-block text-xs font-semibold px-2 py-0.5 rounded ${
                            r.returnType === 'TOTAL'
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {r.returnType}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <span className="font-bold text-amber-700 text-base">
                          +{totalReturnedPieces.toLocaleString('es-NI')}
                        </span>{' '}
                        <span className="text-xs font-medium text-slate-500">pcs</span>
                      </td>
                      <td className="py-3 px-4 text-slate-700 max-w-xs truncate" title={r.reason}>
                        {r.reason}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600">
                        {r.registeredBy?.fullName || 'Sistema'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleOpenDetail(r)}
                          className="text-xs font-medium text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded transition"
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

        {filteredReturns.length > 0 && (
          <TablePagination
            currentPage={currentPage}
            totalItems={filteredReturns.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setCurrentPage(1);
            }}
          />
        )}
      </div>

      {/* Drawer Lateral de Detalle */}
      <Drawer
        isOpen={isDrawerOpen && !!selectedReturn}
            onClose={() => setIsDrawerOpen(false)}
            subtitle="Evento de Devolución Comercial"
            title={selectedReturn ? `Factura: ${selectedReturn.dispatchHeader.invoiceNumber}` : undefined}
            size="md"
            footer={
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="w-full bg-slate-800 hover:bg-slate-700 text-white font-semibold py-2 rounded-lg text-sm transition"
              >
                Cerrar Ficha
              </button>
            }
          >
            {selectedReturn && (
              <div className="space-y-6">
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="text-xs text-amber-800 font-semibold flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-amber-700" />
                      Cliente Emisor del Reclamo
                    </p>
                    <p className="text-base font-bold text-slate-900">
                      {selectedReturn.dispatchHeader?.clientCenter?.name ??
                        selectedReturn.clientCenter?.name ??
                        selectedReturn.dispatchHeader?.clientCenterName ??
                        'Sin planta asignada'}
                    </p>
                    {(selectedReturn.dispatchHeader?.clientCenter?.code ?? selectedReturn.clientCenter?.code) && (
                      <span className="inline-block text-[10px] font-mono font-bold bg-amber-200/70 text-amber-900 px-1.5 py-0.5 rounded">
                        {selectedReturn.dispatchHeader?.clientCenter?.code ?? selectedReturn.clientCenter?.code}
                      </span>
                    )}
                    {(selectedReturn.dispatchHeader?.clientCenter?.location ??
                      selectedReturn.clientCenter?.location) && (
                      <p className="text-xs text-slate-600">
                        {selectedReturn.dispatchHeader?.clientCenter?.location ??
                          selectedReturn.clientCenter?.location}
                      </p>
                    )}
                  </div>
                  <span className="px-2.5 py-1 bg-amber-600 text-white rounded text-xs font-bold font-mono">
                    {selectedReturn.returnType}
                  </span>
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Datos de la Operación
                  </h4>
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-slate-400">Fecha de Despacho Original:</span>
                      <p className="font-semibold text-slate-800 mt-0.5">
                        {formatDate(selectedReturn.dispatchHeader.dispatchDate)}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-400">Fecha de Reingreso Físico:</span>
                      <p className="font-semibold text-slate-800 mt-0.5">
                        {formatDate(selectedReturn.returnDate)}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {formatDateLong(selectedReturn.returnDate)}
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 text-xs">
                    <span className="text-slate-400">Motivo de la Devolución:</span>
                    <p className="text-slate-800 font-medium mt-0.5 bg-slate-50 p-2 rounded border border-slate-200">
                      {selectedReturn.reason}
                    </p>
                  </div>

                  {selectedReturn.observations && (
                    <div className="pt-1 text-xs">
                      <span className="text-slate-400">Observaciones:</span>
                      <p className="text-slate-600 mt-0.5 italic">{selectedReturn.observations}</p>
                    </div>
                  )}
                </div>

                {/* Líneas Devueltas */}
                <div className="space-y-3 pt-4 border-t border-slate-100">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Líneas y Cantidades Reincorporadas
                  </h4>
                  <div className="space-y-2">
                    {(selectedReturn.returnDetails || []).map((det) => {
                      const fallback = dispatchLinesLookup[det.dispatchDetailId];
                      const prodName =
                        det.dispatchDetail?.product?.name ||
                        det.product?.name ||
                        fallback?.productName ||
                        'Polín';
                      const prodDimensions =
                        det.dispatchDetail?.dimensions ||
                        det.dispatchDetail?.product?.dimensions ||
                        det.product?.dimensions ||
                        fallback?.dimensions ||
                        '';
                      const productionLot =
                        det.dispatchDetail?.dailyProduction?.productionLot ||
                        fallback?.productionLot ||
                        'Sin lote registrado';
                      const qtyDispatched =
                        det.dispatchDetail?.quantityDispatched ??
                        fallback?.quantityDispatched ??
                        '-';

                      return (
                        <div
                          key={det.id}
                          className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1.5"
                        >
                          <div className="flex items-center justify-between font-semibold text-slate-900">
                            <span>
                              {prodName} {prodDimensions ? `(${prodDimensions})` : ''}
                            </span>
                            <span className="font-bold text-amber-700 text-sm">
                              +{det.quantityReturned} pcs
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-slate-500">
                            <span className="flex items-center gap-1">
                              <span>Lote de producción:</span>
                              <strong className="font-mono text-blue-700 font-bold bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                                {productionLot}
                              </strong>
                            </span>
                            <span>
                              Despachadas en origen: <strong className="text-slate-700">{qtyDispatched} pcs</strong>
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Auditoría */}
                <div className="space-y-2 pt-4 border-t border-slate-100 text-xs">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Trazabilidad e Inmutabilidad
                  </h4>
                  <p className="text-slate-500">
                    Receptor autorizado:{' '}
                    <strong className="text-slate-700">
                      {selectedReturn.registeredBy?.fullName || 'Sistema'}
                    </strong>
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Registrado el: {formatDateTime(selectedReturn.createdAt).full}
                  </p>
                  <div className="p-2.5 rounded bg-slate-100 text-[11px] text-slate-600 border border-slate-200 mt-2">
                    🔒 Operación no destructiva (RN-013). La remisión original conserva su valor histórico y se emitió un movimiento de reingreso al Kardex (RN-010).
                  </div>
                </div>
              </div>
            )}
          </Drawer>

      {/* Modal de Registro de Devolución */}
      <Dialog
        isOpen={isCreateModalOpen}
        onClose={() => !isSubmitting && setIsCreateModalOpen(false)}
        size="xl"
        headerVariant="industrial"
        subtitle="Operación M08 — Reingreso a Patio"
        title="Registrar Devolución Comercial de Polines"
      >
        <form onSubmit={handleSubmitCreate} className="flex flex-col">
          {/* Cuerpo del Formulario con respiro perimetral */}
          <div className="px-6 sm:px-8 py-6 space-y-6 max-h-[75vh] overflow-y-auto pr-4 sm:pr-6">
            {formError && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Aviso de Inmutabilidad */}
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl text-xs text-amber-900 flex items-start gap-3">
              <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span className="leading-relaxed">
                <strong>Regla de Inmutabilidad (RN-013):</strong> El despacho original no será modificado ni sobreescrito. Esta operación registra un nuevo evento de devolución que reincorpora existencias al inventario.
              </span>
            </div>

            {/* Despacho Original */}
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-600">
                Factura de Despacho Original *
              </label>
              <select
                value={selectedDispatchId}
                onChange={(e) => handleDispatchSelectChange(e.target.value)}
                className="w-full text-sm bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none font-mono min-h-[40px]"
                required
              >
                <option value="">-- Seleccione una remisión o factura emitida --</option>
                {eligibleDispatches.map((disp) => (
                  <option key={disp.id} value={disp.id}>
                    {disp.invoiceNumber} — {disp.clientCenterName} ({formatDate(disp.dispatchDate)})
                  </option>
                ))}
              </select>
              {activeDispatch && (
                <div className="mt-3 p-3.5 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-[#1D71CB] shrink-0" />
                    <span className="text-slate-700">
                      Destino original:{' '}
                      <strong className="text-slate-900 font-semibold">
                        {activeDispatch.clientCenterName}
                      </strong>
                      {activeDispatch.clientCenter?.code && (
                        <span className="ml-1 text-slate-500 font-mono">
                          ({activeDispatch.clientCenter.code})
                        </span>
                      )}
                    </span>
                  </div>
                  <span className="text-blue-700 bg-blue-100/70 px-2.5 py-1 rounded font-mono text-[11px]">
                    Despachado: {formatDate(activeDispatch.dispatchDate)}
                  </span>
                </div>
              )}
            </div>

            {/* Fecha de Devolución */}
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-600">
                Fecha de Devolución / Reingreso Físico *
              </label>
              <input
                type="date"
                max={getTodayCalendarDate()}
                min={activeDispatch ? getCalendarDate(activeDispatch.dispatchDate) : undefined}
                value={formReturnDate}
                onChange={(e) => setFormReturnDate(e.target.value)}
                className="w-full text-sm bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none min-h-[40px]"
                required
              />
            </div>

            {/* Motivo */}
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-600">
                Motivo de la Devolución *
              </label>
              <input
                type="text"
                placeholder="Ej: Rechazo por exceso de humedad / defecto de aserrío"
                maxLength={255}
                value={formReason}
                onChange={(e) => setFormReason(e.target.value)}
                className="w-full text-sm bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none min-h-[40px]"
                required
              />
            </div>

            {/* Líneas a Devolver */}
            {activeDispatch && activeDispatch.lines.length > 0 && (
              <div className="pt-2 border-t border-slate-200 space-y-3">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Piezas a Devolver por Línea de Producto *
                </label>
                <div className="space-y-3">
                  {activeDispatch.lines.map((line) => (
                    <div
                      key={line.id}
                      className="p-4 sm:p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-3"
                    >
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
                        <span>{line.productName} ({line.dimensions})</span>
                        <span className="font-mono text-blue-600 text-[11px]">
                          {line.productionLot}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-[11px] text-slate-500">
                        <div>Despachadas: <strong>{line.quantityDispatched}</strong></div>
                        <div>Devueltas previas: <strong>{line.quantityReturnedAccumulated}</strong></div>
                        <div className="text-emerald-700 font-semibold">
                          Saldo: <strong>{line.availableToReturn}</strong>
                        </div>
                      </div>

                      <div>
                        <label className="mb-1.5 block text-[11px] font-semibold text-slate-700">
                          Cantidad a devolver ahora (máx. {line.availableToReturn}):
                        </label>
                        <input
                          type="number"
                          min="0"
                          max={line.availableToReturn}
                          step="1"
                          placeholder="0"
                          disabled={line.availableToReturn <= 0}
                          value={returnQuantities[line.id] || ''}
                          onChange={(e) =>
                            setReturnQuantities((prev) => ({
                              ...prev,
                              [line.id]: e.target.value,
                            }))
                          }
                          className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-amber-500 focus:outline-none font-mono min-h-[38px]"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Observaciones */}
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-600">
                Observaciones Técnicas (Opcional)
              </label>
              <textarea
                rows={2}
                placeholder="Detalles sobre inspección, patio de depósito o reclamo..."
                value={formObservations}
                onChange={(e) => setFormObservations(e.target.value)}
                className="w-full text-sm bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Modal Actions Footer */}
          <div className="px-6 sm:px-8 py-4 bg-slate-50/80 border-t border-slate-100 flex flex-col-reverse sm:flex-row justify-end items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(false)}
              disabled={isSubmitting}
              className="w-full sm:w-auto px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition min-h-[40px] cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto px-5 py-2.5 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-lg shadow-sm transition disabled:opacity-50 flex items-center justify-center gap-2 min-h-[40px] cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <span className="animate-spin text-xs">⏳</span>
                  <span>Registrando Devolución...</span>
                </>
              ) : (
                <span>Guardar Devolución</span>
              )}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
