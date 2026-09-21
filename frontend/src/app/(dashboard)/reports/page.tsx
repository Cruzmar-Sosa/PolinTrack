'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useSearchParams } from 'next/navigation';
import {
  PageTitle,
  MutedText,
  Badge,
  Alert,
  Skeleton,
} from '@/components/ui';
import {
  ReportTab,
  ReportFilterValues,
  WoodReceiptReportItem,
  DispatchReportItem,
  InventoryReportItem,
  InventoryReportSummary,
  DailyProductionReportItem,
  FumigationReportItem,
  DistributionCenterReportItem,
  DistributionCenterReportSummary,
  PaginationMeta,
} from '@/components/reports/types';
import { ReportsFilterBar } from '@/components/reports/reports-filter-bar';
import { ReportsWoodReceiptsTable } from '@/components/reports/reports-wood-receipts-table';
import { ReportsDispatchesTable } from '@/components/reports/reports-dispatches-table';
import { ReportsInventoryTable } from '@/components/reports/reports-inventory-table';
import { ReportsProductionTable } from '@/components/reports/reports-production-table';
import { ReportsFumigationsTable } from '@/components/reports/reports-fumigations-table';
import { ReportsDistributionTable } from '@/components/reports/reports-distribution-table';
import { PrintableReportTemplate, ColumnDef } from '@/components/reports/printable-report-template';
import { formatDate, formatTime, formatDateTime, getTodayCalendarDate } from '@/lib/date-formatters';

export default function ReportsPage() {
  const { session, role, user } = useAuth();
  const token = session?.access_token;
  const searchParams = useSearchParams();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

  // Active Tab
  const initialTab = (searchParams.get('tab') as ReportTab) || 'wood-receipts';
  const [activeTab, setActiveTab] = useState<ReportTab>(initialTab);

  // Common Filters
  const [filters, setFilters] = useState<ReportFilterValues>({
    startDate: '',
    endDate: '',
    supplierId: '',
    clientCenterId: '',
    productId: '',
    page: 1,
    limit: 10,
  });

  // Loading & Error States
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Data States for all 6 reports
  const [woodReceipts, setWoodReceipts] = useState<WoodReceiptReportItem[]>([]);
  const [woodReceiptsMeta, setWoodReceiptsMeta] = useState<PaginationMeta | undefined>();

  const [dispatches, setDispatches] = useState<DispatchReportItem[]>([]);
  const [dispatchesMeta, setDispatchesMeta] = useState<PaginationMeta | undefined>();

  const [inventory, setInventory] = useState<InventoryReportItem[]>([]);
  const [inventorySummary, setInventorySummary] = useState<InventoryReportSummary | undefined>();

  const [productions, setProductions] = useState<DailyProductionReportItem[]>([]);
  const [productionsMeta, setProductionsMeta] = useState<PaginationMeta | undefined>();

  const [fumigations, setFumigations] = useState<FumigationReportItem[]>([]);
  const [fumigationsMeta, setFumigationsMeta] = useState<PaginationMeta | undefined>();

  const [distributions, setDistributions] = useState<DistributionCenterReportItem[]>([]);
  const [distributionSummary, setDistributionSummary] = useState<
    DistributionCenterReportSummary | undefined
  >();

  // Set default initial dates (first day of current month to today)
  useEffect(() => {
    const today = getTodayCalendarDate();
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const firstDay = `${year}-${month}-01`;

    setFilters((prev) => ({
      ...prev,
      startDate: firstDay,
      endDate: today,
    }));
  }, []);

  // Sync tab from search params if user navigated with ?tab=...
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam) {
      if (tabParam === 'distribution') setActiveTab('distribution-centers');
      else setActiveTab(tabParam as ReportTab);
    }
  }, [searchParams]);

  // Main Fetcher Dispatcher
  const fetchActiveReport = useCallback(async () => {
    if (!token) return;

    // Reactively validate RN-007 before fetching
    if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) {
      setErrorMessage(
        'Regla RN-007: La fecha inicial no puede ser posterior a la fecha final.'
      );
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      let endpoint = '';
      const params = new URLSearchParams();

      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);

      switch (activeTab) {
        case 'wood-receipts':
          endpoint = `${apiUrl}/reports/wood-receipts`;
          if (filters.supplierId) params.append('supplierId', filters.supplierId);
          params.append('page', String(filters.page));
          params.append('limit', String(filters.limit));
          break;

        case 'dispatches':
          endpoint = `${apiUrl}/reports/dispatches`;
          if (filters.clientCenterId) params.append('clientCenterId', filters.clientCenterId);
          if (filters.productId) params.append('productId', filters.productId);
          params.append('page', String(filters.page));
          params.append('limit', String(filters.limit));
          break;

        case 'inventory':
          endpoint = `${apiUrl}/reports/inventory`;
          if (filters.productId) params.append('productId', filters.productId);
          if (filters.endDate) params.append('asOfDate', filters.endDate);
          break;

        case 'daily-productions':
          endpoint = `${apiUrl}/reports/daily-productions`;
          if (filters.productId) params.append('productId', filters.productId);
          params.append('page', String(filters.page));
          params.append('limit', String(filters.limit));
          break;

        case 'fumigations':
          endpoint = `${apiUrl}/reports/fumigations`;
          params.append('page', String(filters.page));
          params.append('limit', String(filters.limit));
          break;

        case 'distribution-centers':
          endpoint = `${apiUrl}/reports/distribution-centers`;
          break;
      }

      const queryString = params.toString();
      const finalUrl = queryString ? `${endpoint}?${queryString}` : endpoint;

      const res = await fetch(finalUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || `Error al consultar reporte: HTTP ${res.status}`);
      }

      if (json.success) {
        switch (activeTab) {
          case 'wood-receipts':
            setWoodReceipts(json.data || []);
            setWoodReceiptsMeta(json.meta);
            break;
          case 'dispatches':
            setDispatches(json.data || []);
            setDispatchesMeta(json.meta);
            break;
          case 'inventory':
            setInventory(json.data || []);
            setInventorySummary(json.summary);
            break;
          case 'daily-productions':
            setProductions(json.data || []);
            setProductionsMeta(json.meta);
            break;
          case 'fumigations':
            setFumigations(json.data || []);
            setFumigationsMeta(json.meta);
            break;
          case 'distribution-centers':
            setDistributions(json.data || []);
            setDistributionSummary(json.summary);
            break;
        }
      } else {
        throw new Error('Formato de datos no reconocido en la respuesta');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error de conexión con el motor de reportes');
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, apiUrl, filters, token]);

  // Trigger fetch when activeTab or page changes
  useEffect(() => {
    if (filters.startDate) {
      fetchActiveReport();
    }
  }, [activeTab, filters.page, fetchActiveReport]);

  // Tab Change Handler
  const handleTabChange = (newTab: ReportTab) => {
    setActiveTab(newTab);
    setFilters((prev) => ({ ...prev, page: 1 }));
  };

  // Filter Updates
  const handleFilterChange = (partial: Partial<ReportFilterValues>) => {
    setFilters((prev) => ({ ...prev, ...partial }));
  };

  const handleResetFilters = () => {
    const today = getTodayCalendarDate();
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const firstDay = `${year}-${month}-01`;

    setFilters({
      startDate: firstDay,
      endDate: today,
      supplierId: '',
      clientCenterId: '',
      productId: '',
      page: 1,
      limit: 10,
    });
  };

  // ===========================================================================
  // CSV Export Calculations
  // ===========================================================================
  const exportConfig = useMemo(() => {
    let filename = `reporte-${activeTab}-${getTodayCalendarDate()}`;
    let headers: string[] = [];
    let rows: (string | number | null | undefined)[][] = [];

    switch (activeTab) {
      case 'wood-receipts':
        headers = [
          'Fecha Recepción',
          'Hora',
          'Lote Recepción',
          'Proveedor',
          'Especie',
          'Tipo Madera',
          'Cantidad',
          'Unidad',
          'Yugos (pcs)',
          'Reglas (pcs)',
          'Estado',
          'Guía / Doc',
          'Receptor',
        ];
        rows = woodReceipts.map((w) => [
          formatDate(w.receiptDate),
          formatTime(w.receiptTime),
          w.lotNumber,
          w.supplierName,
          w.speciesName,
          w.woodTypeName,
          w.quantity,
          w.unit,
          w.yugosQuantity ?? '',
          w.reglasQuantity ?? '',
          w.woodStatus || '',
          w.guideNumber || '',
          w.receivedBy,
        ]);
        break;

      case 'dispatches':
        headers = [
          'Fecha Despacho',
          'Hora',
          'Factura / Remisión',
          'Centro Cliente',
          'Lote Producción',
          'Producto',
          'Dimensiones',
          'Cantidad Despachada',
          'Devuelto Reproceso (+Stock)',
          'Devuelto Desecho (0 Stock)',
          'Total Devuelto Acumulado',
          'Vehículo / Placa',
          'Conductor',
          'Estado',
        ];
        rows = dispatches.map((d) => [
          formatDate(d.dispatchDate),
          formatTime(d.dispatchTime),
          d.invoiceNumber,
          d.clientCenterName,
          d.productionLot || '',
          d.productName,
          d.dimensions,
          d.quantityDispatched,
          d.quantityReturnedRework ?? 0,
          d.quantityReturnedScrap ?? 0,
          d.quantityReturnedAccumulated,
          d.vehicleInfo || '',
          d.driverName || '',
          d.status,
        ]);
        break;

      case 'inventory':
        headers = [
          'Producto',
          'Dimensiones',
          'Total Producido (+)',
          'Total Despachado (-)',
          'Devoluciones (Reproceso)',
          'Devoluciones (Desecho)',
          'Ajustes Netos (±)',
          'Stock Disponible en Patio',
        ];
        rows = inventory.map((i) => [
          i.productName,
          i.dimensions,
          i.totalProduced,
          i.totalDispatched,
          i.totalReturnedRework ?? i.totalReturned ?? 0,
          i.totalReturnedScrap ?? 0,
          i.netAdjustments,
          i.currentAvailableStock,
        ]);
        break;

      case 'daily-productions':
        headers = [
          'Fecha Producción',
          'Lote Fabricación',
          'Semana ISO',
          'Producto',
          'Dimensiones',
          'Cantidad Producida',
          'Lotes Madera Vinculados',
          'Supervisor',
        ];
        rows = productions.map((p) => [
          formatDate(p.productionDate),
          p.productionLot,
          `W${p.isoWeek}`,
          p.productName,
          p.dimensions,
          p.quantityProduced,
          p.woodReceiptLots ? p.woodReceiptLots.join(', ') : '',
          p.supervisor,
        ]);
        break;

      case 'fumigations':
        headers = [
          'Fecha Tratamiento',
          'Hora',
          'Certificado OIRSA',
          'Lote(s) Tratado(s)',
          'Cantidad Lotes',
          'Productos Tratados',
          'Cantidad Fumigada (pcs)',
          'Archivo PDF',
          'Registrado Por',
        ];
        rows = fumigations.map((f) => [
          formatDate(f.fumigationDate),
          formatTime(f.fumigationTime),
          f.certificateNumber,
          f.productionLots && f.productionLots.length > 0 ? f.productionLots.join(', ') : f.productionLot,
          f.lotsCount || (f.productionLots ? f.productionLots.length : 1),
          f.treatedProducts && f.treatedProducts.length > 0 ? f.treatedProducts.join(', ') : 'Todos',
          f.totalQuantityFumigated !== undefined ? f.totalQuantityFumigated : '',
          f.pdfFileName,
          f.registeredBy,
        ]);
        break;

      case 'distribution-centers':
        headers = [
          'Centro Cliente',
          'Total Facturas',
          'Total Despachado',
          'Total Devuelto (-)',
          'Neto Entregado',
        ];
        rows = distributions.map((c) => [
          c.clientCenterName,
          c.invoicesCount,
          c.totalDispatched,
          c.totalReturned,
          c.netDelivered,
        ]);
        break;
    }

    return { filename, headers, rows };
  }, [activeTab, woodReceipts, dispatches, inventory, productions, fumigations, distributions]);

  const printableConfig = useMemo<{
    reportTitle: string;
    data: any[];
    columns: ColumnDef[];
    summaryMetrics?: React.ReactNode;
  }>(() => {
    switch (activeTab) {
      case 'wood-receipts': {
        const totalQty = woodReceipts.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
        return {
          reportTitle: 'Reporte 1: Recepciones de Madera (M01)',
          data: woodReceipts,
          columns: [
            { header: 'Fecha', render: (r: WoodReceiptReportItem) => formatDate(r.receiptDate) },
            { header: 'Lote Recepción', accessorKey: 'lotNumber' },
            { header: 'Proveedor', accessorKey: 'supplierName' },
            { header: 'Especie', accessorKey: 'speciesName' },
            { header: 'Tipo Madera', accessorKey: 'woodTypeName' },
            { header: 'Unidad', accessorKey: 'unit' },
            {
              header: 'Cantidad',
              render: (r: WoodReceiptReportItem) =>
                Number(r.quantity).toLocaleString('es-NI', { maximumFractionDigits: 1 }),
              align: 'right',
            },
            { header: 'Guía / Doc', render: (r: WoodReceiptReportItem) => r.guideNumber || '—' },
            { header: 'Receptor', accessorKey: 'receivedBy' },
          ],
          summaryMetrics: (
            <div className="flex justify-between items-center text-xs">
              <span>Registros: <strong>{woodReceiptsMeta?.total ?? woodReceipts.length}</strong></span>
              <span>Total Trozas / Unidades: <strong>{totalQty.toLocaleString('es-NI', { maximumFractionDigits: 1 })} pcs</strong></span>
            </div>
          ),
        };
      }

      case 'dispatches': {
        const totalDispatched = dispatches.reduce((sum, d) => sum + (Number(d.quantityDispatched) || 0), 0);
        const totalReturned = dispatches.reduce((sum, d) => sum + (Number(d.quantityReturnedAccumulated) || 0), 0);
        return {
          reportTitle: 'Reporte 2: Despachos a Centros de Distribución (M06)',
          data: dispatches,
          columns: [
            { header: 'Fecha', render: (r: DispatchReportItem) => formatDate(r.dispatchDate) },
            { header: 'Factura / Remisión', accessorKey: 'invoiceNumber' },
            { header: 'Centro Cliente', accessorKey: 'clientCenterName' },
            { header: 'Lote Origen', render: (r: DispatchReportItem) => r.productionLot || '—' },
            { header: 'Producto', accessorKey: 'productName' },
            { header: 'Dimensiones', accessorKey: 'dimensions' },
            {
              header: 'Piezas Despachadas',
              render: (r: DispatchReportItem) => `${Number(r.quantityDispatched).toLocaleString('es-NI')} pcs`,
              align: 'right',
            },
            {
              header: 'Devoluciones',
              render: (r: DispatchReportItem) => `${Number(r.quantityReturnedAccumulated).toLocaleString('es-NI')} pcs`,
              align: 'right',
            },
            { header: 'Vehículo / Placa', render: (r: DispatchReportItem) => r.vehicleInfo || '—' },
            { header: 'Conductor', render: (r: DispatchReportItem) => r.driverName || '—' },
          ],
          summaryMetrics: (
            <div className="flex justify-between items-center text-xs">
              <span>Registros: <strong>{dispatchesMeta?.total ?? dispatches.length}</strong></span>
              <span>Total Despachado: <strong>{totalDispatched.toLocaleString('es-NI')} pcs</strong> | Total Devoluciones: <strong>{totalReturned.toLocaleString('es-NI')} pcs</strong></span>
            </div>
          ),
        };
      }

      case 'inventory': {
        return {
          reportTitle: 'Reporte 3: Balance Global de Inventario (M10)',
          data: inventory,
          columns: [
            { header: 'Producto Terminado', accessorKey: 'productName' },
            { header: 'Dimensiones', accessorKey: 'dimensions' },
            {
              header: 'Producción (+)',
              render: (r: InventoryReportItem) => `${Number(r.totalProduced).toLocaleString('es-NI')} pcs`,
              align: 'right',
            },
            {
              header: 'Despachos (-)',
              render: (r: InventoryReportItem) => `${Number(r.totalDispatched).toLocaleString('es-NI')} pcs`,
              align: 'right',
            },
            {
              header: 'Devoluciones: Reproceso (+)',
              render: (r: InventoryReportItem) => `+${Number(r.totalReturnedRework ?? r.totalReturned ?? 0).toLocaleString('es-NI')} pcs`,
              align: 'right',
            },
            {
              header: 'Devoluciones: Desecho (-)',
              render: (r: InventoryReportItem) => `-${Number(r.totalReturnedScrap ?? 0).toLocaleString('es-NI')} pcs`,
              align: 'right',
            },
            {
              header: 'Ajustes Netos (±)',
              render: (r: InventoryReportItem) => `${r.netAdjustments >= 0 ? '+' : ''}${Number(r.netAdjustments).toLocaleString('es-NI')} pcs`,
              align: 'right',
            },
            {
              header: 'Stock Patio',
              render: (r: InventoryReportItem) => `${Number(r.currentAvailableStock).toLocaleString('es-NI')} pcs`,
              align: 'right',
            },
          ],
          summaryMetrics: inventorySummary ? (
            <div className="flex flex-wrap justify-between items-center gap-2 text-xs">
              <span>Total Producido: <strong>{inventorySummary.totalProduced.toLocaleString('es-NI')} pcs</strong></span>
              <span>Total Despachado: <strong>{inventorySummary.totalDispatched.toLocaleString('es-NI')} pcs</strong></span>
              <span>Reproceso (+): <strong>{(inventorySummary.totalReturnedRework ?? 0).toLocaleString('es-NI')} pcs</strong></span>
              <span>Desecho (-): <strong>{(inventorySummary.totalReturnedScrap ?? 0).toLocaleString('es-NI')} pcs</strong></span>
              <span>Saldo Disponible Patio: <strong>{inventorySummary.totalAvailableStock.toLocaleString('es-NI')} pcs</strong></span>
            </div>
          ) : undefined,
        };
      }

      case 'daily-productions': {
        const totalProduced = productions.reduce((sum, p) => sum + (Number(p.quantityProduced) || 0), 0);
        return {
          reportTitle: 'Reporte 4: Producción Diaria de Polines (M04)',
          data: productions,
          columns: [
            { header: 'Fecha', render: (r: DailyProductionReportItem) => formatDate(r.productionDate) },
            { header: 'Lote Producción', accessorKey: 'productionLot' },
            {
              header: 'Tipo de Ingreso',
              render: (r: DailyProductionReportItem) =>
                r.isInitialInventory || r.productionLot?.startsWith('INV-INI-') ? (
                  <strong className="font-bold text-black">INVENTARIO INICIAL</strong>
                ) : (
                  <span className="font-semibold text-slate-800">PRODUCCIÓN REGULAR</span>
                ),
              align: 'center',
            },
            { header: 'Semana ISO', render: (r: DailyProductionReportItem) => `W${r.isoWeek}`, align: 'center' },
            { header: 'Producto', accessorKey: 'productName' },
            { header: 'Dimensiones', accessorKey: 'dimensions' },
            {
              header: 'Piezas Producidas',
              render: (r: DailyProductionReportItem) => `${Number(r.quantityProduced).toLocaleString('es-NI')} pcs`,
              align: 'right',
            },
            {
              header: 'Lotes Madera Origen',
              render: (r: DailyProductionReportItem) =>
                r.woodReceiptLots && r.woodReceiptLots.length > 0 ? r.woodReceiptLots.join(', ') : 'No vinculado',
            },
            {
              header: 'Supervisor',
              render: (r: DailyProductionReportItem) => r.supervisor || (r as any).createdByName || (r as any).supervisorName || '—',
            },
          ],
          summaryMetrics: (
            <div className="flex justify-between items-center text-xs">
              <span>Registros: <strong>{productionsMeta?.total ?? productions.length}</strong></span>
              <span>Total Producido: <strong>{totalProduced.toLocaleString('es-NI')} pcs</strong></span>
            </div>
          ),
        };
      }

      case 'fumigations': {
        return {
          reportTitle: 'Reporte 5: Certificados de Fumigación OIRSA (M05)',
          data: fumigations,
          columns: [
            { header: 'Fecha', render: (r: FumigationReportItem) => formatDate(r.fumigationDate) },
            { header: 'Hora', render: (r: FumigationReportItem) => formatTime(r.fumigationTime) },
            { header: 'Certificado OIRSA', accessorKey: 'certificateNumber' },
            {
              header: 'Lote(s) Tratado(s)',
              render: (r: FumigationReportItem) =>
                r.productionLots && r.productionLots.length > 0
                  ? r.productionLots.join(', ')
                  : r.productionLot || '—',
            },
            {
              header: 'Productos Tratados',
              render: (r: FumigationReportItem) =>
                r.treatedProducts && r.treatedProducts.length > 0
                  ? r.treatedProducts.join(', ')
                  : 'Todos',
            },
            {
              header: 'Cantidad Fumigada',
              render: (r: FumigationReportItem) =>
                r.totalQuantityFumigated != null
                  ? `${Number(r.totalQuantityFumigated).toLocaleString('es-NI')} pcs`
                  : '—',
              align: 'right',
            },
            { header: 'Archivo PDF', render: (r: FumigationReportItem) => r.pdfFileName || '—' },
            { header: 'Registrado Por', accessorKey: 'registeredBy' },
          ],
          summaryMetrics: (
            <div className="text-xs">
              <span>Registros Certificados: <strong>{fumigationsMeta?.total ?? fumigations.length}</strong></span>
            </div>
          ),
        };
      }

      case 'distribution-centers': {
        const totalNet = distributions.reduce((sum, c) => sum + (Number(c.netDelivered) || 0), 0);
        return {
          reportTitle: 'Reporte 6: Resumen por Centro de Distribución (M06)',
          data: distributions,
          columns: [
            { header: 'Centro Cliente', accessorKey: 'clientCenterName' },
            { header: 'Facturas', accessorKey: 'invoicesCount', align: 'center' },
            {
              header: 'Total Despachado',
              render: (r: DistributionCenterReportItem) => `${Number(r.totalDispatched).toLocaleString('es-NI')} pcs`,
              align: 'right',
            },
            {
              header: 'Total Devoluciones (-)',
              render: (r: DistributionCenterReportItem) => `-${Number(r.totalReturned).toLocaleString('es-NI')} pcs`,
              align: 'right',
            },
            {
              header: 'Saldo Neto Entregado',
              render: (r: DistributionCenterReportItem) => `${Number(r.netDelivered).toLocaleString('es-NI')} pcs`,
              align: 'right',
            },
            {
              header: 'Participación',
              render: (r: DistributionCenterReportItem) => {
                return totalNet > 0
                  ? `${Math.round((r.netDelivered / totalNet) * 100)}%`
                  : '0%';
              },
              align: 'right',
            },
          ],
          summaryMetrics: distributionSummary ? (
            <div className="flex flex-wrap justify-between items-center gap-2 text-xs">
              <span>Plantas: <strong>{distributions.length}</strong></span>
              <span>Total Despachado: <strong>{distributionSummary.totalDispatched.toLocaleString('es-NI')} pcs</strong></span>
              <span>Total Devoluciones: <strong>-{distributionSummary.totalReturned.toLocaleString('es-NI')} pcs</strong></span>
              <span>Saldo Neto Entregado: <strong>{distributionSummary.netDelivered.toLocaleString('es-NI')} pcs</strong></span>
            </div>
          ) : undefined,
        };
      }

      default:
        return {
          reportTitle: 'Reporte Oficial PolinTrack',
          data: [],
          columns: [],
        };
    }
  }, [
    activeTab,
    woodReceipts,
    woodReceiptsMeta,
    dispatches,
    dispatchesMeta,
    inventory,
    inventorySummary,
    productions,
    productionsMeta,
    fumigations,
    fumigationsMeta,
    distributions,
    distributionSummary,
  ]);

  return (
    <>
      {/* 🌳 ÁRBOL 1: UI INTERACTIVA (Oculto al imprimir) */}
      <div className="print:hidden w-full h-full flex flex-col space-y-6 pb-20 max-w-7xl mx-auto">
        {/* ==================================================================== */}
        {/* 1. HEADER ROW                                                       */}
        {/* ==================================================================== */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <PageTitle>Centro de Reportes Oficiales</PageTitle>
              <Badge variant="default" size="sm" className="bg-[#1D71CB] text-white">
                6 Reportes de Planta (M10)
              </Badge>
            </div>
            <MutedText>
              Generación analítica, balance operacional, exportación a CSV e impresión limpia con validación estricta de fechas (RN-007).
            </MutedText>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Badge variant="neutral" size="sm">
              Modo Consulta Read-Only
            </Badge>
            <span className="text-xs font-mono text-slate-500 font-semibold px-2.5 py-1 rounded bg-slate-100 border border-slate-200">
              {role || 'Usuario'}
            </span>
          </div>
        </div>

        {/* ==================================================================== */}
        {/* 2. TABS & GLOBAL FILTER BAR                                         */}
        {/* ==================================================================== */}
        <ReportsFilterBar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          filters={filters}
          onFilterChange={handleFilterChange}
          onApplyFilters={fetchActiveReport}
          onResetFilters={handleResetFilters}
          isLoading={isLoading}
          exportFilename={exportConfig.filename}
          exportHeaders={exportConfig.headers}
          exportRows={exportConfig.rows}
          token={token}
          apiUrl={apiUrl}
        />

        {/* ERROR ALERT */}
        {errorMessage && (
          <Alert variant="destructive" className="animate-in fade-in duration-200">
            <p className="text-xs font-semibold">{errorMessage}</p>
          </Alert>
        )}

        {/* ==================================================================== */}
        {/* 3. LOADING SKELETON                                                  */}
        {/* ==================================================================== */}
        {isLoading && (
          <div className="space-y-4">
            <Skeleton className="h-16 rounded-xl w-full" />
            <Skeleton className="h-96 rounded-xl w-full" />
          </div>
        )}

        {/* ==================================================================== */}
        {/* 4. ACTIVE REPORT TABLE (SCR-REP-01..06)                              */}
        {/* ==================================================================== */}
        {!isLoading && (
          <div className="animate-in fade-in duration-200">
            {activeTab === 'wood-receipts' && (
              <ReportsWoodReceiptsTable
                data={woodReceipts}
                meta={woodReceiptsMeta}
                onPageChange={(p) => handleFilterChange({ page: p })}
                onPageSizeChange={(newSize) => handleFilterChange({ limit: newSize, page: 1 })}
                pageSize={filters.limit}
                isLoading={isLoading}
              />
            )}

            {activeTab === 'dispatches' && (
              <ReportsDispatchesTable
                data={dispatches}
                meta={dispatchesMeta}
                onPageChange={(p) => handleFilterChange({ page: p })}
                onPageSizeChange={(newSize) => handleFilterChange({ limit: newSize, page: 1 })}
                pageSize={filters.limit}
                isLoading={isLoading}
              />
            )}

            {activeTab === 'inventory' && (
              <ReportsInventoryTable
                data={inventory}
                summary={inventorySummary}
                isLoading={isLoading}
              />
            )}

            {activeTab === 'daily-productions' && (
              <ReportsProductionTable
                data={productions}
                meta={productionsMeta}
                onPageChange={(p) => handleFilterChange({ page: p })}
                onPageSizeChange={(newSize) => handleFilterChange({ limit: newSize, page: 1 })}
                pageSize={filters.limit}
                isLoading={isLoading}
              />
            )}

            {activeTab === 'fumigations' && (
              <ReportsFumigationsTable
                data={fumigations}
                meta={fumigationsMeta}
                onPageChange={(p) => handleFilterChange({ page: p })}
                onPageSizeChange={(newSize) => handleFilterChange({ limit: newSize, page: 1 })}
                pageSize={filters.limit}
                isLoading={isLoading}
                token={token}
                apiUrl={apiUrl}
              />
            )}

            {activeTab === 'distribution-centers' && (
              <ReportsDistributionTable
                data={distributions}
                summary={distributionSummary}
                isLoading={isLoading}
              />
            )}
          </div>
        )}
      </div>

      {/* 🌳 ÁRBOL 2: DOCUMENTO DE IMPRESIÓN (Visible SOLO al imprimir) */}
      <div className="hidden print:block print:w-full print:bg-white text-black">
        <PrintableReportTemplate
          reportTitle={printableConfig.reportTitle}
          data={printableConfig.data}
          columns={printableConfig.columns}
          userFullName={user?.fullName || 'Usuario PolinTrack'}
          summaryMetrics={printableConfig.summaryMetrics}
        />
      </div>
    </>
  );
}
