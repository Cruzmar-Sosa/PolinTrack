'use client';

import React from 'react';
import Link from 'next/link';
import { ShieldAlert, ArrowLeft } from 'lucide-react';

interface AccessDeniedProps {
  moduleName?: string;
  userRole?: string | null;
  ruleCode?: string;
  description?: string;
}

export function AccessDenied({
  moduleName = 'este módulo',
  userRole = 'CONSULTA',
  ruleCode = 'RN-004',
  description,
}: AccessDeniedProps) {
  const defaultDescription = `El módulo ${moduleName} requiere privilegios de Administrador (ADMIN). Su rol operativo actual (${userRole || 'SIN ROL'}) no tiene autorización para acceder a esta pantalla. La sesión permanece activa.`;

  return (
    <div className="min-h-[60vh] flex flex-col justify-center items-center px-4 py-12">
      <div className="max-w-md w-full bg-white rounded-2xl p-8 border border-red-200 shadow-lg text-center animate-in fade-in zoom-in-95 duration-200">
        <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100 shadow-sm">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-lg font-bold text-[#0D1B36] tracking-tight">
          Acceso Restringido ({ruleCode})
        </h2>
        <p className="text-xs text-slate-500 mt-2 leading-relaxed">
          {description || defaultDescription}
        </p>

        <div className="mt-6 pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#1D71CB] hover:bg-[#165EA8] text-white text-xs font-semibold rounded-lg shadow-sm transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver al Dashboard</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
