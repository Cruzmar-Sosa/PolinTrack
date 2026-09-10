import React from 'react';
import { cn } from '@/lib/utils';
import { Inbox, Loader2 } from 'lucide-react';

export function Table({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <table
        className={cn('w-full caption-bottom text-sm text-left border-collapse', className)}
        {...props}
      />
    </div>
  );
}

export function TableHeader({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn('bg-slate-50/90 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase font-mono', className)}
      {...props}
    />
  );
}

export function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody
      className={cn('divide-y divide-slate-100 bg-white', className)}
      {...props}
    />
  );
}

export function TableFooter({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tfoot
      className={cn('bg-slate-50 border-t border-slate-200 font-medium text-slate-700', className)}
      {...props}
    />
  );
}

export function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn('transition-colors hover:bg-slate-50/80 data-[state=selected]:bg-slate-100', className)}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn('h-10 px-4 text-left align-middle font-mono font-semibold tracking-wider text-slate-600', className)}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn('p-4 align-middle text-slate-800 text-sm', className)}
      {...props}
    />
  );
}

/** TableEmpty: Fila con mensaje centrado cuando no hay registros */
export function TableEmpty({
  colSpan,
  title = 'No se encontraron registros',
  message = 'No hay datos disponibles en este momento con los filtros seleccionados.',
  action,
}: {
  colSpan: number;
  title?: string;
  message?: string;
  action?: React.ReactNode;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-12 text-center">
        <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
            <Inbox className="w-5 h-5" />
          </div>
          <p className="text-sm font-semibold text-slate-800">{title}</p>
          <p className="text-xs text-slate-500">{message}</p>
          {action && <div className="mt-2">{action}</div>}
        </div>
      </td>
    </tr>
  );
}

/** TableLoading: Fila animada con indicador de carga para tablas */
export function TableLoading({
  colSpan,
  message = 'Cargando datos...',
}: {
  colSpan: number;
  message?: string;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-12 text-center">
        <div className="flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-6 h-6 text-[#1D71CB] animate-spin" />
          <p className="text-xs font-medium text-slate-500">{message}</p>
        </div>
      </td>
    </tr>
  );
}
