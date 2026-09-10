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
import { formatDate, formatTime, getTodayCalendarDate } from '@/lib/date-formatters';

export default function ReportsPage() {
  const { session, role } = useAuth();
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
          'Total Retornado (+)',
          'Ajustes Netos (±)',
          'Stock Disponible en Patio',
        ];
        rows = inventory.map((i) => [
          i.productName,
          i.dimensions,
          i.totalProduced,
          i.totalDispatched,
          i.totalReturned,
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

  return (
    <div className="space-y-6 pb-20 max-w-7xl mx-auto">
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

        <div className="flex items-center gap-2 self-start sm:self-auto print:hidden">
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
  );
}
