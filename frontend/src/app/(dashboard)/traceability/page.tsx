'use client';

import React, { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import {
  PageTitle,
  MutedText,
  Badge,
  Alert,
  Skeleton,
  Card,
  CardContent,
  Button,
} from '@/components/ui';
import {
  GitFork,
  Network,
  Clock,
  Layers,
  Sparkles,
  HelpCircle,
  Search,
  CheckCircle2,
  FileQuestion,
  RotateCcw,
} from 'lucide-react';
import { TraceabilitySearchBar } from '@/components/traceability/traceability-search-bar';
import { TraceabilityExecutiveBanner } from '@/components/traceability/traceability-executive-banner';
import { TraceabilityTimelineStages } from '@/components/traceability/traceability-timeline-stages';
import { TraceabilityDagGraph } from '@/components/traceability/traceability-dag-graph';
import {
  TraceabilityData,
  TraceabilityQueryType,
  OnDrillDownFn,
} from '@/components/traceability/types';

export default function TraceabilityPage() {
  const { session, role } = useAuth();
  const token = session?.access_token;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

  // Search & Query State
  const [queryType, setQueryType] = useState<TraceabilityQueryType>('LOT_PRODUCTION');
  const [queryValue, setQueryValue] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [data, setData] = useState<TraceabilityData | null>(null);
  const [hasSearched, setHasSearched] = useState<boolean>(false);

  // Active Presentation Mode: ALL (both), TIMELINE (stages only), GRAPH (DAG only)
  const [activeView, setActiveView] = useState<'ALL' | 'TIMELINE' | 'GRAPH'>('ALL');

  // Core Search Dispatcher (EP-TRC-01)
  const handleSearch = async (type: TraceabilityQueryType, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setSearchError('Por favor ingrese un código de lote o número de factura válido.');
      return;
    }
    if (!token) {
      setSearchError('Sesión no disponible o expirada. Inicie sesión nuevamente.');
      return;
    }

    setIsLoading(true);
    setSearchError(null);
    setHasSearched(true);

    try {
      const url = `${apiUrl}/traceability?queryType=${type}&queryValue=${encodeURIComponent(trimmed)}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const json = await res.json();
      if (!res.ok) {
        if (res.status === 404) {
          setData(null);
          setSearchError(
            `No se encontró ningún registro para '${trimmed}' (${
              type === 'LOT_PRODUCTION'
                ? 'Lote de Producción'
                : type === 'LOT_WOOD'
                ? 'Lote de Madera'
                : 'Factura de Despacho'
            }). Verifique la nomenclatura e intente con otra consulta.`
          );
        } else {
          throw new Error(json.message || `Error al consultar trazabilidad: HTTP ${res.status}`);
        }
      } else if (json.success && json.data) {
        setData(json.data);
      } else {
        setData(null);
        setSearchError('Respuesta inesperada del motor de trazabilidad.');
      }
    } catch (err: any) {
      setData(null);
      setSearchError(err.message || 'Error de conexión con el servidor.');
    } finally {
      setIsLoading(false);
    }
  };

  // Pivot Drill-Down Handler
  const handleDrillDown: OnDrillDownFn = (newType, newValue) => {
    setQueryType(newType);
    setQueryValue(newValue);
    handleSearch(newType, newValue);
    // Smooth scroll to top of results
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="space-y-6 pb-20 max-w-7xl mx-auto">
      {/* ==================================================================== */}
      {/* 1. PAGE TITLE & STATUS HEADER                                       */}
      {/* ==================================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <PageTitle>Trazabilidad Transversal</PageTitle>
            <Badge variant="default" size="sm" className="bg-[#1D71CB] text-white">
              DAG Engine
            </Badge>
          </div>
          <MutedText>
            Genealogía industrial bidireccional: reconstrucción forense desde la troza de madera hasta el cliente y devoluciones (TSK-22).
          </MutedText>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="neutral" size="sm">
            Modo Consulta 100% Read-Only
          </Badge>
          <span className="text-xs font-mono text-slate-500 font-semibold px-2.5 py-1 rounded bg-slate-100 border border-slate-200">
            {role || 'Usuario'}
          </span>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 2. SEARCH BAR & QUICK CHIPS (SCR-TRC-01.A)                          */}
      {/* ==================================================================== */}
      <TraceabilitySearchBar
        queryType={queryType}
        queryValue={queryValue}
        isLoading={isLoading}
        onQueryTypeChange={setQueryType}
        onQueryValueChange={setQueryValue}
        onSearch={handleSearch}
      />

      {/* ==================================================================== */}
      {/* 3. ERROR & 404 FEEDBACK ALERTS                                      */}
      {/* ==================================================================== */}
      {searchError && (
        <Alert variant="destructive" className="animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="font-bold text-sm">Registro no localizado o error de consulta</p>
              <p className="text-xs text-rose-800">{searchError}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchError(null);
                  handleDrillDown('LOT_PRODUCTION', 'LT-070926-W37');
                }}
                className="text-xs bg-white text-rose-900 border-rose-300 hover:bg-rose-50"
              >
                Cargar lote de prueba
              </Button>
            </div>
          </div>
        </Alert>
      )}

      {/* ==================================================================== */}
      {/* 4. LOADING SKELETON                                                  */}
      {/* ==================================================================== */}
      {isLoading && (
        <div className="space-y-6 animate-pulse">
          {/* Executive banner skeleton */}
          <div className="h-44 bg-slate-200 rounded-xl w-full" />
          {/* 5 Stages Skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="h-64 bg-slate-200 rounded-xl" />
            <div className="h-64 bg-slate-200 rounded-xl" />
            <div className="h-64 bg-slate-200 rounded-xl" />
            <div className="h-64 bg-slate-200 rounded-xl" />
            <div className="h-64 bg-slate-200 rounded-xl" />
          </div>
          {/* DAG Skeleton */}
          <div className="h-72 bg-slate-200 rounded-xl w-full" />
        </div>
      )}

      {/* ==================================================================== */}
      {/* 5. INITIAL WELCOME GUIDE (BEFORE FIRST SEARCH)                       */}
      {/* ==================================================================== */}
      {!hasSearched && !isLoading && (
        <Card className="border-dashed border-2 border-slate-300 bg-gradient-to-b from-slate-50 to-white">
          <CardContent className="py-14 px-6 text-center max-w-2xl mx-auto space-y-5">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 text-[#1D71CB] flex items-center justify-center mx-auto shadow-xs border border-blue-100">
              <Network className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-bold text-slate-900">
                Consola Industrial de Trazabilidad Transversal
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Consulte cualquier nodo de la cadena productiva para reconstruir su genealogía completa:
                origen de materia prima, lote de aserrío, tratamiento fitosanitario OIRSA, clientes receptores y devoluciones registradas.
              </p>
            </div>

            {/* Feature Highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 text-left">
              <div className="p-3.5 rounded-lg bg-white border border-slate-200 shadow-2xs">
                <span className="font-mono text-xs font-bold text-blue-700 block mb-1">
                  1. LOT_PRODUCTION
                </span>
                <p className="text-xs text-slate-600">
                  Rastrea desde el lote fabricado (ej: <code>LT-070926-W37</code>) hacia atrás (madera) y hacia adelante (despachos).
                </p>
              </div>
              <div className="p-3.5 rounded-lg bg-white border border-slate-200 shadow-2xs">
                <span className="font-mono text-xs font-bold text-emerald-700 block mb-1">
                  2. LOT_WOOD
                </span>
                <p className="text-xs text-slate-600">
                  Rastrea el lote de recepción de madera (ej: <code>LT-070926-01</code>) y todas las producciones que alimentó.
                </p>
              </div>
              <div className="p-3.5 rounded-lg bg-white border border-slate-200 shadow-2xs">
                <span className="font-mono text-xs font-bold text-amber-700 block mb-1">
                  3. INVOICE
                </span>
                <p className="text-xs text-slate-600">
                  Rastrea la factura o remisión (ej: <code>00004</code>) hasta el lote fabricado y la madera original de patio.
                </p>
              </div>
            </div>

            <div className="pt-3">
              <Button
                onClick={() => handleDrillDown('LOT_PRODUCTION', 'LT-070926-W37')}
                className="bg-[#1D71CB] hover:bg-[#165ba3] text-white gap-2 font-semibold text-sm px-6 h-10 shadow-xs"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>Explorar Lote de Demostración (LT-070926-W37)</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ==================================================================== */}
      {/* 6. RESULTS SECTION (SCR-TRC-01.B, C, D)                             */}
      {/* ==================================================================== */}
      {data && !isLoading && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* A. EXECUTIVE BANNER WITH TELEMETRY & YARD BALANCE */}
          <TraceabilityExecutiveBanner data={data} />

          {/* VIEW SWITCHER TABS */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-2">
            <div className="flex items-center gap-1.5 p-1 rounded-lg bg-slate-100 border border-slate-200 self-start">
              <button
                type="button"
                onClick={() => setActiveView('ALL')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activeView === 'ALL'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Vista Completa (Ambas)</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveView('TIMELINE')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activeView === 'TIMELINE'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Línea de Tiempo (5 Etapas)</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveView('GRAPH')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activeView === 'GRAPH'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <GitFork className="w-3.5 h-3.5" />
                <span>Grafo DAG ({data.graph?.nodes.length || 0} Nodos)</span>
              </button>
            </div>

            <div className="text-xs text-slate-500 font-mono">
              Navegación Interactiva: <strong>Haga clic en cualquier código para pivotar</strong>
            </div>
          </div>

          {/* B. 5-STAGE CHRONOLOGICAL TIMELINE */}
          {(activeView === 'ALL' || activeView === 'TIMELINE') && (
            <div className="animate-in fade-in duration-200">
              <TraceabilityTimelineStages data={data} onDrillDown={handleDrillDown} />
            </div>
          )}

          {/* C. VISUAL DAG GRAPH EXPLORER */}
          {(activeView === 'ALL' || activeView === 'GRAPH') &&
            data.graph &&
            data.graph.nodes &&
            data.graph.nodes.length > 0 && (
              <div className="animate-in fade-in duration-200">
                <TraceabilityDagGraph
                  nodes={data.graph.nodes}
                  edges={data.graph.edges || []}
                  currentQueryValue={data.queryValue}
                  onDrillDown={handleDrillDown}
                />
              </div>
            )}
        </div>
      )}
    </div>
  );
}
