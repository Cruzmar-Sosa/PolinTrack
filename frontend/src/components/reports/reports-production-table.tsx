'use client';

import React from 'react';
import { Card, CardContent, Badge, Button, TablePagination } from '@/components/ui';
import { DailyProductionReportItem, PaginationMeta } from './types';
import { formatDate } from '@/lib/date-formatters';
import { ChevronLeft, ChevronRight, Factory } from 'lucide-react';

interface ReportsProductionTableProps {
  data: DailyProductionReportItem[];
  meta?: PaginationMeta;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSize?: number;
  isLoading: boolean;
}

export function ReportsProductionTable({
  data,
  meta,
  onPageChange,
  onPageSizeChange,
  pageSize,
  isLoading,
}: ReportsProductionTableProps) {
  const totalProduced = data.reduce((sum, item) => sum + (Number(item.quantityProduced) || 0), 0);

  return (
    <Card className="border-slate-200 shadow-xs overflow-hidden">
      <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-blue-50 text-[#1D71CB]">
            <Factory className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Reporte 4: Producción Diaria por Semana ISO
            </h3>
            <p className="text-xs text-slate-500">
              Jornadas de fabricación, productos terminados y trazabilidad a lotes de troza
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 font-mono text-xs">
          <span className="text-slate-500">Registros: <strong>{meta?.total ?? data.length}</strong></span>
          <span>•</span>
          <span className="text-[#1D71CB] font-bold">
            Total Producido: {totalProduced.toLocaleString('es-NI')} pcs
          </span>
        </div>
      </div>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4">Fecha</th>
                <th className="py-2.5 px-3">Lote Producción</th>
                <th className="py-2.5 px-3 text-center">Semana ISO</th>
                <th className="py-2.5 px-3">Producto</th>
                <th className="py-2.5 px-3">Dimensiones</th>
                <th className="py-2.5 px-4 text-right">Piezas Producidas</th>
                <th className="py-2.5 px-3">Lotes Madera Origen</th>
                <th className="py-2.5 px-4">Supervisor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data && data.length > 0 ? (
                data.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2.5 px-4 font-mono text-slate-600 whitespace-nowrap">
                      {formatDate(item.productionDate)}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-blue-900 whitespace-nowrap">
                      {item.productionLot}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <Badge variant="default" size="sm">
                        W{item.isoWeek}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-800 truncate max-w-[150px]" title={item.productName}>
                      {item.productName}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-500 text-[11px]">
                      {item.dimensions}
                    </td>
                    <td className="py-2.5 px-4 font-mono font-bold text-right tabular-nums text-slate-900 whitespace-nowrap">
                      {Number(item.quantityProduced).toLocaleString('es-NI')}{' '}
                      <span className="text-[10px] text-slate-400 font-sans font-normal">pcs</span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-emerald-800">
                      {item.woodReceiptLots && item.woodReceiptLots.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {item.woodReceiptLots.map((wLot, i) => (
                            <span key={i} className="px-1.5 py-0.5 bg-emerald-50 rounded border border-emerald-200">
                              {wLot}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 truncate max-w-[130px]" title={item.supervisor}>
                      {item.supervisor}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 italic">
                    No se encontraron órdenes de producción para los filtros seleccionados
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
