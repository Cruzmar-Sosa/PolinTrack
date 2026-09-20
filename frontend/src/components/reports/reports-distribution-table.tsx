'use client';

import React from 'react';
import { Card, CardContent, Badge } from '@/components/ui';
import { DistributionCenterReportItem, DistributionCenterReportSummary } from './types';
import { Building2 } from 'lucide-react';

interface ReportsDistributionTableProps {
  data: DistributionCenterReportItem[];
  summary?: DistributionCenterReportSummary;
  isLoading: boolean;
}

export function ReportsDistributionTable({
  data,
  summary,
  isLoading,
}: ReportsDistributionTableProps) {
  const totalNet = summary?.netDelivered ?? data.reduce((sum, d) => sum + (d.netDelivered || 0), 0);

  return (
    <div className="space-y-4">
      {/* SUMMARY KPI ROW */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 print:grid-cols-4">
          <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider block">
              Total Remisiones
            </span>
            <span className="text-xl font-black font-mono tabular-nums text-slate-900 mt-0.5 block">
              {summary.totalInvoicesCount.toLocaleString('es-NI')} facturas
            </span>
          </div>

          <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider block">
              Total Salidas
            </span>
            <span className="text-xl font-black font-mono tabular-nums text-amber-900 mt-0.5 block">
              {summary.totalDispatched.toLocaleString('es-NI')} pcs
            </span>
          </div>

          <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider block">
              Total Retornos (-)
            </span>
            <span className="text-xl font-black font-mono tabular-nums text-rose-700 mt-0.5 block">
              -{summary.totalReturned.toLocaleString('es-NI')} pcs
            </span>
          </div>

          <div className="p-3 bg-slate-900 text-white rounded-xl border border-slate-800 shadow-xs print:bg-slate-100 print:text-slate-900 print:border-slate-300">
            <span className="text-[10px] font-mono font-bold text-emerald-400 uppercase tracking-wider block print:text-slate-700">
              Neto Recibido en Plantas
            </span>
            <span className="text-xl font-black font-mono tabular-nums text-white mt-0.5 block print:text-slate-900">
              {summary.netDelivered.toLocaleString('es-NI')} pcs
            </span>
          </div>
        </div>
      )}

      {/* TABLE CARD */}
      <Card className="border-slate-200 shadow-xs overflow-hidden print:border-0 print:shadow-none print:rounded-none">
        <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-slate-100 text-slate-700">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Reporte 6: Salidas por Centro de Distribución
              </h3>
              <p className="text-xs text-slate-500">
                Balance de entregas y devoluciones por cada una de las 7 plantas cliente
              </p>
            </div>
          </div>

          <span className="text-xs font-mono text-slate-500">
            Plantas activas: <strong>{data.length} de 7</strong>
          </span>
        </div>

        <CardContent className="p-0">
          <div className="overflow-x-auto print:overflow-visible w-full">
            <table className="w-full text-xs text-left min-w-[850px] print:min-w-0 print:w-full print:text-[11px] md:print:text-xs">
              <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4 whitespace-nowrap">Centro Cliente</th>
                  <th className="py-2.5 px-3 text-center whitespace-nowrap">Facturas</th>
                  <th className="py-2.5 px-4 text-right whitespace-nowrap">Total Despachado</th>
                  <th className="py-2.5 px-4 text-right whitespace-nowrap">Devoluciones (-)</th>
                  <th className="py-2.5 px-4 text-right whitespace-nowrap">Neto Entregado</th>
                  <th className="py-2.5 px-4 text-right whitespace-nowrap">Participación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data && data.length > 0 ? (
                  data.map((item) => {
                    const participation =
                      totalNet > 0
                        ? Math.round((item.netDelivered / totalNet) * 100)
                        : 0;

                    return (
                      <tr key={item.clientCenterId} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-2.5 px-4 font-bold text-slate-900 whitespace-nowrap">
                          {item.clientCenterName}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-center text-slate-600 whitespace-nowrap">
                          <span className="px-2 py-0.5 bg-slate-100 rounded border border-slate-200 text-xs">
                            {item.invoicesCount}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 font-mono text-right tabular-nums text-amber-900 whitespace-nowrap">
                          {item.totalDispatched.toLocaleString('es-NI')} pcs
                        </td>
                        <td className="py-2.5 px-4 font-mono text-right tabular-nums text-rose-700 whitespace-nowrap">
                          {item.totalReturned > 0 ? `-${item.totalReturned.toLocaleString('es-NI')}` : '0'}{' '}
                          pcs
                        </td>
                        <td className="py-2.5 px-4 font-mono font-black text-right tabular-nums text-slate-900 text-sm whitespace-nowrap">
                          {item.netDelivered.toLocaleString('es-NI')}{' '}
                          <span className="text-[10px] text-slate-400 font-sans font-normal">pcs</span>
                        </td>
                        <td className="py-2.5 px-4 font-mono font-bold text-right tabular-nums text-slate-700 whitespace-nowrap">
                          {participation}%
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400 italic">
                      No se registraron movimientos en los centros cliente para el período seleccionado
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
