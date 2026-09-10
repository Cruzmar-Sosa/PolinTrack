'use client';

import React from 'react';
import { Card, CardContent, Badge, Button, TablePagination } from '@/components/ui';
import { WoodReceiptReportItem, PaginationMeta } from './types';
import { formatDate } from '@/lib/date-formatters';
import { ChevronLeft, ChevronRight, Trees } from 'lucide-react';

interface ReportsWoodReceiptsTableProps {
  data: WoodReceiptReportItem[];
  meta?: PaginationMeta;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSize?: number;
  isLoading: boolean;
}

export function ReportsWoodReceiptsTable({
  data,
  meta,
  onPageChange,
  onPageSizeChange,
  pageSize,
  isLoading,
}: ReportsWoodReceiptsTableProps) {
  const totalVolume = data.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

  return (
    <Card className="border-slate-200 shadow-xs overflow-hidden">
      {/* Header with quick stats */}
      <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-emerald-50 text-[#3A6A44]">
            <Trees className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Reporte 1: Ingreso de Materia Prima (Madera)
            </h3>
            <p className="text-xs text-slate-500">
              Recepción en patio con lote determinístico y unidad según tipo (RN-016)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 font-mono text-xs">
          <span className="text-slate-500">Registros: <strong>{meta?.total ?? data.length}</strong></span>
          <span>•</span>
          <span className="text-[#3A6A44] font-bold">
            Volumen visible: {totalVolume.toLocaleString('es-NI', { maximumFractionDigits: 1 })}
          </span>
        </div>
      </div>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4">Fecha</th>
                <th className="py-2.5 px-3">Lote Recepción</th>
                <th className="py-2.5 px-3">Proveedor</th>
                <th className="py-2.5 px-3">Especie</th>
                <th className="py-2.5 px-3">Tipo Madera</th>
                <th className="py-2.5 px-3">Unidad</th>
                <th className="py-2.5 px-4 text-right">Cantidad</th>
                <th className="py-2.5 px-3">Guía / Doc</th>
                <th className="py-2.5 px-4">Receptor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data && data.length > 0 ? (
                data.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2.5 px-4 font-mono text-slate-600 whitespace-nowrap">
                      {formatDate(item.receiptDate)}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                      {item.lotNumber}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-800 truncate max-w-[160px]" title={item.supplierName}>
                      {item.supplierName}
                    </td>
                    <td className="py-2.5 px-3">
                      <Badge variant="neutral" size="sm">
                        {item.speciesName}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-700">
                      {item.woodTypeName}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-500 text-[11px]">
                      {item.unit}
                    </td>
                    <td className="py-2.5 px-4 font-mono font-bold text-right tabular-nums text-slate-900 whitespace-nowrap">
                      <div>
                        {Number(item.quantity).toLocaleString('es-NI', { maximumFractionDigits: 1 })}
                      </div>
                      {(item.yugosQuantity != null || item.reglasQuantity != null) && (
                        <div className="text-[10px] text-slate-500 font-sans font-normal">
                          {item.yugosQuantity ?? 0} Yug · {item.reglasQuantity ?? 0} Reg
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-500 truncate max-w-[100px]" title={item.guideNumber || '-'}>
                      {item.guideNumber || '-'}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 truncate max-w-[120px]" title={item.receivedBy}>
                      {item.receivedBy}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 italic">
                    No se encontraron ingresos de madera para los filtros seleccionados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {meta && meta.total > 0 && (
          <TablePagination
            currentPage={meta.page}
            totalPages={meta.totalPages}
            totalRecords={meta.total}
            pageSize={pageSize ?? meta.limit ?? 10}
            onPageChange={onPageChange}
            onPageSizeChange={(newSize) => {
              onPageSizeChange?.(newSize);
            }}
            isLoading={isLoading}
            className="print:hidden"
          />
        )}
      </CardContent>
    </Card>
  );
}
