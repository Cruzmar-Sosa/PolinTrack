'use client';

import React from 'react';
import { Card, Badge } from '@/components/ui';
import { Network, Factory, Calendar, User, ArrowRight, Layers, Truck, RotateCcw, Boxes } from 'lucide-react';
import { formatDate } from '@/lib/date-formatters';
import { TraceabilityData } from './types';

interface TraceabilityExecutiveBannerProps {
  data: TraceabilityData;
}

export function TraceabilityExecutiveBanner({ data }: { data: TraceabilityData }) {
  const status = data.currentLotStatus;
  const initialProduced = status?.initialProduced || data.production?.quantityProduced || 0;
  const totalDispatched = data.dispatches?.reduce((sum, d) => sum + (d.quantityDispatched || 0), 0) || 0;
  const totalReturned = data.returns?.reduce((sum, r) => sum + (r.quantityReturned || 0), 0) || 0;
  const currentlyDelivered = status?.currentlyDelivered ?? Math.max(0, totalDispatched - totalReturned);
  const availableInYard = status?.availableInYard ?? Math.max(0, initialProduced - currentlyDelivered);

  // Percentage calculations
  const dispatchedPercentage = initialProduced > 0
    ? Math.min(100, Math.round((currentlyDelivered / initialProduced) * 100))
    : 0;
  const yardPercentage = Math.max(0, 100 - dispatchedPercentage);

  return (
    <div className="rounded-xl bg-slate-900 text-white shadow-md border border-slate-800 overflow-hidden">
      {/* TOP HEADER ROW */}
      <div className="p-5 sm:p-6 border-b border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-800/90">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="p-3 rounded-xl bg-blue-600/20 text-[#1D71CB] border border-blue-500/30 shrink-0">
            <Network className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Consulta: {data.queryType === 'LOT_PRODUCTION' ? 'Lote de Producción' : data.queryType === 'LOT_WOOD' ? 'Lote de Madera' : 'Factura de Despacho'}
              </span>
              <span className="font-mono text-xs px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-400/30 font-semibold">
                {data.queryValue}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black font-mono tracking-tight text-white mt-1">
              {data.production?.lot || data.queryValue}
              {data.production?.product && (
                <span className="text-sm sm:text-base font-normal text-slate-300 font-sans ml-2">
                  — {data.production.product}
                </span>
              )}
            </h2>
            {data.production?.dimensions && (
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Dimensiones normalizadas: {data.production.dimensions}
              </p>
            )}
          </div>
        </div>

        {/* METADATA PILLS */}
        {data.production && (
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-slate-300 bg-slate-800/80 p-2.5 rounded-lg border border-slate-700/60 shrink-0">
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-blue-400" />
              <span>Semana ISO <strong>W{data.production.isoWeek}</strong></span>
            </span>
            <span className="text-slate-600">•</span>
            <span>{formatDate(data.production.productionDate)}</span>
            {data.production.supervisor && (
              <>
                <span className="text-slate-600">•</span>
                <span className="flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span className="truncate max-w-[140px] sm:max-w-[180px]">{data.production.supervisor}</span>
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* METRIC GRID (4 BALANCE CARDS) */}
      <div className="p-5 sm:p-6 bg-slate-900/90 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Producido */}
          <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Total Producido
              </span>
              <Layers className="w-4 h-4 text-blue-400" />
            </div>
            <p className="text-2xl font-black font-mono text-white tabular-nums mt-1">
              {initialProduced.toLocaleString()} <span className="text-xs font-normal text-slate-400">pcs</span>
            </p>
            <p className="text-[10px] text-slate-400 mt-1">Orden de aserrío original</p>
          </div>

          {/* Despachado */}
          <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                Total Despachado
              </span>
              <Truck className="w-4 h-4 text-amber-400" />
            </div>
            <p className="text-2xl font-black font-mono text-amber-300 tabular-nums mt-1">
              {totalDispatched.toLocaleString()} <span className="text-xs font-normal text-slate-400">pcs</span>
            </p>
            <p className="text-[10px] text-slate-400 mt-1">
              Salidas en {data.dispatches?.length || 0} remisiones
            </p>
          </div>

          {/* Reincorporado */}
          <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
                Reincorporado (+)
              </span>
              <RotateCcw className="w-4 h-4 text-indigo-400" />
            </div>
            <p className="text-2xl font-black font-mono text-indigo-300 tabular-nums mt-1">
              {totalReturned > 0 ? `+${totalReturned.toLocaleString()}` : '0'}{' '}
              <span className="text-xs font-normal text-slate-400">pcs</span>
            </p>
            <p className="text-[10px] text-slate-400 mt-1">
              {data.returns?.length || 0} devoluciones aprobadas
            </p>
          </div>

          {/* Disponible en Patio */}
          <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                Disponible en Patio
              </span>
              <Boxes className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-2xl font-black font-mono text-emerald-300 tabular-nums mt-1">
              {availableInYard.toLocaleString()} <span className="text-xs font-normal text-slate-400">pcs</span>
            </p>
            <p className="text-[10px] text-emerald-400/80 mt-1">Saldo físico en inventario</p>
          </div>
        </div>

        {/* PROGRESS BAR: DISPATCHED VS IN YARD */}
        {initialProduced > 0 && (
          <div className="pt-2">
            <div className="flex justify-between items-center text-xs font-mono text-slate-400 mb-1.5">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                <span>Despachado neto: <strong>{currentlyDelivered} pcs</strong> ({dispatchedPercentage}%)</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                <span>En Patio: <strong>{availableInYard} pcs</strong> ({yardPercentage}%)</span>
              </span>
            </div>
            <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden flex border border-slate-700/50">
              <div
                style={{ width: `${dispatchedPercentage}%` }}
                className="bg-amber-500 transition-all duration-500"
                title={`Despachado: ${dispatchedPercentage}%`}
              />
              <div
                style={{ width: `${yardPercentage}%` }}
                className="bg-emerald-500 transition-all duration-500"
                title={`En Patio: ${yardPercentage}%`}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
