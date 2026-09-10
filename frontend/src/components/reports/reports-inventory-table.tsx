'use client';

import React from 'react';
import { Card, CardContent, Badge } from '@/components/ui';
import { InventoryReportItem, InventoryReportSummary } from './types';
import { Boxes, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface ReportsInventoryTableProps {
  data: InventoryReportItem[];
  summary?: InventoryReportSummary;
  isLoading: boolean;
}

export function ReportsInventoryTable({
  data,
  summary,
  isLoading,
}: ReportsInventoryTableProps) {
  return (
    <div className="space-y-4">
      {/* SUMMARY KPI ROW */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 print:grid-cols-4">
          <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider block">
              Total Fabricado
            </span>
            <span className="text-xl font-black font-mono tabular-nums text-blue-900 mt-0.5 block">
              {summary.totalProduced.toLocaleString('es-NI')} pcs
            </span>
          </div>

          <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider block">
              Total Despachado
            </span>
            <span className="text-xl font-black font-mono tabular-nums text-amber-900 mt-0.5 block">
              {summary.totalDispatched.toLocaleString('es-NI')} pcs
            </span>
          </div>

          <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider block">
              Total Reincorporado (+)
            </span>
            <span className="text-xl font-black font-mono tabular-nums text-emerald-800 mt-0.5 block">
              +{summary.totalReturned.toLocaleString('es-NI')} pcs
            </span>
          </div>

          <div className="p-3 bg-slate-900 text-white rounded-xl border border-slate-800 shadow-xs">
            <span className="text-[10px] font-mono font-bold text-blue-300 uppercase tracking-wider block">
              Saldo Disponible Patio
            </span>
            <span className="text-xl font-black font-mono tabular-nums text-white mt-0.5 block">
              {summary.totalAvailableStock.toLocaleString('es-NI')} pcs
            </span>
          </div>
        </div>
      )}

      {/* TABLE CARD */}
      <Card className="border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-50 text-[#1D71CB]">
              <Boxes className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Reporte 3: Inventario Operativo Consolidado
              </h3>
              <p className="text-xs text-slate-500">
                Ecuación de balance matemático continuo: Stock = Producido - Despachado + Devoluciones ± Ajustes (RN-010)
              </p>
            </div>
          </div>

          <Link
            href="/inventory"
            className="text-xs font-semibold text-blue-700 hover:text-blue-900 flex items-center gap-1 hover:underline print:hidden"
          >
            <span>Ver Movimientos en Kardex</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">Producto Terminado</th>
                  <th className="py-2.5 px-3">Dimensiones</th>
                  <th className="py-2.5 px-4 text-right">Producción (+)</th>
                  <th className="py-2.5 px-4 text-right">Despachos (-)</th>
                  <th className="py-2.5 px-4 text-right">Devoluciones (+)</th>
                  <th className="py-2.5 px-4 text-right">Ajustes Netos (±)</th>
                  <th className="py-2.5 px-4 text-right">Stock Disponible en Patio</th>
                  <th className="py-2.5 px-3 text-center">Nivel</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data && data.length > 0 ? (
                  data.map((item) => {
                    const isZero = item.currentAvailableStock <= 0;
                    const isLow = item.currentAvailableStock > 0 && item.currentAvailableStock < 100;

                    return (
                      <tr key={item.productId} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-2.5 px-4 font-bold text-slate-900">
                          {item.productName}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-500 text-[11px]">
                          {item.dimensions}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-right tabular-nums text-blue-900">
                          {item.totalProduced.toLocaleString('es-NI')}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-right tabular-nums text-amber-900">
                          {item.totalDispatched.toLocaleString('es-NI')}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-right tabular-nums text-emerald-800">
                          +{item.totalReturned.toLocaleString('es-NI')}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-right tabular-nums text-slate-600">
                          {item.netAdjustments > 0 ? `+${item.netAdjustments}` : item.netAdjustments}
                        </td>
                        <td className="py-2.5 px-4 font-mono font-black text-right tabular-nums text-slate-900 text-sm">
                          <span
                            className={
                              isZero
                                ? 'text-rose-600'
                                : isLow
                                ? 'text-amber-700'
                                : 'text-slate-900'
                            }
                          >
                            {item.currentAvailableStock.toLocaleString('es-NI')}
                          </span>
                          <span className="text-[10px] text-slate-400 font-sans font-normal ml-1">pcs</span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <Badge
                            variant={isZero ? 'destructive' : isLow ? 'warning' : 'success'}
                            size="sm"
                          >
                            {isZero ? 'Agotado' : isLow ? 'Bajo' : 'Óptimo'}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400 italic">
                      No se encontraron productos en el inventario consolidado
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
