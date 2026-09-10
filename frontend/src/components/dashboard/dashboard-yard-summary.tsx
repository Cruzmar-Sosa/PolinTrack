'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent, Badge } from '@/components/ui';
import { Boxes, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import { ProductStock } from './types';
import Link from 'next/link';

interface DashboardYardSummaryProps {
  products: ProductStock[];
  totalPieces: number;
}

export function DashboardYardSummary({ products, totalPieces }: DashboardYardSummaryProps) {
  return (
    <Card className="border-slate-200 shadow-xs flex flex-col justify-between">
      <CardHeader className="p-4 sm:p-5 pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-blue-50 text-[#1D71CB]">
            <Boxes className="w-4 h-4" />
          </div>
          <div>
            <CardTitle className="text-sm font-bold text-slate-900">
              Balance de Patio en Vivo
            </CardTitle>
            <p className="text-xs text-slate-500">
              Disponibilidad consolidada para entrega inmediata (RN-010)
            </p>
          </div>
        </div>

        <div className="text-right font-mono">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
            Total Patio
          </span>
          <span className="text-base font-black tabular-nums text-slate-900">
            {totalPieces.toLocaleString('es-NI')} pcs
          </span>
        </div>
      </CardHeader>

      <CardContent className="p-0 flex-1">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4">Polín Terminado</th>
                <th className="py-2.5 px-3">Dimensiones</th>
                <th className="py-2.5 px-3 text-center">Estado</th>
                <th className="py-2.5 px-4 text-right">Disponible en Patio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products && products.length > 0 ? (
                products.map((prod) => {
                  const isZero = prod.stock <= 0;
                  const isLow = prod.stock > 0 && prod.stock < 100;

                  return (
                    <tr key={prod.productId} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 px-4 font-semibold text-slate-900">
                        {prod.productName}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-500 text-[11px]">
                        {prod.dimensions}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge
                          variant={isZero ? 'destructive' : isLow ? 'warning' : 'success'}
                          size="sm"
                        >
                          {isZero ? 'Agotado (0)' : isLow ? 'Bajo (<100)' : 'Óptimo (>100)'}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-4 font-mono font-black text-right tabular-nums text-sm">
                        <span
                          className={
                            isZero
                              ? 'text-rose-600'
                              : isLow
                              ? 'text-amber-700'
                              : 'text-slate-900'
                          }
                        >
                          {prod.stock.toLocaleString('es-NI')}
                        </span>
                        <span className="text-[10px] text-slate-400 font-sans ml-1">pcs</span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-slate-400 italic">
                    Sin existencias calculadas en patio
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>

      <div className="p-3 bg-slate-50/60 border-t border-slate-100 flex items-center justify-between text-xs">
        <span className="text-slate-500 font-medium">
          Semáforo: &gt;100 Verde • 1–99 Ámbar • 0 Rojo
        </span>
        <Link
          href="/inventory"
          className="font-bold text-[#1D71CB] hover:text-[#165EA8] flex items-center gap-1 hover:underline"
        >
          <span>Ver Kardex Completo</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </Card>
  );
}
