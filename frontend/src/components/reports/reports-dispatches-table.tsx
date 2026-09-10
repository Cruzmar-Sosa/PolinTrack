'use client';

import React from 'react';
import { Card, CardContent, Badge, Button, TablePagination } from '@/components/ui';
import { DispatchReportItem, PaginationMeta } from './types';
import { formatDate } from '@/lib/date-formatters';
import { ChevronLeft, ChevronRight, Truck } from 'lucide-react';

interface ReportsDispatchesTableProps {
  data: DispatchReportItem[];
  meta?: PaginationMeta;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSize?: number;
  isLoading: boolean;
}

export function ReportsDispatchesTable({
  data,
  meta,
  onPageChange,
  onPageSizeChange,
  pageSize,
  isLoading,
}: ReportsDispatchesTableProps) {
  const totalDispatched = data.reduce((sum, item) => sum + (Number(item.quantityDispatched) || 0), 0);

  return (
    <Card className="border-slate-200 shadow-xs overflow-hidden">
      <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-amber-50 text-[#D97706]">
            <Truck className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Reporte 2: Salidas y Despachos a Plantas Cliente
            </h3>
            <p className="text-xs text-slate-500">
              Remisiones comerciales con deducción estricta de existencias en patio
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 font-mono text-xs">
          <span className="text-slate-500">Registros: <strong>{meta?.total ?? data.length}</strong></span>
          <span>•</span>
          <span className="text-amber-700 font-bold">
            Total Piezas: {totalDispatched.toLocaleString('es-NI')} pcs
          </span>
        </div>
      </div>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4">Fecha</th>
                <th className="py-2.5 px-3">Factura / Remisión</th>
                <th className="py-2.5 px-3">Centro Cliente</th>
                <th className="py-2.5 px-3">Lote Origen</th>
                <th className="py-2.5 px-3">Producto</th>
                <th className="py-2.5 px-3">Dimensiones</th>
                <th className="py-2.5 px-4 text-right">Piezas Despachadas</th>
                <th className="py-2.5 px-3">Vehículo / Placa</th>
                <th className="py-2.5 px-4">Conductor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data && data.length > 0 ? (
                data.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2.5 px-4 font-mono text-slate-600 whitespace-nowrap">
                      {formatDate(item.dispatchDate)}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-amber-900 whitespace-nowrap">
                      {item.invoiceNumber}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-800 truncate max-w-[150px]" title={item.clientCenterName}>
                      {item.clientCenterName}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                      {item.productionLot || '-'}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-800 truncate max-w-[140px]" title={item.productName}>
                      {item.productName}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-500 text-[11px]">
                      {item.dimensions}
                    </td>
                    <td className="py-2.5 px-4 font-mono font-bold text-right tabular-nums text-slate-900 whitespace-nowrap">
                      {Number(item.quantityDispatched).toLocaleString('es-NI')}{' '}
                      <span className="text-[10px] text-slate-400 font-sans font-normal">pcs</span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-500 text-[11px] truncate max-w-[100px]" title={item.vehicleInfo || '-'}>
                      {item.vehicleInfo || '-'}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 truncate max-w-[120px]" title={item.driverName || '-'}>
                      {item.driverName || '-'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 italic">
                    No se encontraron despachos para los filtros seleccionados
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
