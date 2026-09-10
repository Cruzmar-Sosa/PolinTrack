'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import {
  Trees,
  Factory,
  Truck,
  GitFork,
  FileSpreadsheet,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';

export function DashboardQuickActions() {
  const actions = [
    {
      title: 'Recepción de Madera',
      code: 'M03',
      description: 'Registro de trozas o madera procesada con lote determinístico.',
      href: '/operations/wood-receipts',
      color: 'bg-emerald-50 text-[#3A6A44] border-emerald-200 hover:border-emerald-400',
      icon: Trees,
    },
    {
      title: 'Producción Diaria',
      code: 'M04',
      description: 'Aserrío y fabricación de polines por semana ISO 8601.',
      href: '/operations/daily-production',
      color: 'bg-blue-50 text-[#1D71CB] border-blue-200 hover:border-blue-400',
      icon: Factory,
    },
    {
      title: 'Salidas y Despachos',
      code: 'M07',
      description: 'Expedición de remisiones y deducción atómica de existencias.',
      href: '/operations/dispatches',
      color: 'bg-amber-50 text-[#D97706] border-amber-200 hover:border-amber-400',
      icon: Truck,
    },
    {
      title: 'Trazabilidad DAG',
      code: 'M09',
      description: 'Consola genealógica forense desde la troza hasta el cliente.',
      href: '/traceability',
      color: 'bg-purple-50 text-purple-700 border-purple-200 hover:border-purple-400',
      icon: GitFork,
    },
    {
      title: 'Centro de Reportes',
      code: 'M10',
      description: 'Los 6 reportes normativos con exportación CSV e impresión.',
      href: '/reports',
      color: 'bg-slate-50 text-slate-800 border-slate-200 hover:border-slate-400',
      icon: FileSpreadsheet,
    },
  ];

  return (
    <Card className="border-slate-200 shadow-xs">
      <CardHeader className="p-4 sm:p-5 pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-500" />
          <CardTitle className="text-sm font-bold text-slate-900">
            Accesos Rápidos Operativos de Planta
          </CardTitle>
        </div>
        <span className="text-xs text-slate-400 font-mono">Core P0</span>
      </CardHeader>

      <CardContent className="p-4 sm:p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {actions.map((act) => {
            const Icon = act.icon;
            return (
              <Link
                key={act.code}
                href={act.href}
                className={`group p-3.5 rounded-xl border transition-all duration-200 hover:shadow-xs flex flex-col justify-between ${act.color}`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider opacity-70">
                      {act.code}
                    </span>
                    <Icon className="w-4 h-4" />
                  </div>
                  <h4 className="text-xs font-bold text-slate-900 group-hover:text-black">
                    {act.title}
                  </h4>
                  <p className="text-[11px] text-slate-600 mt-1 leading-snug line-clamp-2">
                    {act.description}
                  </p>
                </div>

                <div className="mt-3 pt-2 border-t border-black/5 flex items-center justify-between text-[10px] font-bold">
                  <span>Acceder</span>
                  <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
