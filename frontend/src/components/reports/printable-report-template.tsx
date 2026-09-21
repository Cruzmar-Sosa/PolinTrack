import React from 'react';
import { formatDateTime } from '@/lib/date-formatters';

export interface ColumnDef {
  header: string;
  accessorKey?: string;
  render?: (row: any) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
}

export interface PrintableReportTemplateProps {
  reportTitle: string;
  data: any[];
  columns: ColumnDef[];
  userFullName: string;
  summaryMetrics?: React.ReactNode;
}

export const PrintableReportTemplate: React.FC<PrintableReportTemplateProps> = ({
  reportTitle,
  data,
  columns,
  userFullName,
  summaryMetrics,
}) => {
  return (
    <div className="w-full bg-white text-black p-0 m-0 font-sans">
      {/* ENCABEZADO FORMAL */}
      <div className="border-b-2 border-black pb-3 mb-4 flex justify-between items-end">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-widest text-black">PolinTrack ERP</h1>
          <h2 className="text-sm font-semibold mt-1 text-slate-800">{reportTitle}</h2>
        </div>
        <div className="text-right text-[10px] text-slate-700">
          <p>Generado el: {formatDateTime(new Date()).full}</p>
          <p>Responsable: {userFullName}</p>
        </div>
      </div>

      {/* MÉTRICAS DE RESUMEN (Opcional) */}
      {summaryMetrics && (
        <div className="mb-4 p-2 bg-slate-50 border border-slate-200 text-xs font-semibold">
          {summaryMetrics}
        </div>
      )}

      {/* TABLA PLANA Y COMPACTA (Sin overflow, sin limitantes de ancho) */}
      <table className="w-full border-collapse text-[10px]">
        <thead>
          <tr className="bg-slate-100 border-b border-slate-400">
            {columns.map((col, idx) => (
              <th
                key={idx}
                className={`py-1.5 px-2 font-bold uppercase text-slate-800 ${
                  col.align === 'right'
                    ? 'text-right'
                    : col.align === 'center'
                    ? 'text-center'
                    : 'text-left'
                }`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="py-4 text-center text-slate-500 italic"
              >
                No hay registros disponibles para los filtros seleccionados.
              </td>
            </tr>
          ) : (
            data.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-slate-200 break-inside-avoid">
                {columns.map((col, colIndex) => {
                  const cellValue = col.render
                    ? col.render(row)
                    : col.accessorKey
                    ? row[col.accessorKey]
                    : '—';
                  return (
                    <td
                      key={colIndex}
                      className={`py-1.5 px-2 align-top break-words ${
                        col.align === 'right'
                          ? 'text-right'
                          : col.align === 'center'
                          ? 'text-center'
                          : 'text-left'
                      }`}
                    >
                      {cellValue ?? '—'}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* PIE DE PÁGINA (Si el reporte tiene múltiples hojas, esto aparecerá al final de los datos) */}
      <div className="mt-6 text-center text-[9px] text-slate-500 border-t border-slate-200 pt-2">
        Documento oficial generado por el Sistema de Gestión PolinTrack.
      </div>
    </div>
  );
};
