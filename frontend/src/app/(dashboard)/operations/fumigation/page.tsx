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
  TablePagination,
} from '@/components/ui';
import {
  ShieldCheck,
  Calendar,
  FileText,
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
  Upload,
  Download,
  FileCheck,
  Layers,
  CheckSquare,
  Square,
  Trash2,
  Boxes,
} from 'lucide-react';
import {
  formatDate,
  formatTime,
  formatDateTime,
} from '@/lib/date-formatters';
import { Dialog, Drawer } from '@/components/ui/dialog';

interface FumigationDetailItem {
  id: string;
  dailyProductionId: string;
  productId: string;
  productionDetailId?: string | null;
  createdAt: string;
  dailyProduction?: {
    id: string;
    productionLot: string;
    productionDate: string;
    isoWeek: number;
  };
  product?: {
    id: string;
    name: string;
    dimensions: string;
  };
}

interface FumigationRecord {
  id: string;
  dailyProductionId?: string | null;
  dailyProduction?: {
    id: string;
    productionLot: string;
    productionDate: string;
    isoWeek?: number;
    quantityProduced?: number;
    product?: {
      id?: string;
      name: string;
      dimensions: string;
    } | null;
    productionDetails?: Array<{
      id: string;
      quantityProduced?: number;
      product: {
        id?: string;
        name: string;
        dimensions: string;
      };
    }>;
  } | null;
  details?: FumigationDetailItem[];
  observations?: string | null;
  fumigationDate: string;
  fumigationTime: string;
  certificateNumber: string;
  pdfFileName?: string;
  fileSizeBytes?: number;
  registeredById?: string;
  registeredBy?: {
    id: string;
    fullName: string;
    email: string;
  };
  createdBy?: {
    id: string;
    fullName: string;
    email: string;
  };
  createdAt: string;
}

interface ProductionLotOption {
  id: string;
  productionLot: string;
  productionDate: string;
  isoWeek?: number;
  productId?: string | null;
  product?: {
    id?: string;
    name: string;
    dimensions: string;
  } | null;
  productionDetails?: Array<{
    id: string;
    productId?: string;
    product: {
      id?: string;
      name: string;
      dimensions: string;
    };
    quantityProduced?: number;
  }>;
}

interface SelectedLotState {
  dailyProductionId: string;
  productionLot: string;
  productionDate: string;
  isoWeek?: number;
  products: Array<{
    id: string;
    name: string;
    dimensions: string;
    quantityProduced?: number;
    isSelected: boolean;
  }>;
}

export default function FumigationPage() {
  const { role, session } = useAuth();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

  // Data states
  const [fumigations, setFumigations] = useState<FumigationRecord[]>([]);
  const [recentLots, setRecentLots] = useState<ProductionLotOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Reset pagination to page 1 on filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, startDate, endDate]);

  // Modal Create State (Hierarchical Multi-Lot)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [formFumigationDate, setFormFumigationDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [formFumigationTime, setFormFumigationTime] = useState(() => {
    const now = new Date();
    return now.toTimeString().split(' ')[0].substring(0, 5); // HH:mm
  });
  const [formCertificateNumber, setFormCertificateNumber] = useState('');
  const [formObservations, setFormObservations] = useState('');
  const [formFile, setFormFile] = useState<File | null>(null);

  // Selected candidate lots in creation modal
  const [modalSelectedLots, setModalSelectedLots] = useState<SelectedLotState[]>([]);
  const [selectedLotToAdd, setSelectedLotToAdd] = useState<string>('');

  // Drawer / Detail
  const [selectedFumigation, setSelectedFumigation] = useState<FumigationRecord | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Signed URL Loading state
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const isMutationAllowed = role === 'ADMIN' || role === 'CONTABILIDAD';

  // Load fumigations and candidate production lots (window of last 30 days)
  const loadData = async () => {
    if (!session?.access_token) return;
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const headers = { Authorization: `Bearer ${session.access_token}` };

      const [resFum, resProd] = await Promise.all([
        fetch(`${apiUrl}/fumigations?limit=0`, { headers }),
        fetch(`${apiUrl}/daily-productions?limit=0`, { headers }),
      ]);

      if (!resFum.ok) {
        throw new Error('Error al consultar los registros de fumigación');
      }

      const [jsonFum, jsonProd] = await Promise.all([
        resFum.json(),
        resProd.json(),
      ]);

      setFumigations(jsonFum.data || []);

      // Filter lots from the last 30 days window (canonical business rule)
      const allLots: ProductionLotOption[] = jsonProd.data || [];
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

      const validLots = allLots.filter((lot) => lot.productionDate >= thirtyDaysAgoStr);
      setRecentLots(validLots);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error de conexión con el servidor');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [session?.access_token]);

  // Filtered fumigations
  const filteredFumigations = useMemo(() => {
    const searchLower = searchTerm.trim().toLowerCase();
    return fumigations.filter((f) => {
      // Search in certificate number
      const matchesCert = f.certificateNumber?.toLowerCase().includes(searchLower);

      // Search in primary lot or multi-lot details
      const primaryLot = f.dailyProduction?.productionLot?.toLowerCase() || '';
      const detailLots = (f.details || []).map(
        (d) => d.dailyProduction?.productionLot?.toLowerCase() || '',
      );
      const matchesLots = primaryLot.includes(searchLower) || detailLots.some((l) => l.includes(searchLower));

      // Search in treated products
      const detailProducts = (f.details || []).map(
        (d) => d.product?.name?.toLowerCase() || '',
      );
      const primaryProducts = (f.dailyProduction?.productionDetails || []).map(
        (pd) => pd.product?.name?.toLowerCase() || '',
      );
      if (f.dailyProduction?.product?.name) {
        primaryProducts.push(f.dailyProduction.product.name.toLowerCase());
      }
      const matchesProducts =
        detailProducts.some((p) => p.includes(searchLower)) ||
        primaryProducts.some((p) => p.includes(searchLower));

      const matchesSearch = !searchLower || matchesCert || matchesLots || matchesProducts;
      const matchesStart = !startDate || f.fumigationDate >= startDate;
      const matchesEnd = !endDate || f.fumigationDate <= endDate;

      return matchesSearch && matchesStart && matchesEnd;
    }).sort((a, b) => {
      const dateA = new Date(a.fumigationDate).getTime() || 0;
      const dateB = new Date(b.fumigationDate).getTime() || 0;
      if (dateB !== dateA) return dateB - dateA;
      const createdA = new Date(a.createdAt).getTime() || 0;
      const createdB = new Date(b.createdAt).getTime() || 0;
      if (createdB !== createdA) return createdB - createdA;
      return (b.id || '').localeCompare(a.id || '');
    });
  }, [fumigations, searchTerm, startDate, endDate]);

  // Paginated items
  const paginatedFumigations = useMemo(() => {
    if (pageSize === 0) return filteredFumigations;
    const startIndex = (currentPage - 1) * pageSize;
    return filteredFumigations.slice(startIndex, startIndex + pageSize);
  }, [filteredFumigations, currentPage, pageSize]);

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setFormError(null);
    setFormFumigationDate(new Date().toISOString().split('T')[0]);
    setFormFumigationTime(new Date().toTimeString().split(' ')[0].substring(0, 5));
    setFormCertificateNumber('');
    setFormObservations('');
    setFormFile(null);

    // Initialize with first lot if available
    if (recentLots.length > 0) {
      const first = recentLots[0];
      const prods = extractLotProducts(first).map((p) => ({ ...p, isSelected: true }));
      setModalSelectedLots([
        {
          dailyProductionId: first.id,
          productionLot: first.productionLot,
          productionDate: first.productionDate,
          isoWeek: first.isoWeek,
          products: prods,
        },
      ]);
      setSelectedLotToAdd('');
    } else {
      setModalSelectedLots([]);
    }

    setIsCreateModalOpen(true);
  };

  // Extract products from a ProductionLotOption
  const extractLotProducts = (lot: ProductionLotOption) => {
    if (lot.productionDetails && lot.productionDetails.length > 0) {
      return lot.productionDetails.map((pd) => ({
        id: pd.product?.id || pd.productId || '',
        name: pd.product?.name || 'Polín Estándar',
        dimensions: pd.product?.dimensions || 'N/A',
        quantityProduced: pd.quantityProduced,
      }));
    }
    if (lot.product && lot.product.id) {
      return [
        {
          id: lot.product.id,
          name: lot.product.name,
          dimensions: lot.product.dimensions,
          quantityProduced: undefined,
        },
      ];
    }
    return [];
  };

  // Add lot to modal selection
  const handleAddLotToModal = (lotId: string) => {
    if (!lotId) return;
    if (modalSelectedLots.some((l) => l.dailyProductionId === lotId)) {
      return;
    }
    const lotObj = recentLots.find((l) => l.id === lotId);
    if (!lotObj) return;

    const prods = extractLotProducts(lotObj).map((p) => ({ ...p, isSelected: true }));
    setModalSelectedLots((prev) => [
      ...prev,
      {
        dailyProductionId: lotObj.id,
        productionLot: lotObj.productionLot,
        productionDate: lotObj.productionDate,
        isoWeek: lotObj.isoWeek,
        products: prods,
      },
    ]);
    setSelectedLotToAdd('');
  };

  // Remove lot from modal selection
  const handleRemoveLotFromModal = (lotId: string) => {
    setModalSelectedLots((prev) => prev.filter((l) => l.dailyProductionId !== lotId));
  };

  // Toggle product selection in lot
  const handleToggleProductInLot = (lotId: string, productId: string) => {
    setModalSelectedLots((prev) =>
      prev.map((lot) => {
        if (lot.dailyProductionId !== lotId) return lot;
        return {
          ...lot,
          products: lot.products.map((p) =>
            p.id === productId ? { ...p, isSelected: !p.isSelected } : p,
          ),
        };
      }),
    );
  };

  // Select all / none products in a lot
  const handleSetAllProductsInLot = (lotId: string, selectAll: boolean) => {
    setModalSelectedLots((prev) =>
      prev.map((lot) => {
        if (lot.dailyProductionId !== lotId) return lot;
        return {
          ...lot,
          products: lot.products.map((p) => ({ ...p, isSelected: selectAll })),
        };
      }),
    );
  };

  // Validation metrics for modal
  const totalLotsSelected = modalSelectedLots.length;
  const totalProductsSelected = modalSelectedLots.reduce(
    (sum, l) => sum + l.products.filter((p) => p.isSelected).length,
    0,
  );
  const anyLotHasZeroProducts = modalSelectedLots.some(
    (l) => l.products.filter((p) => p.isSelected).length === 0,
  );
  const isFormValid =
    totalLotsSelected > 0 &&
    !anyLotHasZeroProducts &&
    formCertificateNumber.trim().length > 0 &&
    formFile !== null;

  // Submit Create Fumigation
  const handleSubmitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (totalLotsSelected === 0) {
      setFormError('Debe seleccionar al menos un lote de producción amparado.');
      return;
    }

    if (anyLotHasZeroProducts) {
      setFormError('Cada lote amparado debe tener al menos un producto seleccionado.');
      return;
    }

    if (!formCertificateNumber.trim()) {
      setFormError('El número de certificado oficial OIRSA es obligatorio.');
      return;
    }

    if (!formFile) {
      setFormError('Debe adjuntar el archivo PDF oficial del certificado OIRSA.');
      return;
    }

    if (formFile.type !== 'application/pdf') {
      setFormError('El certificado debe ser un archivo en formato PDF exclusivamente.');
      return;
    }

    if (formFile.size > 10 * 1024 * 1024) {
      setFormError('El archivo PDF excede el tamaño máximo permitido de 10 MB.');
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    if (formFumigationDate > todayStr) {
      setFormError('La fecha de fumigación no puede ser una fecha futura.');
      return;
    }

    try {
      setIsSubmitting(true);

      const lotsPayload = modalSelectedLots.map((lot) => ({
        dailyProductionId: lot.dailyProductionId,
        productIds: lot.products.filter((p) => p.isSelected).map((p) => p.id),
      }));

      const formData = new FormData();
      formData.append('lots', JSON.stringify(lotsPayload));
      formData.append('dailyProductionId', lotsPayload[0].dailyProductionId); // For backwards compat
      formData.append('fumigationDate', formFumigationDate);
      formData.append('fumigationTime', formFumigationTime);
      formData.append('certificateNumber', formCertificateNumber.trim());

      if (formObservations.trim()) {
        formData.append('observations', formObservations.trim());
      }

      formData.append('file', formFile);

      const res = await fetch(`${apiUrl}/fumigations`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: formData,
      });

      const resJson = await res.json();

      if (!res.ok) {
        throw new Error(resJson.message || 'Error al registrar el tratamiento fitosanitario.');
      }

      setSuccessMessage(
        `Fumigación registrada exitosamente. Certificado OIRSA '${formCertificateNumber.trim()}' ampara ${totalLotsSelected} lote(s) y ${totalProductsSelected} producto(s).`,
      );
      setTimeout(() => setSuccessMessage(null), 7000);
      setCurrentPage(1);
      setIsCreateModalOpen(false);
      loadData();
    } catch (err: any) {
      setFormError(err.message || 'Error inesperado al registrar la fumigación.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open / Download Signed Certificate URL (15-min TTL)
  const handleViewCertificate = async (fumigationId: string) => {
    try {
      setDownloadingId(fumigationId);
      const res = await fetch(`${apiUrl}/fumigations/${fumigationId}/certificate-url`, {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (!res.ok) {
        throw new Error('No se pudo generar la URL firmada para el certificado');
      }

      const json = await res.json();
      const signedUrl =
        json.data?.downloadUrl ||
        json.data?.signedUrl ||
        json.data?.url ||
        json.downloadUrl ||
        json.url;

      if (signedUrl) {
        const targetUrl =
          signedUrl.startsWith('http://') || signedUrl.startsWith('https://')
            ? signedUrl
            : `${apiUrl.replace(/\/api\/v1\/?$/, '')}${signedUrl}`;

        window.open(targetUrl, '_blank');
      } else {
        throw new Error('La respuesta no contiene una URL firmada válida');
      }
    } catch (err: any) {
      alert(err.message || 'Error al abrir el certificado');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleOpenDetail = (item: FumigationRecord) => {
    setSelectedFumigation(item);
    setIsDrawerOpen(true);
  };

  // Helper to extract covered lots and treated products for a record
  const getFumigationSummary = (record: FumigationRecord) => {
    const lotsMap = new Map<string, { lotNumber: string; date?: string }>();
    const productsMap = new Map<string, { name: string; dimensions: string }>();

    if (record.details && record.details.length > 0) {
      for (const d of record.details) {
        if (d.dailyProduction) {
          lotsMap.set(d.dailyProductionId, {
            lotNumber: d.dailyProduction.productionLot,
            date: d.dailyProduction.productionDate,
          });
        }
        if (d.product) {
          productsMap.set(d.productId, {
            name: d.product.name,
            dimensions: d.product.dimensions,
          });
        }
      }
    } else if (record.dailyProduction) {
      lotsMap.set(record.dailyProduction.id, {
        lotNumber: record.dailyProduction.productionLot,
        date: record.dailyProduction.productionDate,
      });
      if (record.dailyProduction.productionDetails && record.dailyProduction.productionDetails.length > 0) {
        for (const pd of record.dailyProduction.productionDetails) {
          if (pd.product) {
            productsMap.set(pd.product.id || pd.product.name, {
              name: pd.product.name,
              dimensions: pd.product.dimensions,
            });
          }
        }
      } else if (record.dailyProduction.product) {
        productsMap.set(record.dailyProduction.product.id || record.dailyProduction.product.name, {
          name: record.dailyProduction.product.name,
          dimensions: record.dailyProduction.product.dimensions,
        });
      }
    }

    return {
      lots: Array.from(lotsMap.values()),
      products: Array.from(productsMap.values()),
    };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-3">
            <PageTitle>Fumigaciones y Certificación OIRSA</PageTitle>
            <Badge variant="institutional">M06: Fitosanitario OIRSA</Badge>
          </div>
          <MutedText>
            Control de tratamientos fitosanitarios multi-lote y multi-producto con almacenamiento privado y emisión de Signed URLs seguras.
          </MutedText>
        </div>

        <div className="flex items-center gap-3">
          {isMutationAllowed ? (
            <Button
              variant="institutional"
              onClick={handleOpenCreateModal}
              className="bg-[#3A6A44] hover:bg-[#2e5536] text-white flex items-center gap-2 shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>+ Registrar Fumigación</span>
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
            placeholder="Buscar por N° certificado, lote (LT-...), producto o químico..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none transition"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            title="Fecha inicial"
          />
          <span className="text-slate-400 text-xs">a</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
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

      {/* Fumigations Table (SCR-FUM-01) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : filteredFumigations.length === 0 ? (
          <div className="p-12">
            <EmptyState
              title="No se encontraron tratamientos fitosanitarios"
              description={
                searchTerm || startDate || endDate
                  ? 'No hay registros que coincidan con los filtros aplicados.'
                  : 'Aún no se han registrado eventos de fumigación OIRSA en el sistema.'
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Certificado OIRSA</th>
                  <th className="py-3 px-4">Fecha y Hora de Aplicación</th>
                  <th className="py-3 px-4">Lotes y Productos Amparados</th>
                  <th className="py-3 px-4">Certificado Oficial</th>
                  <th className="py-3 px-4">Registrado Por</th>
                  <th className="py-3 px-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedFumigations.map((item) => {
                  const summary = getFumigationSummary(item);
                  const isMultiLot = summary.lots.length > 1;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Certificado OIRSA */}
                      <td className="py-3 px-4 font-semibold text-slate-900 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-900 border border-emerald-200 text-xs font-mono font-bold">
                          <FileCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          {item.certificateNumber}
                        </span>
                      </td>

                      {/* Fecha y Hora de Aplicación */}
                      <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                        <div className="font-medium text-xs">{formatDate(item.fumigationDate)}</div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          {formatTime(item.fumigationTime)}
                        </div>
                      </td>

                      {/* Lotes y Productos Amparados */}
                      <td className="py-3 px-4">
                        <div className="space-y-1.5 max-w-[280px]">
                          {/* Lotes */}
                          {summary.lots.length === 0 ? (
                            <span className="text-slate-400 italic text-xs">Sin lote</span>
                          ) : isMultiLot ? (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono font-bold text-[#1D71CB] text-xs">
                                {summary.lots[0].lotNumber}
                              </span>
                              <span
                                className="bg-blue-100 text-blue-800 font-sans font-bold px-1.5 py-0.5 rounded text-[10px] border border-blue-200 cursor-help"
                                title={summary.lots.map((l) => l.lotNumber).join(', ')}
                              >
                                +{summary.lots.length - 1} lotes
                              </span>
                            </div>
                          ) : (
                            <span className="font-mono font-bold text-[#1D71CB] text-xs">
                              {summary.lots[0].lotNumber}
                            </span>
                          )}

                          {/* Productos */}
                          {summary.products.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {summary.products.slice(0, 2).map((prod, pIdx) => (
                                <span
                                  key={pIdx}
                                  className="inline-flex items-center text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200"
                                >
                                  {prod.name}
                                </span>
                              ))}
                              {summary.products.length > 2 && (
                                <span className="text-[10px] text-emerald-700 font-semibold self-center">
                                  +{summary.products.length - 2} prod.
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-xs">Todos</span>
                          )}
                        </div>
                      </td>

                      {/* Documento Oficial (Signed URL) */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <button
                          onClick={() => handleViewCertificate(item.id)}
                          disabled={downloadingId === item.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-medium transition disabled:opacity-50"
                        >
                          {downloadingId === item.id ? (
                            <>
                              <span className="animate-spin text-xs">⏳</span>
                              <span>Generando...</span>
                            </>
                          ) : (
                            <>
                              <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                              <span>Ver PDF (Signed URL)</span>
                            </>
                          )}
                        </button>
                      </td>

                      {/* Registrado Por */}
                      <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                        {item.registeredBy?.fullName || item.createdBy?.fullName || 'Sistema'}
                      </td>

                      {/* Acciones */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <button
                          onClick={() => handleOpenDetail(item)}
                          className="text-xs font-medium text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded transition"
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

        {filteredFumigations.length > 0 && (
          <TablePagination
            currentPage={currentPage}
            totalItems={filteredFumigations.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setCurrentPage(1);
            }}
          />
        )}
      </div>

      {/* ==================================================================== */}
      {/* FICHA TÉCNICA DRAWER (SCR-FUM-03)                                    */}
      {/* ==================================================================== */}
      <Drawer
        isOpen={isDrawerOpen && !!selectedFumigation}
        onClose={() => setIsDrawerOpen(false)}
        subtitle="Expediente Fitosanitario OIRSA"
        title={selectedFumigation?.certificateNumber}
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
        {selectedFumigation && (
          <div className="space-y-6">
            {/* Status Badge */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <span className="text-xs text-slate-500">Estado de Certificación</span>
              <Badge variant="success" size="sm">
                CERTIFICADO VIGENTE
              </Badge>
            </div>

            {/* BLOQUE 1: CABECERA DEL CERTIFICADO Y DOCUMENTO OFICIAL */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">N° Certificado Oficial OIRSA</span>
                <span className="font-mono font-bold text-emerald-900 text-sm bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200">
                  {selectedFumigation.certificateNumber}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">Fecha y Hora de Tratamiento:</span>
                <span className="font-semibold text-slate-800 font-mono">
                  {formatDate(selectedFumigation.fumigationDate)} •{' '}
                  {formatTime(selectedFumigation.fumigationTime)}
                </span>
              </div>
              <div className="pt-2 border-t border-slate-200">
                <Button
                  variant="institutional"
                  onClick={() => handleViewCertificate(selectedFumigation.id)}
                  disabled={downloadingId === selectedFumigation.id}
                  className="w-full bg-[#3A6A44] hover:bg-[#2e5536] text-white text-xs flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  <span>Ver / Descargar Certificado PDF (Signed URL 15 min)</span>
                </Button>
                {selectedFumigation.pdfFileName && (
                  <p className="text-[11px] text-slate-400 font-mono text-center mt-1.5 truncate">
                    Archivo: {selectedFumigation.pdfFileName}
                  </p>
                )}
              </div>
            </div>

            {/* BLOQUE 2: OBSERVACIONES TÉCNICAS */}
            <div className="p-3.5 bg-amber-50/60 border border-amber-200 rounded-xl text-xs space-y-1">
              <span className="font-bold text-amber-900 uppercase tracking-wider text-[10px] block">
                Observaciones Técnicas:
              </span>
              <p className="text-slate-700">
                {selectedFumigation.observations || 'Sin observaciones registradas.'}
              </p>
            </div>

            {/* BLOQUE 3: DETALLE FITOSANITARIO DE LOTES Y PRODUCTOS */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Boxes className="w-3.5 h-3.5 text-blue-600" />
                  <span>Órdenes y Productos Amparados</span>
                </h4>
                <Badge variant="institutional" size="sm">
                  {selectedFumigation.details && selectedFumigation.details.length > 0
                    ? `${selectedFumigation.details.length} registros`
                    : '1 lote'}
                </Badge>
              </div>

              {/* Si tiene details estructurados */}
              {selectedFumigation.details && selectedFumigation.details.length > 0 ? (
                <div className="space-y-3">
                  {/* Agrupar por orden de producción */}
                  {Array.from(
                    new Set(selectedFumigation.details.map((d) => d.dailyProductionId)),
                  ).map((dpId) => {
                    const groupDetails = selectedFumigation.details!.filter(
                      (d) => d.dailyProductionId === dpId,
                    );
                    const lotInfo = groupDetails[0]?.dailyProduction;

                    return (
                      <div
                        key={dpId}
                        className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/50 space-y-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-blue-900 text-xs">
                            {lotInfo?.productionLot || dpId}
                          </span>
                          {lotInfo?.productionDate && (
                            <span className="text-[11px] text-slate-500 font-mono">
                              Prod: {formatDate(lotInfo.productionDate)} (W{lotInfo.isoWeek})
                            </span>
                          )}
                        </div>

                        <div className="space-y-1.5 pt-1 border-t border-slate-200">
                          <span className="text-[10px] uppercase font-bold text-slate-400">
                            Productos Tratados en este Lote:
                          </span>
                          <div className="space-y-1">
                            {groupDetails.map((det) => (
                              <div
                                key={det.id}
                                className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs"
                              >
                                <span className="font-semibold text-slate-900">
                                  {det.product?.name || 'Polín'}
                                </span>
                                <span className="font-mono text-slate-500 text-[11px]">
                                  {det.product?.dimensions || 'N/A'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : selectedFumigation.dailyProduction ? (
                /* Fallback legado monoproducto */
                <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/50 space-y-2">
                  <span className="font-mono font-bold text-blue-900 text-xs">
                    {selectedFumigation.dailyProduction.productionLot}
                  </span>
                  <p className="text-xs text-slate-700">
                    {selectedFumigation.dailyProduction.product?.name || 'Polín Industrial'}
                  </p>
                </div>
              ) : null}
            </div>

            {/* Auditoría Técnica */}
            <div className="space-y-2 pt-4 border-t border-slate-100 text-xs">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Auditoría Técnica
              </h4>
              <p className="text-slate-500">
                Registrado por:{' '}
                <strong className="text-slate-700">
                  {selectedFumigation.registeredBy?.fullName || 'Sistema'}
                </strong>
              </p>
              <p className="text-[11px] text-slate-400">
                Timestamp: {formatDateTime(selectedFumigation.createdAt).full}
              </p>
              <div className="p-2.5 rounded bg-slate-100 text-[11px] text-slate-600 border border-slate-200 mt-2">
                🔒 Registro inmutable con trazabilidad fitosanitaria OIRSA (RN-FUM-MULTI).
              </div>
            </div>
          </div>
        )}
      </Drawer>

      {/* ==================================================================== */}
      {/* MODAL DE REGISTRO MULTI-LOTE Y SELECCIÓN DE PRODUCTOS (SCR-FUM-02)   */}
      {/* ==================================================================== */}
      <Dialog
        isOpen={isCreateModalOpen}
        onClose={() => !isSubmitting && setIsCreateModalOpen(false)}
        size="xl"
        headerVariant="industrial"
        subtitle="Operación M06 — Tratamiento Fitosanitario"
        title="Registrar Fumigación OIRSA (Multi-Lote)"
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

            {/* NIVEL 1: DATOS TÉCNICOS Y OFICIALES DEL TRATAMIENTO */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b border-slate-200 pb-1.5 flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-600" />
                <span>1. Datos del Certificado Oficial</span>
              </h4>

              {/* N° Certificado */}
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Número de Certificado Oficial OIRSA *
                </label>
                <input
                  type="text"
                  placeholder="Ej: OIRSA-CERT-2026-0914"
                  maxLength={100}
                  value={formCertificateNumber}
                  onChange={(e) => setFormCertificateNumber(e.target.value)}
                  className="w-full text-sm bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none font-mono min-h-[40px]"
                  required
                />
              </div>

              {/* Fecha y Hora de Fumigación */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Fecha de Tratamiento *
                  </label>
                  <input
                    type="date"
                    max={new Date().toISOString().split('T')[0]}
                    value={formFumigationDate}
                    onChange={(e) => setFormFumigationDate(e.target.value)}
                    className="w-full text-sm bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none min-h-[40px]"
                    required
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Hora de Aplicación *
                  </label>
                  <input
                    type="time"
                    value={formFumigationTime}
                    onChange={(e) => setFormFumigationTime(e.target.value)}
                    className="w-full text-sm bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none min-h-[40px]"
                    required
                  />
                </div>
              </div>

              {/* Observaciones */}
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Observaciones Técnicas (Opcional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Condiciones de hermeticidad, temperatura ambiente, precintos, etc."
                  value={formObservations}
                  onChange={(e) => setFormObservations(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Archivo PDF del Certificado (Dropzone Holgado) */}
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Certificado PDF Escaneado Oficial *
                </label>
                <div className="mt-1 flex justify-center p-6 sm:p-8 border-2 border-slate-300 border-dashed rounded-xl bg-slate-50/70 hover:bg-slate-100/70 transition cursor-pointer relative">
                  <div className="space-y-2 text-center">
                    <Upload className="mx-auto h-9 w-9 text-slate-400" />
                    <div className="flex text-sm text-slate-600 justify-center">
                      <label
                        htmlFor="file-upload"
                        className="relative cursor-pointer rounded-md font-medium text-emerald-700 hover:text-emerald-600 focus-within:outline-none"
                      >
                        <span>{formFile ? formFile.name : 'Seleccionar archivo PDF'}</span>
                        <input
                          id="file-upload"
                          name="file-upload"
                          type="file"
                          accept="application/pdf"
                          className="sr-only"
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              setFormFile(e.target.files[0]);
                            }
                          }}
                        />
                      </label>
                    </div>
                    <p className="text-xs text-slate-500">
                      {formFile
                        ? `${(formFile.size / 1024 / 1024).toFixed(2)} MB — PDF listo para cargar`
                        : 'PDF de hasta 10 MB (almacenamiento privado seguro)'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* NIVEL 2: SELECTOR JERÁRQUICO DE LOTES Y PRODUCTOS TRATADOS */}
            <div className="space-y-4 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-1.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-blue-600" />
                  <span>2. Órdenes de Producción y Selección Granular de Productos</span>
                </h4>
                <div className="text-xs text-slate-500 font-mono">
                  <strong className="text-blue-900">{totalLotsSelected}</strong> lotes •{' '}
                  <strong className="text-emerald-900">{totalProductsSelected}</strong> productos
                </div>
              </div>

              {/* Selector para agregar nueva orden */}
              <div className="flex flex-col sm:flex-row gap-2.5">
                <select
                  value={selectedLotToAdd}
                  onChange={(e) => setSelectedLotToAdd(e.target.value)}
                  className="flex-1 text-xs bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none min-h-[40px]"
                >
                  <option value="">-- Seleccionar lote para amparar bajo este certificado --</option>
                  {recentLots
                    .filter(
                      (lot) => !modalSelectedLots.some((sel) => sel.dailyProductionId === lot.id),
                    )
                    .map((lot) => {
                      const prodsSummary =
                        lot.productionDetails && lot.productionDetails.length > 0
                          ? lot.productionDetails
                              .map((pd) => pd.product?.name || '')
                              .filter(Boolean)
                              .join(', ')
                          : lot.product?.name || 'Polín';
                      return (
                        <option key={lot.id} value={lot.id}>
                          {lot.productionLot} — {prodsSummary} ({formatDate(lot.productionDate)})
                        </option>
                      );
                    })}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleAddLotToModal(selectedLotToAdd)}
                  disabled={!selectedLotToAdd}
                  className="text-xs border-blue-300 text-blue-700 hover:bg-blue-50 shrink-0 min-h-[40px]"
                >
                  + Agregar Lote
                </Button>
              </div>

              {/* Tarjetas de Lotes Seleccionados (p-5 rounded-xl border border-slate-200 bg-slate-50/50 my-3) */}
              {modalSelectedLots.length === 0 ? (
                <div className="p-8 border-2 border-dashed border-slate-200 rounded-xl text-center text-xs text-slate-400">
                  No ha seleccionado ninguna orden de producción. Seleccione al menos un lote de la lista superior.
                </div>
              ) : (
                <div className="space-y-3">
                  {modalSelectedLots.map((lotState) => {
                    const selectedCount = lotState.products.filter((p) => p.isSelected).length;
                    const isNoneSelected = selectedCount === 0;

                    return (
                      <div
                        key={lotState.dailyProductionId}
                        className={`p-5 rounded-xl border transition my-3 space-y-3 ${
                          isNoneSelected
                            ? 'border-rose-300 bg-rose-50/40'
                            : 'border-slate-200 bg-slate-50/50'
                        }`}
                      >
                        {/* Cabecera del Lote */}
                        <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-blue-900 text-xs">
                              {lotState.productionLot}
                            </span>
                            <span className="text-[11px] text-slate-500 font-mono">
                              {formatDate(lotState.productionDate)}{' '}
                              {lotState.isoWeek ? `(W${lotState.isoWeek})` : ''}
                            </span>
                          </div>

                          <div className="flex items-center gap-3">
                            <span
                              className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${
                                isNoneSelected
                                  ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                  : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              }`}
                            >
                              {selectedCount} de {lotState.products.length} productos
                            </span>

                            <div className="flex items-center gap-1.5 text-[11px]">
                              <button
                                type="button"
                                onClick={() =>
                                  handleSetAllProductsInLot(lotState.dailyProductionId, true)
                                }
                                className="text-blue-700 hover:underline cursor-pointer"
                              >
                                Todos
                              </button>
                              <span className="text-slate-300">•</span>
                              <button
                                type="button"
                                onClick={() =>
                                  handleSetAllProductsInLot(lotState.dailyProductionId, false)
                                }
                                className="text-slate-500 hover:underline cursor-pointer"
                              >
                                Ninguno
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                handleRemoveLotFromModal(lotState.dailyProductionId)
                              }
                              className="text-rose-600 hover:text-rose-800 p-1 hover:bg-rose-100 rounded transition cursor-pointer"
                              title="Remover lote de este certificado"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Lista de Productos del Lote */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                          {lotState.products.map((prod) => (
                            <label
                              key={prod.id}
                              className={`flex items-start gap-2.5 p-3 rounded-lg border text-xs cursor-pointer transition ${
                                prod.isSelected
                                  ? 'bg-white border-blue-300 shadow-2xs'
                                  : 'bg-slate-100/50 border-slate-200 text-slate-400'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={prod.isSelected}
                                onChange={() =>
                                  handleToggleProductInLot(
                                    lotState.dailyProductionId,
                                    prod.id,
                                  )
                                }
                                className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-slate-900 truncate">
                                  {prod.name}
                                </div>
                                <div className="text-[11px] text-slate-500 font-mono">
                                  {prod.dimensions}
                                  {prod.quantityProduced !== undefined &&
                                    ` • ${prod.quantityProduced} pcs`}
                                </div>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Modal Actions Footer */}
          <div className="px-6 sm:px-8 py-4 bg-slate-50/80 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
            <div className="text-xs text-slate-500">
              <span className="font-semibold text-slate-700">Resumen:</span>{' '}
              {totalLotsSelected} lote(s), {totalProductsSelected} producto(s), 1 certificado oficial PDF.
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-2.5 w-full sm:w-auto">
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
                disabled={isSubmitting || !isFormValid}
                className="w-full sm:w-auto px-5 py-2.5 text-xs font-semibold bg-[#3A6A44] hover:bg-[#2e5536] text-white rounded-lg shadow-sm transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[40px] cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <span className="animate-spin text-xs">⏳</span>
                    <span>Cargando y Guardando...</span>
                  </>
                ) : (
                  <span>Guardar Fumigación Multi-Lote</span>
                )}
              </button>
            </div>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
