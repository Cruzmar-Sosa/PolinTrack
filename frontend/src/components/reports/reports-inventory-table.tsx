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
              +{(summary.totalReturnedRework ?? summary.totalReturned).toLocaleString('es-NI')} pcs
            </span>
            <div className="text-[10px] block mt-1 font-medium space-y-0.5">
              <span className="text-emerald-700 block">
                Retorno a Patio (Reproceso): +{(summary.totalReturnedRework ?? summary.totalReturned).toLocaleString('es-NI')} pcs
              </span>
              <span className="text-rose-600 block">
                Pérdida (Desecho): -{(summary.totalReturnedScrap ?? 0).toLocaleString('es-NI')} pcs
              </span>
            </div>
          </div>

          <div className="p-3 bg-slate-900 text-white rounded-xl border border-slate-800 shadow-xs print:bg-slate-100 print:text-slate-900 print:border-slate-300">
            <span className="text-[10px] font-mono font-bold text-blue-300 uppercase tracking-wider block print:text-slate-700">
              Saldo Disponible Patio
            </span>
            <span className="text-xl font-black font-mono tabular-nums text-white mt-0.5 block print:text-slate-900">
              {summary.totalAvailableStock.toLocaleString('es-NI')} pcs
            </span>
          </div>
        </div>
      )}

      {/* TABLE CARD */}
      <Card className="border-slate-200 shadow-xs overflow-hidden print:border-0 print:shadow-none print:rounded-none">
        <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
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
          <div className="overflow-x-auto print:overflow-visible w-full">
            <table className="w-full text-xs text-left min-w-[1050px] print:min-w-0 print:w-full print:text-[11px] md:print:text-xs">
              <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4 whitespace-nowrap">Producto Terminado</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Dimensiones</th>
                  <th className="py-2.5 px-4 text-right whitespace-nowrap">Producción (+)</th>
                  <th className="py-2.5 px-4 text-right whitespace-nowrap">Despachos (-)</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">DEVOLUCIONES: REPROCESO (+)</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">DEVOLUCIONES: DESECHO (-)</th>
                  <th className="py-2.5 px-4 text-right whitespace-nowrap">Ajustes Netos (±)</th>
                  <th className="py-2.5 px-4 text-right whitespace-nowrap">Stock Disponible en Patio</th>
                  <th className="py-2.5 px-3 text-center whitespace-nowrap">Nivel</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data && data.length > 0 ? (
                  data.map((item) => {
                    const isZero = item.currentAvailableStock <= 0;
                    const isLow = item.currentAvailableStock > 0 && item.currentAvailableStock < 100;
                    const reworkQty = item.totalReturnedRework ?? item.totalReturned ?? 0;
                    const scrapQty = item.totalReturnedScrap ?? 0;

                    return (
                      <tr key={item.productId} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-2.5 px-4 font-bold text-slate-900 whitespace-nowrap">
                          {item.productName}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-500 text-[11px] whitespace-nowrap">
                          {item.dimensions}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-right tabular-nums text-blue-900 whitespace-nowrap">
                          {item.totalProduced.toLocaleString('es-NI')}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-right tabular-nums text-amber-900 whitespace-nowrap">
                          {item.totalDispatched.toLocaleString('es-NI')}
                        </td>
                        {/* CELDA 1: REPROCESO (+) */}
                        <td className="py-2.5 px-3 text-right align-middle whitespace-nowrap font-mono tabular-nums">
                          {reworkQty > 0 ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <span className="font-mono font-bold text-emerald-600">
                                +{reworkQty.toLocaleString('es-NI')}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-300 font-mono">0</span>
                          )}
                        </td>
                        {/* CELDA 2: DESECHO (-) */}
                        <td className="py-2.5 px-3 text-right align-middle whitespace-nowrap font-mono tabular-nums">
                          {scrapQty > 0 ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <span className="font-mono font-bold text-rose-600">
                                -{scrapQty.toLocaleString('es-NI')}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-300 font-mono">0</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-right tabular-nums text-slate-600 whitespace-nowrap">
                          {item.netAdjustments > 0 ? `+${item.netAdjustments}` : item.netAdjustments}
                        </td>
                        <td className="py-2.5 px-4 font-mono font-black text-right tabular-nums text-slate-900 text-sm whitespace-nowrap">
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
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
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
                    <td colSpan={9} className="py-12 text-center text-slate-400 italic">
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
