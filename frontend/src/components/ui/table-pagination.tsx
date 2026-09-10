import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';

export interface TablePaginationProps {
  currentPage: number;
  totalPages?: number;
  totalRecords?: number;
  totalItems?: number; // Alias for totalRecords
  pageSize: number; // 10, 20, 50 o 0 (para 'Todas')
  onPageChange: (newPage: number) => void;
  onPageSizeChange: (newPageSize: number) => void;
  isLoading?: boolean;
  className?: string;
}

export const TablePagination: React.FC<TablePaginationProps> = ({
  currentPage,
  totalPages,
  totalRecords,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  isLoading = false,
  className,
}) => {
  const isAll = pageSize === 0;
  const records = totalRecords ?? totalItems ?? 0;
  const calculatedTotalPages = isAll ? 1 : Math.ceil(records / (pageSize || 10)) || 1;
  const effectiveTotalPages = isAll ? 1 : Math.max(totalPages ?? calculatedTotalPages, 1);
  const effectiveCurrentPage = isAll ? 1 : Math.max(Math.min(currentPage, effectiveTotalPages), 1);

  const canGoPrevious = !isAll && effectiveCurrentPage > 1 && !isLoading;
  const canGoNext = !isAll && effectiveCurrentPage < effectiveTotalPages && !isLoading;

  const handlePageSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = parseInt(e.target.value, 10);
    onPageSizeChange(val);
  };

  return (
    <div
      className={cn(
        'border-t border-slate-200 py-3 px-4 bg-white/50 flex flex-col sm:flex-row items-center justify-between gap-4 select-none',
        className,
      )}
      data-testid="table-pagination"
    >
      {/* Lado Izquierdo — Resumen de Registros */}
      <div className="text-sm text-slate-600 font-medium">
        {isAll ? (
          <span>
            Mostrando todos los registros ({records} registros totales)
          </span>
        ) : (
          <span>
            Mostrando página <span className="font-semibold text-slate-800">{effectiveCurrentPage}</span> de{' '}
            <span className="font-semibold text-slate-800">{effectiveTotalPages}</span>{' '}
            ({records} registros totales)
          </span>
        )}
      </div>

      {/* Centro / Lado Derecho — Selector de Filas y Controles */}
      <div className="flex flex-wrap items-center gap-4 sm:gap-6">
        {/* Selector de Filas por Página ("Combito") */}
        <div className="flex items-center gap-2">
          <label
            htmlFor="table-page-size-select"
            className="text-xs font-semibold text-slate-600 whitespace-nowrap"
          >
            Filas por página:
          </label>
          <select
            id="table-page-size-select"
            aria-label="Filas por página"
            value={pageSize}
            onChange={handlePageSizeChange}
            disabled={isLoading}
            className="h-8 text-xs font-medium rounded-md border border-slate-300 bg-white px-2.5 py-1 text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 transition cursor-pointer"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={0}>Todas</option>
          </select>
        </div>

        {/* Controles de Navegación */}
        <div className="flex items-center gap-1.5" role="navigation" aria-label="Navegación de paginación">
          {/* Primera Página (<<) */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onPageChange(1)}
            disabled={!canGoPrevious}
            className="h-8 w-8 p-0"
            title="Primera página"
            aria-label="Primera página"
          >
            <ChevronsLeft className="w-4 h-4 text-slate-600" />
          </Button>

          {/* Anterior (<) */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onPageChange(effectiveCurrentPage - 1)}
            disabled={!canGoPrevious}
            className="h-8 w-8 p-0"
            title="Página anterior"
            aria-label="Página anterior"
          >
            <ChevronLeft className="w-4 h-4 text-slate-600" />
          </Button>

          {/* Indicador de Página Actual */}
          <div className="px-2.5 py-1 text-xs font-medium font-mono text-slate-700 bg-slate-100 rounded-md border border-slate-200 min-w-[4.5rem] text-center">
            Pág. {effectiveCurrentPage} / {effectiveTotalPages}
          </div>

          {/* Siguiente (>) */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onPageChange(effectiveCurrentPage + 1)}
            disabled={!canGoNext}
            className="h-8 w-8 p-0"
            title="Página siguiente"
            aria-label="Página siguiente"
          >
            <ChevronRight className="w-4 h-4 text-slate-600" />
          </Button>

          {/* Última Página (>>) */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onPageChange(effectiveTotalPages)}
            disabled={!canGoNext}
            className="h-8 w-8 p-0"
            title="Última página"
            aria-label="Última página"
          >
            <ChevronsRight className="w-4 h-4 text-slate-600" />
          </Button>
        </div>
      </div>
    </div>
  );
};
