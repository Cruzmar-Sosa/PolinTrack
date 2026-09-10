'use client';

import React, { useState } from 'react';
import { Card, CardContent, Badge, Button, TablePagination } from '@/components/ui';
import { FumigationReportItem, PaginationMeta } from './types';
import { formatDate, formatTime } from '@/lib/date-formatters';
import { ChevronLeft, ChevronRight, ShieldCheck, FileText, ExternalLink, RefreshCw } from 'lucide-react';

interface ReportsFumigationsTableProps {
  data: FumigationReportItem[];
  meta?: PaginationMeta;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSize?: number;
  isLoading: boolean;
  token?: string;
  apiUrl: string;
}

export function ReportsFumigationsTable({
  data,
  meta,
  onPageChange,
  onPageSizeChange,
  pageSize,
  isLoading,
  token,
  apiUrl,
}: ReportsFumigationsTableProps) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const handleOpenCertificate = async (item: FumigationReportItem) => {
    setDownloadingId(item.id);
    setDownloadError(null);

    try {
      // Determine endpoint
      let url: string;
      if (item.certificateDownloadUrl) {
        url = item.certificateDownloadUrl.startsWith('http')
          ? item.certificateDownloadUrl
          : `${apiUrl.replace(/\/api\/v1$/, '')}${
              item.certificateDownloadUrl.startsWith('/') ? '' : '/'
            }${item.certificateDownloadUrl}`;
      } else {
        url = `${apiUrl}/fumigations/${item.id}/certificate-url`;
      }

      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const json = await res.json();
      const signedUrl =
        json?.data?.signedUrl ||
        json?.data?.downloadUrl ||
        json?.data?.certificateUrl ||
        json?.signedUrl ||
        json?.downloadUrl ||
        json?.certificateUrl;

      if (signedUrl && typeof signedUrl === 'string') {
        const finalUrl = signedUrl.startsWith('http')
          ? signedUrl
          : `${apiUrl.replace(/\/api\/v1$/, '')}${signedUrl.startsWith('/') ? '' : '/'}${signedUrl}`;
        window.open(finalUrl, '_blank', 'noopener,noreferrer');
      } else {
        throw new Error('No se recibió la URL firmada del certificado');
      }
    } catch (err: any) {
      setDownloadError(
        `No se pudo recuperar el certificado OIRSA para ${item.certificateNumber}. Contacte al administrador.`
      );
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <Card className="border-slate-200 shadow-xs overflow-hidden">
      <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-purple-50 text-[#7C3AED]">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Reporte 5: Fumigaciones y Certificados Fitosanitarios OIRSA
            </h3>
            <p className="text-xs text-slate-500">
              Tratamientos oficiales en cámara con enlace seguro a PDF (Signed URL 15 min)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 font-mono text-xs">
          <span className="text-slate-500">Registros: <strong>{meta?.total ?? data.length}</strong></span>
          <span>•</span>
          <Badge variant="default" size="sm" className="bg-purple-100 text-purple-800 border-purple-200">
            Exportación OIRSA
          </Badge>
        </div>
      </div>

      {downloadError && (
        <div className="p-3 bg-rose-50 border-b border-rose-200 text-rose-800 text-xs flex items-center justify-between">
          <span>{downloadError}</span>
          <button
            type="button"
            onClick={() => setDownloadError(null)}
            className="text-rose-600 hover:text-rose-900 font-bold ml-2"
          >
            ×
          </button>
        </div>
      )}

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4">Fecha</th>
                <th className="py-2.5 px-3">Hora</th>
                <th className="py-2.5 px-3">Certificado OIRSA</th>
                <th className="py-2.5 px-3">Lote(s) Tratado(s)</th>
                <th className="py-2.5 px-3">Productos Tratados</th>
                <th className="py-2.5 px-3">Archivo PDF</th>
                <th className="py-2.5 px-4">Registrado Por</th>
                <th className="py-2.5 px-4 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data && data.length > 0 ? (
                data.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2.5 px-4 font-mono text-slate-600 whitespace-nowrap">
                      {formatDate(item.fumigationDate)}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-500 text-[11px] whitespace-nowrap">
                      {formatTime(item.fumigationTime)}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-purple-900 whitespace-nowrap">
                      {item.certificateNumber}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-700">
                      {item.productionLots && item.productionLots.length > 1 ? (
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="font-bold text-[#1D71CB]">{item.productionLots[0]}</span>
                          <span
                            className="bg-blue-50 text-blue-800 border border-blue-200 px-1.5 py-0.5 rounded text-[10px] font-bold"
                            title={item.productionLots.join(', ')}
                          >
                            +{item.productionLots.length - 1} más
                          </span>
                        </div>
                      ) : (
                        <span className="font-bold text-[#1D71CB]">{item.productionLot}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">
                      {item.treatedProducts && item.treatedProducts.length > 0 ? (
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {item.treatedProducts.map((pName, pIdx) => (
                            <span
                              key={pIdx}
                              className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded text-[10px] border border-slate-200 truncate"
                            >
                              {pName}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Todos</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-500 truncate max-w-[140px]" title={item.pdfFileName}>
                      {item.pdfFileName}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 truncate max-w-[120px]" title={item.registeredBy}>
                      {item.registeredBy}
                    </td>
                    <td className="py-2.5 px-4 text-center whitespace-nowrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenCertificate(item)}
                        disabled={downloadingId === item.id}
                        className="h-7 px-2.5 text-xs text-purple-700 hover:text-purple-900 border-purple-200 hover:bg-purple-50"
                      >
                        {downloadingId === item.id ? (
                          <>
                            <RefreshCw className="w-3 h-3 animate-spin mr-1" />
                            <span>Abriendo...</span>
                          </>
                        ) : (
                          <>
                            <FileText className="w-3 h-3 mr-1" />
                            <span>Ver PDF</span>
                            <ExternalLink className="w-2.5 h-2.5 ml-1 opacity-70" />
                          </>
                        )}
                      </Button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 italic">
                    No se encontraron tratamientos fitosanitarios para los filtros seleccionados
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
