'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home } from 'lucide-react';

const ROUTE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  operations: 'Operaciones',
  'wood-receipts': 'Ingreso de Madera',
  'daily-production': 'Producción Diaria',
  fumigation: 'Fumigación OIRSA',
  dispatches: 'Despachos',
  returns: 'Devoluciones',
  inventory: 'Inventario & Kardex',
  adjustments: 'Ajustes de Stock',
  traceability: 'Trazabilidad',
  reports: 'Reportes de Planta',
  settings: 'Configuración',
  suppliers: 'Proveedores',
  catalogs: 'Catálogos Fijos',
  users: 'Usuarios & Roles',
};

export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 0 || pathname === '/dashboard') {
    return (
      <nav aria-label="Miga de pan" className="flex items-center text-sm font-medium text-slate-600">
        <span className="flex items-center gap-1 text-slate-800 font-semibold">
          <Home className="w-4 h-4 text-primary" />
          <span>Dashboard Principal</span>
        </span>
      </nav>
    );
  }

  let accumulatedPath = '';
  const breadcrumbsList = segments.map((segment, index) => {
    accumulatedPath += `/${segment}`;
    const label = ROUTE_LABELS[segment] || decodeURIComponent(segment);
    const isLast = index === segments.length - 1;

    return {
      path: accumulatedPath,
      label,
      isLast,
    };
  });

  return (
    <nav aria-label="Miga de pan" className="flex items-center space-x-1 text-xs md:text-sm font-medium text-slate-500">
      <Link
        href="/dashboard"
        className="flex items-center gap-1 hover:text-primary transition-colors duration-150"
      >
        <Home className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Inicio</span>
      </Link>

      {breadcrumbsList.map((crumb) => (
        <React.Fragment key={crumb.path}>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          {crumb.isLast ? (
            <span className="font-semibold text-slate-800 truncate max-w-[160px] md:max-w-none">
              {crumb.label}
            </span>
          ) : (
            <Link
              href={crumb.path}
              className="hover:text-primary transition-colors duration-150 truncate max-w-[120px] md:max-w-none"
            >
              {crumb.label}
            </Link>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}
