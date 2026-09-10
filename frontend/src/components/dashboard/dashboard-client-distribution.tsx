'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import { Building2, ArrowRight } from 'lucide-react';
import { ClientCenterDispatch } from './types';
import Link from 'next/link';

interface DashboardClientDistributionProps {
  distribution: ClientCenterDispatch[];
}

export function DashboardClientDistribution({
  distribution,
}: DashboardClientDistributionProps) {
  const totalPieces = distribution.reduce((sum, d) => sum + (d.pieces || 0), 0);

  return (
    <Card className="border-slate-200 shadow-xs flex flex-col justify-between">
      <CardHeader className="p-4 sm:p-5 pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-amber-50 text-[#D97706]">
            <Building2 className="w-4 h-4" />
          </div>
          <div>
            <CardTitle className="text-sm font-bold text-slate-900">
              Distribución por Planta Cliente
            </CardTitle>
            <p className="text-xs text-slate-500">
              Salidas hacia los 7 centros de recepción en el período
            </p>
          </div>
        </div>

        <div className="text-right font-mono">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
            Total Despachado
          </span>
          <span className="text-base font-black tabular-nums text-amber-900">
            {totalPieces.toLocaleString('es-NI')} pcs
          </span>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5 flex-1 space-y-3.5">
        {distribution && distribution.length > 0 ? (
          distribution.map((item) => {
            const percentage =
              totalPieces > 0 ? Math.round((item.pieces / totalPieces) * 100) : 0;

            return (
              <div key={item.centerName} className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                    <span>{item.centerName}</span>
                  </span>
                  <div className="font-mono tabular-nums text-right">
                    <span className="font-bold text-slate-900">
                      {item.pieces.toLocaleString('es-NI')} pcs
                    </span>
                    <span className="text-slate-400 text-[11px] ml-1.5">
                      ({percentage}%)
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-[#D97706] rounded-full transition-all duration-500"
                    style={{ width: `${Math.max(percentage > 0 ? 3 : 0, percentage)}%` }}
                  />
                </div>
              </div>
            );
          })
        ) : (
          <p className="text-xs text-slate-400 italic py-6 text-center">
            Sin despachos registrados en el período
          </p>
        )}
      </CardContent>

      <div className="p-3 bg-slate-50/60 border-t border-slate-100 flex items-center justify-between text-xs">
        <span className="text-slate-500 font-medium">
          7 plantas cliente autorizadas
        </span>
        <Link
          href="/reports?tab=distribution"
          className="font-bold text-[#D97706] hover:text-amber-800 flex items-center gap-1 hover:underline"
        >
          <span>Ver Reporte de Distribución</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </Card>
  );
}
