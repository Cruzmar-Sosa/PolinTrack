'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import {
  PageTitle,
  MutedText,
  Badge,
  Button,
  Card,
  CardContent,
  Alert,
  Skeleton,
} from '@/components/ui';
import {
  RefreshCw,
  Calendar,
  Layers,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import { DashboardKpisData, DatePreset } from '@/components/dashboard/types';
import { DashboardKpiGrid } from '@/components/dashboard/dashboard-kpi-grid';
import { DashboardYardSummary } from '@/components/dashboard/dashboard-yard-summary';
import { DashboardClientDistribution } from '@/components/dashboard/dashboard-client-distribution';
import { DashboardQuickActions } from '@/components/dashboard/dashboard-quick-actions';
import { formatTime, getTodayCalendarDate } from '@/lib/date-formatters';

export default function DashboardPage() {
  const { session, user, role } = useAuth();
  const token = session?.access_token;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

  // State
  const [preset, setPreset] = useState<DatePreset>('THIS_MONTH');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [kpis, setKpis] = useState<DashboardKpisData | null>(null);

  // Helper to compute preset dates
  const computePresetDates = useCallback((selectedPreset: DatePreset) => {
    const today = getTodayCalendarDate(); // YYYY-MM-DD
    const now = new Date();

    if (selectedPreset === 'TODAY') {
      return { start: today, end: today };
    } else if (selectedPreset === 'LAST_7_DAYS') {
      const past = new Date(now);
      past.setDate(past.getDate() - 7);
      const pastStr = past.toISOString().split('T')[0];
      return { start: pastStr, end: today };
    } else if (selectedPreset === 'THIS_MONTH') {
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const firstDay = `${year}-${month}-01`;
      return { start: firstDay, end: today };
    }
    return { start: '', end: '' };
  }, []);

  // Fetch KPIs
  const fetchKpis = useCallback(
    async (sDate?: string, eDate?: string) => {
      if (!token) return;

      setIsRefreshing(true);
      setErrorMessage(null);

      try {
        let url = `${apiUrl}/dashboard/kpis`;
        const params = new URLSearchParams();
        if (sDate) params.append('startDate', sDate);
        if (eDate) params.append('endDate', eDate);

        const queryString = params.toString();
        if (queryString) url += `?${queryString}`;

        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.message || `Error al obtener KPIs: HTTP ${res.status}`);
        }

        if (json.success && json.data) {
          setKpis(json.data);
          const now = new Date();
          setLastSyncTime(
            `${String(now.getHours() % 12 || 12).padStart(2, '0')}:${String(
              now.getMinutes()
            ).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')} ${
              now.getHours() >= 12 ? 'p. m.' : 'a. m.'
            }`
          );
        } else {
          throw new Error('Formato de datos no reconocido en la respuesta de KPIs');
        }
      } catch (err: any) {
        setErrorMessage(err.message || 'Error de comunicación con el motor de KPIs');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [apiUrl, token]
  );

  // Initial load with THIS_MONTH
  useEffect(() => {
    const dates = computePresetDates('THIS_MONTH');
    setStartDate(dates.start);
    setEndDate(dates.end);
    setCustomStart(dates.start);
    setCustomEnd(dates.end);
    fetchKpis(dates.start, dates.end);
  }, [computePresetDates, fetchKpis]);

  // Handle Preset Change
  const handlePresetChange = (newPreset: DatePreset) => {
    setPreset(newPreset);
    if (newPreset === 'CUSTOM') {
      return;
    }
    const dates = computePresetDates(newPreset);
    setStartDate(dates.start);
    setEndDate(dates.end);
    fetchKpis(dates.start, dates.end);
  };

  // Handle Custom Filter Apply with RN-007 Validation
  const handleApplyCustomDates = (e: React.FormEvent) => {
    e.preventDefault();
    if (customStart && customEnd && customStart > customEnd) {
      setErrorMessage(
        'Regla RN-007: La fecha inicial no puede ser posterior a la fecha final.'
      );
      return;
    }
    setStartDate(customStart);
    setEndDate(customEnd);
    fetchKpis(customStart, customEnd);
  };

  return (
    <div className="space-y-6 pb-20 max-w-7xl mx-auto">
      {/* ==================================================================== */}
      {/* 1. HEADER ROW & USER GREETING                                       */}
      {/* ==================================================================== */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <PageTitle>Panel de Control Operativo</PageTitle>
            <Badge variant="default" size="sm" className="bg-[#1D71CB] text-white">
              KPIs Canónicos (D-027)
            </Badge>
          </div>
          <MutedText>
            Telemetría ejecutiva en vivo de balance de patio, recepción maderera, despacho y entregas a clientes.
          </MutedText>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Sistema en Vivo</span>
          </div>
          <Badge variant="neutral" size="sm">
            {role || 'Usuario'}
          </Badge>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 2. CONTROL BAR & DATE PRESET SELECTOR (SCR-DSH-01.A)                 */}
      {/* ==================================================================== */}
      <Card className="border-slate-200 shadow-xs">
        <CardContent className="p-3.5 sm:p-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Presets pill group */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-500 mr-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                <span>Período:</span>
              </span>

              <button
                type="button"
                onClick={() => handlePresetChange('TODAY')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  preset === 'TODAY'
                    ? 'bg-[#1D71CB] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Hoy
              </button>

              <button
                type="button"
                onClick={() => handlePresetChange('LAST_7_DAYS')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  preset === 'LAST_7_DAYS'
                    ? 'bg-[#1D71CB] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Últimos 7 días
              </button>

              <button
                type="button"
                onClick={() => handlePresetChange('THIS_MONTH')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  preset === 'THIS_MONTH'
                    ? 'bg-[#1D71CB] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Este Mes
              </button>

              <button
                type="button"
                onClick={() => handlePresetChange('CUSTOM')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  preset === 'CUSTOM'
                    ? 'bg-[#1D71CB] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Personalizado
              </button>
            </div>

            {/* Refresh button & Last sync */}
            <div className="flex items-center gap-3 self-end lg:self-auto text-xs">
              {lastSyncTime && (
                <span className="text-slate-400 font-mono text-[11px] hidden sm:inline-block">
                  Última sincronización: <strong>{lastSyncTime}</strong>
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchKpis(startDate, endDate)}
                disabled={isRefreshing}
                className="h-8 gap-1.5 text-xs text-slate-700 hover:text-slate-900 border-slate-300 shadow-2xs"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`}
                />
                <span>Actualizar</span>
              </Button>
            </div>
          </div>

          {/* Custom Date Form (Shown only if CUSTOM preset is selected) */}
          {preset === 'CUSTOM' && (
            <form
              onSubmit={handleApplyCustomDates}
              className="mt-3 pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-end gap-3 animate-in fade-in duration-200"
            >
              <div className="w-full sm:w-44">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Fecha Inicial
                </label>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 font-mono focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="w-full sm:w-44">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Fecha Final
                </label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 font-mono focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <Button
                type="submit"
                size="sm"
                className="w-full sm:w-auto bg-[#1D71CB] hover:bg-[#165EA8] text-white text-xs h-8 px-4"
              >
                Aplicar Filtro
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {/* ERROR ALERT */}
      {errorMessage && (
        <Alert variant="destructive" className="animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="text-xs font-semibold">{errorMessage}</span>
          </div>
        </Alert>
      )}

      {/* ==================================================================== */}
      {/* 3. LOADING SKELETON                                                  */}
      {/* ==================================================================== */}
      {isLoading && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <Skeleton className="h-36 rounded-xl" />
            <Skeleton className="h-36 rounded-xl" />
            <Skeleton className="h-36 rounded-xl" />
            <Skeleton className="h-36 rounded-xl" />
            <Skeleton className="h-36 rounded-xl" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Skeleton className="h-72 rounded-xl" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 4. MAIN KPI GRID & COMPLEMENTARY SECTIONS (SCR-DSH-01.B & C)         */}
      {/* ==================================================================== */}
      {!isLoading && kpis && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* CUADRÍCULA DE LOS 5 KPIS OFICIALES */}
          <DashboardKpiGrid kpis={kpis} />

          {/* SECCIONES COMPLEMENTARIAS: TABLA DE PATIO + DISTRIBUCIÓN CLIENTES */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <DashboardYardSummary
              products={kpis.kpi1_currentInventory?.byProduct || []}
              totalPieces={kpis.kpi1_currentInventory?.totalPieces || 0}
            />

            <DashboardClientDistribution
              distribution={kpis.kpi5_dispatchesByClientCenter || []}
            />
          </div>

          {/* ACCESOS RÁPIDOS OPERATIVOS DE PLANTA */}
          <DashboardQuickActions />
        </div>
      )}
    </div>
  );
}
