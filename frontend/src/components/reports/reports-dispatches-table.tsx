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
    <Card className="border-slate-200 shadow-xs overflow-hidden print:border-0 print:shadow-none print:rounded-none">
      <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
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
        <div className="overflow-x-auto print:overflow-visible w-full">
          <table className="w-full text-xs text-left min-w-[1050px] print:min-w-0 print:w-full print:text-[11px] md:print:text-xs">
            <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4 whitespace-nowrap">Fecha</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Factura / Remisión</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Centro Cliente</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Lote Origen</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Producto</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Dimensiones</th>
                <th className="py-2.5 px-4 text-right whitespace-nowrap">Piezas Despachadas</th>
                <th className="py-2.5 px-4 text-right whitespace-nowrap">Devoluciones</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Vehículo / Placa</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Conductor</th>
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
                    <td className="py-2.5 px-3 font-semibold text-slate-800 truncate max-w-[150px] whitespace-nowrap" title={item.clientCenterName}>
                      {item.clientCenterName}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                      {item.productionLot || '-'}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-800 truncate max-w-[140px] whitespace-nowrap" title={item.productName}>
                      {item.productName}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-500 text-[11px] whitespace-nowrap">
                      {item.dimensions}
                    </td>
                    <td className="py-2.5 px-4 font-mono font-bold text-right tabular-nums text-slate-900 whitespace-nowrap">
                      {Number(item.quantityDispatched).toLocaleString('es-NI')}{' '}
                      <span className="text-[10px] text-slate-400 font-sans font-normal">pcs</span>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-right tabular-nums whitespace-nowrap">
                      {item.quantityReturnedAccumulated > 0 ? (
                        <div>
                          <div>
                            <span className="font-bold text-amber-800">
                              {Number(item.quantityReturnedAccumulated).toLocaleString('es-NI')}
                            </span>{' '}
                            <span className="text-[10px] text-slate-400 font-sans font-normal">pcs</span>
                          </div>
                          {(item.quantityReturnedRework !== undefined || item.quantityReturnedScrap !== undefined) && (
                            <div className="flex flex-col gap-0.5 mt-1 items-end">
                              {(item.quantityReturnedRework ?? 0) > 0 && (
                                <div className="flex items-center gap-1">
                                  <span className="font-mono text-emerald-600 font-bold">+{item.quantityReturnedRework}</span>
                                  <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-100 px-1 py-0.5 rounded uppercase tracking-wider">
                                    Reproceso
                                  </span>
                                </div>
                              )}
                              {(item.quantityReturnedScrap ?? 0) > 0 && (
                                <div className="flex items-center gap-1">
                                  <span className="font-mono text-rose-600 font-bold">{item.quantityReturnedScrap}</span>
                                  <span className="text-[10px] font-semibold text-rose-800 bg-rose-100 px-1 py-0.5 rounded uppercase tracking-wider">
                                    Desecho
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">0 pcs</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-500 text-[11px] truncate max-w-[100px] whitespace-nowrap" title={item.vehicleInfo || '-'}>
                      {item.vehicleInfo || '-'}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 truncate max-w-[120px] whitespace-nowrap" title={item.driverName || '-'}>
                      {item.driverName || '-'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400 italic">
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
