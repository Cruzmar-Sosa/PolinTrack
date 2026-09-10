'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from '@/components/ui';
import {
  Boxes,
  Trees,
  Truck,
  Repeat,
  Building2,
  ChevronDown,
  ChevronUp,
  Layers,
  ArrowUpRight,
} from 'lucide-react';
import { DashboardKpisData } from './types';
import Link from 'next/link';

interface DashboardKpiGridProps {
  kpis: DashboardKpisData;
}

export function DashboardKpiGrid({ kpis }: DashboardKpiGridProps) {
  const [showProductBreakdown, setShowProductBreakdown] = useState(false);

  // Totals
  const totalPatio = kpis.kpi1_currentInventory?.totalPieces ?? 0;
  const timbrePt = kpis.kpi2_woodReceipts?.timbrePieTablarTotal ?? 0;
  const procesadaPcs = kpis.kpi2_woodReceipts?.procesadaPiecesTotal ?? 0;
  const dispatchedPcs = kpis.kpi3_polinesDispatched?.totalPieces ?? 0;
  const woodEquivPcs = kpis.kpi4_woodDispatchedEquivalent?.totalDispatchedEquivalent ?? 0;
  const centers = kpis.kpi5_dispatchesByClientCenter ?? [];
  const topCenter = centers.reduce(
    (max, c) => (c.pieces > (max?.pieces || 0) ? c : max),
    centers[0]
  );

  return (
    <div className="space-y-4">
      {/* 5 KPI CARDS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* KPI 1 — Existencias Físicas en Patio (#1D71CB) */}
        <Card className="border-t-4 border-t-[#1D71CB] shadow-xs relative overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                KPI 1 • Existencias Patio
              </span>
              <div className="p-2 rounded-lg bg-blue-50 text-[#1D71CB]">
                <Boxes className="w-4 h-4" />
              </div>
            </div>

            <div className="mt-1">
              <div className="text-3xl font-black font-mono tabular-nums text-slate-900 tracking-tight">
                {totalPatio.toLocaleString('es-NI')}
                <span className="text-xs font-sans font-semibold text-slate-500 ml-1.5">pcs</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Polines terminados listos para despacho
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowProductBreakdown(!showProductBreakdown)}
                className="text-xs font-semibold text-blue-700 hover:text-blue-900 inline-flex items-center gap-1 hover:underline"
              >
                <span>{showProductBreakdown ? 'Ocultar' : 'Ver'} 5 polines</span>
                {showProductBreakdown ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
              <Link
                href="/inventory"
                className="text-[11px] text-slate-400 hover:text-slate-600 flex items-center gap-0.5"
                title="Ir a Inventario"
              >
                <span>Kardex</span>
                <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* KPI 2 — Ingreso de Materia Prima (#3A6A44) */}
        <Card className="border-t-4 border-t-[#3A6A44] shadow-xs relative overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                KPI 2 • Ingreso Madera
              </span>
              <div className="p-2 rounded-lg bg-emerald-50 text-[#3A6A44]">
                <Trees className="w-4 h-4" />
              </div>
            </div>

            <div className="mt-1 space-y-2">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Madera Timbre (Troza)
                </span>
                <div className="text-xl font-bold font-mono tabular-nums text-slate-900">
                  {timbrePt.toLocaleString('es-NI', { maximumFractionDigits: 1 })}
                  <span className="text-xs font-sans font-semibold text-slate-500 ml-1">pt</span>
                </div>
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Madera Procesada
                </span>
                <div className="text-lg font-bold font-mono tabular-nums text-emerald-800">
                  {procesadaPcs.toLocaleString('es-NI')}
                  <span className="text-xs font-sans font-semibold text-slate-500 ml-1">pcs</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Unidad por tipo (RN-016)</span>
              <Link
                href="/operations/wood-receipts"
                className="text-[11px] text-emerald-700 hover:text-emerald-900 font-semibold flex items-center gap-0.5"
              >
                <span>Ingresos</span>
                <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* KPI 3 — Salidas de Polines Terminados (#D97706) */}
        <Card className="border-t-4 border-t-[#D97706] shadow-xs relative overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                KPI 3 • Despachos
              </span>
              <div className="p-2 rounded-lg bg-amber-50 text-[#D97706]">
                <Truck className="w-4 h-4" />
              </div>
            </div>

            <div className="mt-1">
              <div className="text-3xl font-black font-mono tabular-nums text-amber-900 tracking-tight">
                {dispatchedPcs.toLocaleString('es-NI')}
                <span className="text-xs font-sans font-semibold text-slate-500 ml-1.5">pcs</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Polines facturados en el período
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Salidas confirmadas</span>
              <Link
                href="/operations/dispatches"
                className="text-[11px] text-amber-700 hover:text-amber-900 font-semibold flex items-center gap-0.5"
              >
                <span>Remisiones</span>
                <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* KPI 4 — Madera Despachada Equivalente */}
        <Card className="border-t-4 border-t-purple-600 shadow-xs relative overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                KPI 4 • Madera Despachada
              </span>
              <div className="p-2 rounded-lg bg-purple-50 text-purple-600">
                <Repeat className="w-4 h-4" />
              </div>
            </div>

            <div className="mt-1">
              <div className="text-3xl font-black font-mono tabular-nums text-purple-950 tracking-tight">
                {woodEquivPcs.toLocaleString('es-NI')}
                <span className="text-xs font-sans font-semibold text-slate-500 ml-1.5">pcs</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Equivalente físico de madera salida
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Volumen de salida neto</span>
              <Badge variant="neutral" size="sm">
                100% trazable
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* KPI 5 — Despachos por Centro de Distribución */}
        <Card className="border-t-4 border-t-slate-700 shadow-xs relative overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                KPI 5 • Centros Clientes
              </span>
              <div className="p-2 rounded-lg bg-slate-100 text-slate-700">
                <Building2 className="w-4 h-4" />
              </div>
            </div>

            <div className="mt-1">
              <div className="text-3xl font-black font-mono tabular-nums text-slate-900 tracking-tight">
                {centers.length}
                <span className="text-xs font-sans font-semibold text-slate-500 ml-1.5">
                  plantas
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 truncate" title={topCenter?.centerName}>
                Líder:{' '}
                <strong className="text-slate-700">
                  {topCenter ? `${topCenter.centerName} (${topCenter.pieces} pcs)` : 'Sin despachos'}
                </strong>
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>7 centros configurados</span>
              <span className="text-[10px] font-mono text-slate-400">Planta 1-6, Camanica</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* KPI 1 PRODUCT BREAKDOWN DRAWER/ACCORDION */}
      {showProductBreakdown && kpis.kpi1_currentInventory?.byProduct && (
        <Card className="border-blue-200 bg-blue-50/40 animate-in fade-in slide-in-from-top-2 duration-200 shadow-xs">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#1D71CB]" />
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                  Desglose Canónico de Existencias en Patio por Polín (5 Tipos)
                </h4>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowProductBreakdown(false)}
                className="text-xs text-slate-500 hover:text-slate-700 h-7"
              >
                Cerrar
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {kpis.kpi1_currentInventory.byProduct.map((p) => {
                const isZero = p.stock <= 0;
                const isLow = p.stock > 0 && p.stock < 100;
                return (
                  <div
                    key={p.productId}
                    className="p-3 bg-white rounded-lg border border-slate-200 shadow-2xs space-y-1"
                  >
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-bold text-slate-800 truncate" title={p.productName}>
                        {p.productName}
                      </span>
                      <Badge
                        variant={isZero ? 'destructive' : isLow ? 'warning' : 'success'}
                        size="sm"
                      >
                        {isZero ? 'Agotado' : isLow ? 'Bajo' : 'Óptimo'}
                      </Badge>
                    </div>
                    <p className="text-[11px] font-mono text-slate-400">
                      Dim: {p.dimensions}
                    </p>
                    <div className="text-lg font-black font-mono tabular-nums text-slate-900 pt-1">
                      {p.stock.toLocaleString('es-NI')}{' '}
                      <span className="text-[10px] font-sans font-medium text-slate-500">pcs</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
