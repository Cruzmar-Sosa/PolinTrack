'use client';

import React from 'react';
import { Button } from '@/components/ui';
import { Download, Printer } from 'lucide-react';

interface ReportsExportActionsProps {
  filename: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
  disabled?: boolean;
}

export function ReportsExportActions({
  filename,
  headers,
  rows,
  disabled = false,
}: ReportsExportActionsProps) {
  const handleExportCsv = () => {
    if (!rows || rows.length === 0) return;

    // Helper to escape CSV cell
    const escapeCsvCell = (cell: any): string => {
      if (cell === null || cell === undefined) return '""';
      const str = String(cell).replace(/"/g, '""');
      return `"${str}"`;
    };

    const headerLine = headers.map(escapeCsvCell).join(';');
    const bodyLines = rows
      .map((row) => row.map(escapeCsvCell).join(';'))
      .join('\r\n');

    // Prepend UTF-8 BOM for clean Excel rendering of special characters
    const csvContent = '\uFEFF' + headerLine + '\r\n' + bodyLines;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    const cleanFilename = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    link.setAttribute('href', url);
    link.setAttribute('download', cleanFilename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  return (
    <div className="flex items-center gap-2 print:hidden">
      <Button
        variant="outline"
        size="sm"
        onClick={handleExportCsv}
        disabled={disabled || rows.length === 0}
        className="h-8 text-xs gap-1.5 border-slate-300 text-slate-700 hover:text-slate-900 shadow-2xs"
        title="Descargar tabla en formato CSV para Excel"
      >
        <Download className="w-3.5 h-3.5 text-blue-600" />
        <span>Exportar CSV</span>
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={handlePrint}
        disabled={disabled}
        className="h-8 text-xs gap-1.5 border-slate-300 text-slate-700 hover:text-slate-900 shadow-2xs"
        title="Imprimir reporte en vista limpia"
      >
        <Printer className="w-3.5 h-3.5 text-slate-600" />
        <span>Imprimir</span>
      </Button>
    </div>
  );
}
