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
  Truck,
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
  Trash2,
  Layers,
  RotateCcw,
  AlertTriangle,
  Package,
} from 'lucide-react';
import {
  formatDate,
  formatTime,
  formatDateLong,
  formatDateTime,
} from '@/lib/date-formatters';
import { Dialog, Drawer } from '@/components/ui/dialog';

interface ClientCenterOption {
  id: string;
  name: string;
  location: string | null;
  isActive: boolean;
}

interface ProductOption {
  id: string;
  name: string;
  dimensions: string;
}

interface ProductionLotOption {
  id: string;
  productionLot: string;
  productionDate: string;
  productId?: string;
  quantityProduced?: number;
  product?: {
    id?: string;
    name: string;
    dimensions: string;
  };
  productionDetails?: Array<{
    id: string;
    productId: string;
    product: {
      id: string;
      name: string;
      dimensions: string;
    };
    quantityProduced: number;
  }>;
}

interface DispatchDetailItem {
  id: string;
  productId: string;
  product: {
    id: string;
    name: string;
    dimensions: string;
  };
  dailyProductionId: string;
  dailyProduction: {
    id: string;
    productionLot: string;
  };
  quantityDispatched: number;
  quantityReturnedAccumulated: number;
  dimensions: string;
}

interface DispatchRecord {
  id: string;
  invoiceNumber: string;
  dispatchDate: string;
  dispatchTime: string;
  clientCenterId: string;
  clientCenter: {
    id: string;
    name: string;
    location: string | null;
  };
  vehicleInfo: string | null;
  driverName: string | null;
  observations: string | null;
  status: 'COMPLETED' | 'RETURNED_PARTIAL' | 'RETURNED_TOTAL';
  createdById?: string;
  createdBy?: {
    fullName: string;
    email: string;
  };
  dispatchDetails: DispatchDetailItem[];
  createdAt: string;
}

interface NewDetailLine {
  id: string;
  dailyProductionId: string;
  productId: string;
  quantityDispatched: string;
  acknowledgedExcess?: boolean;
}

interface ExcessWarningData {
  lineIndex: number;
  lotLabel: string;
  productName: string;
  quantityProduced: number;
  quantityDispatched: number;
  difference: number;
}

export default function DispatchesPage() {
  const { role, session } = useAuth();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

  // Operational Data
  const [dispatches, setDispatches] = useState<DispatchRecord[]>([]);
  const [clientCenters, setClientCenters] = useState<ClientCenterOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [productionLots, setProductionLots] = useState<ProductionLotOption[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCenterFilter, setSelectedCenterFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Reset pagination to page 1 on filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCenterFilter, startDate, endDate]);

  // Modal Create
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [formInvoiceNumber, setFormInvoiceNumber] = useState('');
  const [formClientCenterId, setFormClientCenterId] = useState('');
  const [formDispatchDate, setFormDispatchDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [formDispatchTime, setFormDispatchTime] = useState(() => {
    const now = new Date();
    return now.toTimeString().split(' ')[0].substring(0, 5); // HH:mm
  });
  const [formDriverName, setFormDriverName] = useState('');
  const [formVehicleInfo, setFormVehicleInfo] = useState('');
  const [formObservations, setFormObservations] = useState('');

  // Multi-product lines
  const [detailLines, setDetailLines] = useState<NewDetailLine[]>([
    {
      id: 'line-init',
      dailyProductionId: '',
      productId: '',
      quantityDispatched: '',
      acknowledgedExcess: false,
    },
  ]);

  // Warning Modal for quantity exceeding production
  const [excessWarning, setExcessWarning] = useState<ExcessWarningData | null>(null);

  // Drawer / Detail Modal
  const [selectedDispatch, setSelectedDispatch] = useState<DispatchRecord | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const isMutationAllowed = role === 'ADMIN' || role === 'CONTABILIDAD';

  // Keyboard Escape listener for excess warning
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && excessWarning) {
        e.stopPropagation();
        setExcessWarning(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [excessWarning]);

  // Load dispatches & catalogs
  const loadData = async () => {
    if (!session?.access_token) return;
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const headers = { Authorization: `Bearer ${session.access_token}` };

      const [resDisp, resCenters, resProds, resLots] = await Promise.all([
        fetch(`${apiUrl}/dispatches?limit=0`, { headers }),
        fetch(`${apiUrl}/catalog/client-centers?includeInactive=false`, { headers }),
        fetch(`${apiUrl}/catalog/products?includeInactive=false`, { headers }),
        fetch(`${apiUrl}/daily-productions?limit=0`, { headers }),
      ]);

      if (!resDisp.ok) {
        throw new Error('Error al consultar el historial de despachos');
      }

      const [jsonDisp, jsonCenters, jsonProds, jsonLots] = await Promise.all([
        resDisp.json(),
        resCenters.json(),
        resProds.json(),
        resLots.json(),
      ]);

      setDispatches(jsonDisp.data || []);
      setClientCenters(jsonCenters.data || []);
      setProducts(jsonProds.data || []);
      setProductionLots(jsonLots.data || []);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error de conexión con el servidor');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [session?.access_token]);

  // Filtered and sorted dispatches
  const filteredDispatches = useMemo(() => {
    return dispatches.filter((d) => {
      const matchesSearch =
        !searchTerm ||
        d.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.clientCenter.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (d.driverName && d.driverName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (d.vehicleInfo && d.vehicleInfo.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesCenter =
        !selectedCenterFilter || d.clientCenterId === selectedCenterFilter;

      const matchesStart = !startDate || d.dispatchDate >= startDate;
      const matchesEnd = !endDate || d.dispatchDate <= endDate;

      return matchesSearch && matchesCenter && matchesStart && matchesEnd;
    }).sort((a, b) => {
      const dateA = new Date(a.dispatchDate).getTime() || 0;
      const dateB = new Date(b.dispatchDate).getTime() || 0;
      if (dateB !== dateA) return dateB - dateA;
      const createdA = new Date(a.createdAt).getTime() || 0;
      const createdB = new Date(b.createdAt).getTime() || 0;
      if (createdB !== createdA) return createdB - createdA;
      return (b.id || '').localeCompare(a.id || '');
    });
  }, [dispatches, searchTerm, selectedCenterFilter, startDate, endDate]);

  // Paginated dispatches
  const paginatedDispatches = useMemo(() => {
    if (pageSize === 0) return filteredDispatches;
    const startIndex = (currentPage - 1) * pageSize;
    return filteredDispatches.slice(startIndex, startIndex + pageSize);
  }, [filteredDispatches, currentPage, pageSize]);

  // Helper to extract products actually produced in a given lot
  const getProductsForLot = (lotId: string) => {
    if (!lotId) return [];
    const lot = productionLots.find((l) => l.id === lotId);
    if (!lot) return [];

    if (lot.productionDetails && lot.productionDetails.length > 0) {
      return lot.productionDetails.map((pd) => ({
        id: pd.productId,
        name: pd.product?.name || 'Polín',
        dimensions: pd.product?.dimensions || '',
        quantityProduced: pd.quantityProduced,
      }));
    }

    if (lot.productId && lot.product) {
      return [
        {
          id: lot.productId,
          name: lot.product.name,
          dimensions: lot.product.dimensions,
          quantityProduced: lot.quantityProduced ?? 0,
        },
      ];
    }

    return [];
  };

  // Helper to get quantity produced for lot + product
  const getQuantityProduced = (lotId: string, productId: string): number | null => {
    if (!lotId || !productId) return null;
    const prods = getProductsForLot(lotId);
    const item = prods.find((p) => p.id === productId);
    return item ? item.quantityProduced : null;
  };

  // Helper for lot label to distinguish duplicate visible lot names by ID and products
  const getLotSummaryLabel = (lot: ProductionLotOption) => {
    const prods = getProductsForLot(lot.id);
    let prodsSummary = '';
    if (prods.length === 1) {
      prodsSummary = `${prods[0].name} (${prods[0].dimensions})`;
    } else if (prods.length > 1) {
      prodsSummary = prods.map((p) => `${p.dimensions || p.name}`).join(', ');
    }
    return `${lot.productionLot}${prodsSummary ? ` — ${prodsSummary}` : ''} (${formatDate(lot.productionDate)})`;
  };

  // Total pieces to dispatch across all lines
  const totalPiecesToDispatch = useMemo(() => {
    return detailLines.reduce((sum, line) => {
      const q = parseInt(line.quantityDispatched, 10);
      return sum + (isNaN(q) || q <= 0 ? 0 : q);
    }, 0);
  }, [detailLines]);

  // Open Create Modal (FASE H - clean initial state)
  const handleOpenCreateModal = () => {
    setFormError(null);
    setFormInvoiceNumber('');
    setFormClientCenterId(clientCenters[0]?.id || '');
    setFormDispatchDate(new Date().toISOString().split('T')[0]);
    setFormDispatchTime(new Date().toTimeString().split(' ')[0].substring(0, 5));
    setFormDriverName('');
    setFormVehicleInfo('');
    setFormObservations('');
    setExcessWarning(null);

    setDetailLines([
      {
        id: `line-${Date.now()}-0`,
        dailyProductionId: '',
        productId: '',
        quantityDispatched: '',
        acknowledgedExcess: false,
      },
    ]);
    setIsCreateModalOpen(true);
  };

  // Add line item
  const handleAddLine = () => {
    setDetailLines((prev) => [
      ...prev,
      {
        id: `line-${Date.now()}-${prev.length}`,
        dailyProductionId: '',
        productId: '',
        quantityDispatched: '',
        acknowledgedExcess: false,
      },
    ]);
  };

  // Remove line item
  const handleRemoveLine = (index: number) => {
    if (detailLines.length <= 1) return;
    setDetailLines((prev) => prev.filter((_, i) => i !== index));
  };

  // Handle lot change (Resets product, quantity, and excess flag - FASE G)
  const handleLineLotChange = (index: number, lotId: string) => {
    setDetailLines((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        dailyProductionId: lotId,
        productId: '',           // RESET producto (FASE G)
        quantityDispatched: '',  // RESET cantidad (FASE G)
        acknowledgedExcess: false,
      };
      return copy;
    });
  };

  // Handle product change (Resets quantity and excess flag - FASE G)
  const handleLineProductChange = (index: number, prodId: string) => {
    setDetailLines((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        productId: prodId,
        quantityDispatched: '',  // RESET cantidad (FASE G)
        acknowledgedExcess: false,
      };
      return copy;
    });
  };

  // Handle quantity change (Resets excess flag on edit)
  const handleLineQuantityChange = (index: number, val: string) => {
    setDetailLines((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        quantityDispatched: val,
        acknowledgedExcess: false,
      };
      return copy;
    });
  };

  // Handle quantity blur (Checks if exceeded and triggers warning alert)
  const handleQuantityBlur = (index: number) => {
    const line = detailLines[index];
    if (!line.dailyProductionId || !line.productId || !line.quantityDispatched) return;
    const qty = parseInt(line.quantityDispatched, 10);
    if (isNaN(qty) || qty <= 0) return;

    const qtyProduced = getQuantityProduced(line.dailyProductionId, line.productId);
    if (qtyProduced !== null && qty > qtyProduced && !line.acknowledgedExcess) {
      const lot = productionLots.find((l) => l.id === line.dailyProductionId);
      const prods = getProductsForLot(line.dailyProductionId);
      const prod = prods.find((p) => p.id === line.productId);
      const prodName = prod ? `${prod.name} (${prod.dimensions})` : 'Polín';
      setExcessWarning({
        lineIndex: index,
        lotLabel: lot?.productionLot || '',
        productName: prodName,
        quantityProduced: qtyProduced,
        quantityDispatched: qty,
        difference: qty - qtyProduced,
      });
    }
  };

  // Cancel warning alert (Closes only alert, preserves modal and line data)
  const handleCancelWarning = () => {
    setExcessWarning(null);
  };

  // Proceed warning alert (Approves excess for line and closes alert)
  const handleProceedWarning = () => {
    if (!excessWarning) return;
    const targetIdx = excessWarning.lineIndex;
    setDetailLines((prev) =>
      prev.map((l, i) => (i === targetIdx ? { ...l, acknowledgedExcess: true } : l)),
    );
    setExcessWarning(null);
  };

  // Submit Create Dispatch
  const handleSubmitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formInvoiceNumber.trim()) {
      setFormError('El número de factura / remisión es obligatorio.');
      return;
    }

    if (!formClientCenterId) {
      setFormError('Debe seleccionar el centro cliente de destino.');
      return;
    }

    if (detailLines.length === 0) {
      setFormError('Debe incluir al menos una línea de producto a despachar.');
      return;
    }

    // Validate details
    const parsedDetails = [];
    for (let i = 0; i < detailLines.length; i++) {
      const line = detailLines[i];
      if (!line.dailyProductionId) {
        setFormError(`Línea ${i + 1}: Debe seleccionar el lote de producción de origen.`);
        return;
      }
      if (!line.productId) {
        setFormError(`Línea ${i + 1}: Debe seleccionar el producto.`);
        return;
      }
      const qty = parseInt(line.quantityDispatched, 10);
      if (isNaN(qty) || qty <= 0) {
        setFormError(`Línea ${i + 1}: La cantidad a despachar debe ser un entero mayor a cero.`);
        return;
      }

      // Check if quantity exceeds recorded production and is not yet acknowledged
      const qtyProduced = getQuantityProduced(line.dailyProductionId, line.productId);
      if (qtyProduced !== null && qty > qtyProduced && !line.acknowledgedExcess) {
        const lot = productionLots.find((l) => l.id === line.dailyProductionId);
        const prods = getProductsForLot(line.dailyProductionId);
        const prod = prods.find((p) => p.id === line.productId);
        const prodName = prod ? `${prod.name} (${prod.dimensions})` : 'Polín';
        setExcessWarning({
          lineIndex: i,
          lotLabel: lot?.productionLot || '',
          productName: prodName,
          quantityProduced: qtyProduced,
          quantityDispatched: qty,
          difference: qty - qtyProduced,
        });
        return;
      }

      parsedDetails.push({
        productId: line.productId,
        dailyProductionId: line.dailyProductionId,
        quantityDispatched: qty,
      });
    }

    try {
      setIsSubmitting(true);
      const payload = {
        invoiceNumber: formInvoiceNumber.trim(),
        clientCenterId: formClientCenterId,
        dispatchDate: formDispatchDate,
        dispatchTime: formDispatchTime,
        vehicleInfo: formVehicleInfo.trim() || undefined,
        driverName: formDriverName.trim() || undefined,
        observations: formObservations.trim() || undefined,
        details: parsedDetails,
      };

      const res = await fetch(`${apiUrl}/dispatches`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      const resJson = await res.json();

      if (!res.ok) {
        throw new Error(resJson.message || 'Error al registrar el despacho comercial.');
      }

      setSuccessMessage(
        `Despacho registrado correctamente con Factura '${formInvoiceNumber.trim()}'. Stock deducido del Kardex.`,
      );
      setTimeout(() => setSuccessMessage(null), 7000);
      setCurrentPage(1);
      setIsCreateModalOpen(false);
      setExcessWarning(null);
      loadData();
    } catch (err: any) {
      setFormError(err.message || 'Error de conexión al registrar el despacho.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenDetail = (disp: DispatchRecord) => {
    setSelectedDispatch(disp);
    setIsDrawerOpen(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Despachado
          </span>
        );
      case 'RETURNED_PARTIAL':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded border border-amber-200">
            <RotateCcw className="w-3 h-3 text-amber-600" />
            Devolución Parcial
          </span>
        );
      case 'RETURNED_TOTAL':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-800 bg-rose-100 px-2.5 py-0.5 rounded border border-rose-200">
            <RotateCcw className="w-3 h-3 text-rose-600" />
            Devolución Total
          </span>
        );
      default:
        return <span className="text-xs text-slate-500">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-3">
            <PageTitle>Despachos y Salidas Comerciales</PageTitle>
            <Badge variant="default">M07: Salidas / Despachos</Badge>
          </div>
          <MutedText>
            Expedición de producto terminado con deducción atómica de existencias, control multi-producto y facturas inmutables.
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
              <span>+ Registrar Despacho</span>
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
            placeholder="Buscar por N° de factura, cliente, chofer o placa..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
          />
        </div>

        <div className="w-full md:w-56">
          <select
            value={selectedCenterFilter}
            onChange={(e) => setSelectedCenterFilter(e.target.value)}
            className="w-full py-2 px-3 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
          >
            <option value="">Todas las Plantas Cliente</option>
            {clientCenters.map((cc) => (
              <option key={cc.id} value={cc.id}>
                {cc.name}
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

      {/* Dispatches Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : filteredDispatches.length === 0 ? (
          <div className="p-12">
            <EmptyState
              title="No se encontraron remisiones o facturas de despacho"
              description={
                searchTerm || selectedCenterFilter || startDate || endDate
                  ? 'No hay registros que coincidan con los filtros aplicados.'
                  : 'Aún no se han registrado despachos comerciales de polines.'
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Factura / Remisión</th>
                  <th className="py-3 px-4">Fecha & Hora</th>
                  <th className="py-3 px-4">Planta Destino</th>
                  <th className="py-3 px-4 text-right">Total Piezas</th>
                  <th className="py-3 px-4">Líneas de Producto</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4">Transporte</th>
                  <th className="py-3 px-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedDispatches.map((d) => {
                  const totalPieces = d.dispatchDetails.reduce(
                    (sum, item) => sum + item.quantityDispatched,
                    0,
                  );
                  return (
                    <tr key={d.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {d.invoiceNumber}
                      </td>
                      <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                        <div className="font-medium">{formatDate(d.dispatchDate)}</div>
                        <div className="text-xs text-slate-400 font-mono">{formatTime(d.dispatchTime)}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{d.clientCenter.name}</div>
                        {d.clientCenter.location && (
                          <div className="text-xs text-slate-500">{d.clientCenter.location}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <span className="font-bold text-slate-900 text-base">
                          {totalPieces.toLocaleString('es-NI')}
                        </span>{' '}
                        <span className="text-xs font-medium text-slate-500">pcs</span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-col gap-1 max-w-xs">
                          {d.dispatchDetails.map((det) => (
                            <div key={det.id} className="text-xs flex items-center justify-between">
                              <span className="text-slate-700">
                                {det.product.name} ({det.quantityDispatched} pcs)
                              </span>
                              <span className="text-[10px] font-mono text-blue-600 bg-blue-50 px-1 py-0.5 rounded border border-blue-100">
                                {det.dailyProduction.productionLot}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {getStatusBadge(d.status)}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600">
                        {d.driverName ? <div>Chofer: {d.driverName}</div> : null}
                        {d.vehicleInfo ? <div>Placa: {d.vehicleInfo}</div> : null}
                        {!d.driverName && !d.vehicleInfo ? (
                          <span className="text-slate-400 italic">No especificado</span>
                        ) : null}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleOpenDetail(d)}
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

        {filteredDispatches.length > 0 && (
          <TablePagination
            currentPage={currentPage}
            totalItems={filteredDispatches.length}
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
        isOpen={isDrawerOpen && !!selectedDispatch}
        onClose={() => setIsDrawerOpen(false)}
        subtitle="Despacho Comercial Inmutable"
        title={selectedDispatch?.invoiceNumber}
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
        {selectedDispatch && (
          <div className="space-y-6">
            <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 font-semibold">Destino Comercial</p>
                <p className="text-base font-bold text-slate-900 mt-0.5">
                  {selectedDispatch.clientCenter.name}
                </p>
                {selectedDispatch.clientCenter.location && (
                  <p className="text-xs text-slate-500">{selectedDispatch.clientCenter.location}</p>
                )}
              </div>
              <div>{getStatusBadge(selectedDispatch.status)}</div>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Datos del Despacho
              </h4>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-400">Fecha de Despacho:</span>
                  <p className="font-semibold text-slate-800 mt-0.5">
                    {formatDate(selectedDispatch.dispatchDate)}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {formatDateLong(selectedDispatch.dispatchDate)}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Hora de Salida:</span>
                  <p className="font-mono font-semibold text-slate-800 mt-0.5">
                    {formatTime(selectedDispatch.dispatchTime)}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Chofer:</span>
                  <p className="text-slate-800 mt-0.5">
                    {selectedDispatch.driverName || 'No indicado'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Vehículo / Placa:</span>
                  <p className="text-slate-800 mt-0.5">
                    {selectedDispatch.vehicleInfo || 'No indicado'}
                  </p>
                </div>
              </div>

              {selectedDispatch.observations && (
                <div className="pt-2 text-xs">
                  <span className="text-slate-400">Observaciones:</span>
                  <p className="text-slate-700 mt-0.5 italic">{selectedDispatch.observations}</p>
                </div>
              )}
            </div>

            {/* Líneas de detalle */}
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Líneas de Producto Despachadas
              </h4>
              <div className="space-y-2">
                {selectedDispatch.dispatchDetails.map((det) => {
                  const remanente =
                    det.quantityDispatched - det.quantityReturnedAccumulated;
                  return (
                    <div
                      key={det.id}
                      className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between font-semibold text-slate-900">
                        <span>{det.product.name} ({det.product.dimensions})</span>
                        <span className="font-bold text-base">
                          {det.quantityDispatched} pcs
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>
                          Lote de origen:{' '}
                          <strong className="font-mono text-blue-600">
                            {det.dailyProduction.productionLot}
                          </strong>
                        </span>
                        {det.quantityReturnedAccumulated > 0 ? (
                          <span className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                            Devueltas: {det.quantityReturnedAccumulated} pcs | Saldo: {remanente} pcs
                          </span>
                        ) : (
                          <span className="text-emerald-700">Sin devoluciones</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Auditoría */}
            <div className="space-y-2 pt-4 border-t border-slate-100 text-xs">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Auditoría Técnica
              </h4>
              <p className="text-slate-500">
                Registrado por:{' '}
                <strong className="text-slate-700">
                  {selectedDispatch.createdBy?.fullName || 'Sistema'}
                </strong>
              </p>
              <p className="text-[11px] text-slate-400">
                Timestamp: {formatDateTime(selectedDispatch.createdAt).full}
              </p>
              <div className="p-2.5 rounded bg-slate-100 text-[11px] text-slate-600 border border-slate-200 mt-2">
                🔒 Factura y remisión comercial inmutable (RN-001). Toda reincorporación de producto se ejecuta a través del módulo de Devoluciones (RN-013).
              </div>
            </div>
          </div>
        )}
      </Drawer>

      {/* Modal de Registro de Despacho */}
      <Dialog
        isOpen={isCreateModalOpen}
        onClose={() => !isSubmitting && setIsCreateModalOpen(false)}
        size="xl"
        headerVariant="industrial"
        subtitle="Operación M07 — Salida y Facturación"
        title="Registrar Salida / Despacho de Producto Terminado"
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

            {/* Cabecera del Despacho */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-600">
                  N° de Factura / Remisión *
                </label>
                <input
                  type="text"
                  placeholder="Ej: F-90210"
                  maxLength={100}
                  value={formInvoiceNumber}
                  onChange={(e) => setFormInvoiceNumber(e.target.value)}
                  className="w-full text-sm bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono min-h-[40px]"
                  required
                />
                <span className="text-[10px] text-slate-400 mt-1 block">Referencia documental única</span>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Planta Cliente de Destino *
                </label>
                <select
                  value={formClientCenterId}
                  onChange={(e) => setFormClientCenterId(e.target.value)}
                  className="w-full text-sm bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none min-h-[40px]"
                  required
                >
                  <option value="">-- Seleccione centro de acopio / cliente --</option>
                  {clientCenters.map((cc) => (
                    <option key={cc.id} value={cc.id}>
                      {cc.name} {cc.location ? `(${cc.location})` : ''}
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-slate-400 mt-1 block">Destino físico del envío</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 sm:gap-6">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Fecha de Despacho *
                </label>
                <input
                  type="date"
                  max={new Date().toISOString().split('T')[0]}
                  value={formDispatchDate}
                  onChange={(e) => setFormDispatchDate(e.target.value)}
                  className="w-full text-sm bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none min-h-[40px]"
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Hora *
                </label>
                <input
                  type="time"
                  value={formDispatchTime}
                  onChange={(e) => setFormDispatchTime(e.target.value)}
                  className="w-full text-sm bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none min-h-[40px]"
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Vehículo / Placa
                </label>
                <input
                  type="text"
                  placeholder="Ej: Camión M 123-456"
                  maxLength={100}
                  value={formVehicleInfo}
                  onChange={(e) => setFormVehicleInfo(e.target.value)}
                  className="w-full text-sm bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono min-h-[40px]"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Conductor / Chofer
                </label>
                <input
                  type="text"
                  placeholder="Nombre del chofer"
                  maxLength={100}
                  value={formDriverName}
                  onChange={(e) => setFormDriverName(e.target.value)}
                  className="w-full text-sm bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none min-h-[40px]"
                />
              </div>
            </div>

            {/* Líneas de Despacho (Multi-Producto / Multi-Lote) */}
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-blue-600" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Detalle de Productos a Despachar
                  </h4>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-slate-500">
                    Total: <strong className="text-slate-900">{totalPiecesToDispatch.toLocaleString()}</strong> pcs
                  </span>
                  <button
                    type="button"
                    onClick={handleAddLine}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg transition min-h-[36px] cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Agregar Línea</span>
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {detailLines.map((line, idx) => {
                  const lotProducts = getProductsForLot(line.dailyProductionId);
                  const qtyProduced = getQuantityProduced(line.dailyProductionId, line.productId);

                  return (
                    <div
                      key={line.id}
                      className="p-4 sm:p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-3 relative"
                    >
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                        <span className="flex items-center gap-2">
                          <span>Ítem #{idx + 1}</span>
                          {line.acknowledgedExcess && (
                            <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-normal border border-amber-200">
                              ⚠ Exceso de producción aprobado
                            </span>
                          )}
                        </span>
                        {detailLines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(idx)}
                            className="text-rose-600 hover:text-rose-800 p-1.5 rounded hover:bg-rose-50 transition cursor-pointer"
                            title="Eliminar esta línea"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* 1. Lote de Producción * */}
                        <div>
                          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                            Lote de Producción *
                          </label>
                          <select
                            value={line.dailyProductionId}
                            onChange={(e) => handleLineLotChange(idx, e.target.value)}
                            className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2 font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none min-h-[38px]"
                            required
                          >
                            <option value="">-- Seleccione lote --</option>
                            {productionLots.map((l) => (
                              <option key={l.id} value={l.id}>
                                {getLotSummaryLabel(l)}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* 2. Producto * */}
                        <div>
                          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                            Producto *
                          </label>
                          <select
                            value={line.productId}
                            onChange={(e) => handleLineProductChange(idx, e.target.value)}
                            disabled={!line.dailyProductionId}
                            className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400 min-h-[38px]"
                            required
                          >
                            {!line.dailyProductionId ? (
                              <option value="">-- Primero seleccione un lote --</option>
                            ) : (
                              <>
                                <option value="">-- Seleccione producto --</option>
                                {lotProducts.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name} ({p.dimensions})
                                  </option>
                                ))}
                              </>
                            )}
                          </select>
                        </div>

                        {/* 3. Cantidad a Despachar * */}
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                              Cantidad a Despachar *
                            </label>
                            {line.dailyProductionId && line.productId && qtyProduced !== null && (
                              <span className="text-[10px] text-slate-500 font-mono">
                                Prod: <strong className="text-slate-700">{qtyProduced}</strong> pcs
                              </span>
                            )}
                          </div>
                          <input
                            type="number"
                            min="1"
                            placeholder="0"
                            value={line.quantityDispatched}
                            onChange={(e) => handleLineQuantityChange(idx, e.target.value)}
                            onBlur={() => handleQuantityBlur(idx)}
                            className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2 font-mono text-right focus:ring-2 focus:ring-blue-500 focus:outline-none min-h-[38px]"
                            required
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Observaciones Generales */}
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-600">
                Observaciones Técnicas (Opcional)
              </label>
              <textarea
                rows={2}
                placeholder="Detalles sobre precintos, condiciones del camión, instrucciones de entrega..."
                value={formObservations}
                onChange={(e) => setFormObservations(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
              className="w-full sm:w-auto px-5 py-2.5 text-xs font-semibold bg-[#1D71CB] hover:bg-[#165ba3] text-white rounded-lg shadow-sm transition disabled:opacity-50 flex items-center justify-center gap-2 min-h-[40px] cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <span className="animate-spin text-xs">⏳</span>
                  <span>Validando y Guardando...</span>
                </>
              ) : (
                <span>Guardar Despacho</span>
              )}
            </button>
          </div>
        </form>
      </Dialog>

      {/* Modal de Advertencia por Cantidad Superior a la Producción (FASE C, I) */}
      <Dialog
        isOpen={!!excessWarning}
        onClose={handleCancelWarning}
        layer="nested"
        size="sm"
        showCloseButton={false}
      >
        {excessWarning && (
          <div className="overflow-hidden">
            <div className="px-6 sm:px-7 py-5 bg-amber-50/70 border-b border-amber-200/80 flex items-start gap-4">
              <div className="p-2.5 bg-amber-100 text-amber-800 rounded-xl border border-amber-200 flex-shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 id="excess-warning-title" className="text-base font-bold text-slate-900 leading-tight">
                  Cantidad superior a la producción registrada
                </h3>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  Estás intentando despachar{' '}
                  <strong className="text-slate-900 font-mono">{excessWarning.quantityDispatched}</strong>{' '}
                  unidades de <strong className="text-slate-900">{excessWarning.productName}</strong> del lote{' '}
                  <strong className="text-slate-900 font-mono">{excessWarning.lotLabel}</strong>.
                </p>
              </div>
            </div>

            <div className="px-6 sm:px-7 py-6 space-y-4 bg-white">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 grid grid-cols-3 gap-3 text-center text-xs">
                <div className="p-2.5 bg-white rounded-lg border border-slate-100 shadow-2xs">
                  <span className="block text-[10px] text-slate-500 uppercase font-semibold">Producida</span>
                  <span className="text-base font-bold font-mono text-slate-800 mt-0.5">{excessWarning.quantityProduced}</span>
                </div>
                <div className="p-2.5 bg-white rounded-lg border border-slate-100 shadow-2xs">
                  <span className="block text-[10px] text-slate-500 uppercase font-semibold">Solicitada</span>
                  <span className="text-base font-bold font-mono text-amber-700 mt-0.5">{excessWarning.quantityDispatched}</span>
                </div>
                <div className="p-2.5 bg-amber-50/70 rounded-lg border border-amber-200 shadow-2xs">
                  <span className="block text-[10px] text-amber-800 uppercase font-semibold">Diferencia</span>
                  <span className="text-base font-bold font-mono text-amber-800 mt-0.5">+{excessWarning.difference}</span>
                </div>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                La cantidad a despachar supera la cantidad producida registrada para este lote.
                ¿Deseas proceder?
              </p>

              <div className="pt-4 border-t border-slate-100 flex flex-col-reverse sm:flex-row items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCancelWarning}
                  className="w-full sm:w-auto px-4 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition min-h-[40px] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleProceedWarning}
                  className="w-full sm:w-auto px-5 py-2.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm transition flex items-center justify-center gap-1.5 min-h-[40px] cursor-pointer"
                >
                  <span>Proceder</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
