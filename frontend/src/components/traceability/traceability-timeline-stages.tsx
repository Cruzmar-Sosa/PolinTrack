'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent, Badge } from '@/components/ui';
import {
  Trees,
  Factory,
  ShieldCheck,
  Truck,
  RotateCcw,
  Calendar,
  User,
  ArrowRight,
  ExternalLink,
  Info,
  CheckCircle2,
  Building2,
} from 'lucide-react';
import { formatDate } from '@/lib/date-formatters';
import { TraceabilityData, OnDrillDownFn } from './types';
import { TraceabilityPdfButton } from './traceability-pdf-button';

interface TraceabilityTimelineStagesProps {
  data: TraceabilityData;
  onDrillDown: OnDrillDownFn;
}

export function TraceabilityTimelineStages({
  data,
  onDrillDown,
}: TraceabilityTimelineStagesProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" />
          <span>Línea de Tiempo Cronológica Industrial (5 Etapas)</span>
        </h3>
        <span className="text-xs text-slate-500 font-medium hidden sm:inline-block">
          💡 Haga clic en cualquier código o factura para profundizar (Drill-Down)
        </span>
      </div>

      {/* 5-STAGE PIPELINE GRID (DESKTOP) / CONNECTED RAIL (MOBILE) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* ================================================================== */}
        {/* ETAPA 1: ORIGEN DE MATERIA PRIMA (MADERA)                          */}
        {/* ================================================================== */}
        <Card className="border-t-4 border-t-[#3A6A44] shadow-xs flex flex-col hover:border-slate-300 transition-all">
          <CardHeader className="p-3.5 pb-2 border-b border-slate-100 bg-emerald-50/20">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-[#3A6A44] uppercase tracking-wider">
                1. Materia Prima
              </span>
              <div className="p-1 rounded-md bg-emerald-100 text-[#3A6A44]">
                <Trees className="w-3.5 h-3.5" />
              </div>
            </div>
            <CardTitle className="text-xs text-slate-900 mt-1 flex items-center justify-between">
              <span>Lotes de Troza / Patio</span>
              <Badge variant="neutral" size="sm">
                {data.rawMaterialOrigin?.length || 0}
              </Badge>
            </CardTitle>
          </CardHeader>

          <CardContent className="p-3.5 pt-3 flex-1 space-y-2.5">
            {data.rawMaterialOrigin && data.rawMaterialOrigin.length > 0 ? (
              data.rawMaterialOrigin.map((wood, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1.5 transition-all hover:bg-emerald-50/50 hover:border-emerald-300 group"
                >
                  <div className="flex justify-between items-center">
                    <button
                      type="button"
                      onClick={() => onDrillDown('LOT_WOOD', wood.lotNumber)}
                      className="font-mono font-bold text-slate-900 group-hover:text-emerald-800 text-left hover:underline flex items-center gap-1"
                      title="Explorar este Lote de Madera"
                    >
                      <span>{wood.lotNumber}</span>
                      <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                    <Badge variant="neutral" size="sm">
                      {wood.species}
                    </Badge>
                  </div>

                  <p className="text-slate-600 truncate text-[11px]" title={wood.supplierName}>
                    {wood.supplierName}
                  </p>

                  <div className="flex justify-between items-center text-[11px] text-slate-600 font-mono pt-0.5 border-t border-slate-200/60">
                    <span className="text-slate-500">{wood.woodType}</span>
                    <span className="font-bold text-slate-800 tabular-nums">
                      {wood.quantity.toLocaleString()} {wood.unit}
                    </span>
                  </div>

                  {(wood.yugosQuantity != null || wood.reglasQuantity != null) && (
                    <div className="text-[10px] text-slate-500 bg-white/80 px-2 py-0.5 rounded border border-slate-200/60 flex justify-between">
                      <span>Yugos: <strong className="text-slate-700">{wood.yugosQuantity ?? 0}</strong></span>
                      <span>Reglas: <strong className="text-slate-700">{wood.reglasQuantity ?? 0}</strong></span>
                    </div>
                  )}

                  <p className="text-[10px] text-slate-400 font-mono">
                    Ingreso: {formatDate(wood.receiptDate)}
                  </p>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-xs text-slate-400 space-y-1">
                <Info className="w-5 h-5 mx-auto text-slate-300" />
                <p className="italic">Sin lotes de madera vinculados</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ================================================================== */}
        {/* ETAPA 2: PRODUCCIÓN DIARIA (ASERRÍO)                               */}
        {/* ================================================================== */}
        <Card className="border-t-4 border-t-[#1D71CB] shadow-xs flex flex-col hover:border-slate-300 transition-all">
          <CardHeader className="p-3.5 pb-2 border-b border-slate-100 bg-blue-50/20">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-[#1D71CB] uppercase tracking-wider">
                2. Fabricación
              </span>
              <div className="p-1 rounded-md bg-blue-100 text-[#1D71CB]">
                <Factory className="w-3.5 h-3.5" />
              </div>
            </div>
            <CardTitle className="text-xs text-slate-900 mt-1">
              Producción Diaria
            </CardTitle>
          </CardHeader>

          <CardContent className="p-3.5 pt-3 flex-1 space-y-2">
            {data.production ? (
              <div className="p-3 rounded-lg bg-blue-50/50 border border-blue-200/80 text-xs space-y-2">
                <div className="flex justify-between items-center">
                  <button
                    type="button"
                    onClick={() => onDrillDown('LOT_PRODUCTION', data.production!.lot)}
                    className="font-mono font-bold text-blue-900 text-left hover:underline flex items-center gap-1 group"
                    title="Explorar este Lote de Producción"
                  >
                    <span>{data.production.lot}</span>
                    <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                  <Badge variant="default" size="sm">
                    W{data.production.isoWeek}
                  </Badge>
                </div>

                <p className="font-semibold text-slate-800 text-xs leading-snug">
                  {data.production.product}
                </p>

                <p className="text-[11px] font-mono text-slate-500">
                  Dimensiones: {data.production.dimensions}
                </p>

                <div className="pt-1.5 border-t border-blue-200/60 flex justify-between items-center text-xs font-mono">
                  <span className="text-slate-600">Producido:</span>
                  <span className="font-black text-blue-900 text-sm tabular-nums">
                    {data.production.quantityProduced.toLocaleString()} pcs
                  </span>
                </div>

                <div className="text-[10px] text-slate-500 font-mono pt-1 space-y-0.5 border-t border-blue-100">
                  <p>Fecha: {formatDate(data.production.productionDate)}</p>
                  <p className="truncate">Resp: {data.production.supervisor}</p>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-slate-400 space-y-1">
                <Info className="w-5 h-5 mx-auto text-slate-300" />
                <p className="italic">Sin orden de producción vinculada</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ================================================================== */}
        {/* ETAPA 3: TRATAMIENTO FITOSANITARIO OIRSA                           */}
        {/* ================================================================== */}
        <Card className="border-t-4 border-t-[#7C3AED] shadow-xs flex flex-col hover:border-slate-300 transition-all">
          <CardHeader className="p-3.5 pb-2 border-b border-slate-100 bg-purple-50/20">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-[#7C3AED] uppercase tracking-wider">
                3. Fitosanitario
              </span>
              <div className="p-1 rounded-md bg-purple-100 text-[#7C3AED]">
                <ShieldCheck className="w-3.5 h-3.5" />
              </div>
            </div>
            <CardTitle className="text-xs text-slate-900 mt-1 flex items-center justify-between">
              <span>Tratamiento OIRSA</span>
              <Badge variant="purple" size="sm">
                {data.fumigations?.length || 0}
              </Badge>
            </CardTitle>
          </CardHeader>

          <CardContent className="p-3.5 pt-3 flex-1 space-y-2.5">
            {data.fumigations && data.fumigations.length > 0 ? (
              data.fumigations.map((fum, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-lg bg-purple-50/40 border border-purple-200 text-xs space-y-2 transition-all hover:bg-purple-50"
                >
                  <div className="flex justify-between items-center">
                    <span className="font-mono font-bold text-purple-900 block truncate" title={fum.certificateNumber}>
                      {fum.certificateNumber}
                    </span>
                    <Badge variant="success" size="sm">
                      APROBADO
                    </Badge>
                  </div>

                  {fum.treatedProducts && fum.treatedProducts.length > 0 && (
                    <div className="pt-1 border-t border-purple-100">
                      <span className="text-[10px] font-semibold text-purple-900 block mb-1">
                        Productos Certificados:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {fum.treatedProducts.map((pName, pIdx) => (
                          <span
                            key={pIdx}
                            className="bg-white text-purple-800 border border-purple-200 px-1.5 py-0.5 rounded text-[10px] font-mono"
                          >
                            {pName}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="text-[10px] text-slate-500 font-mono">
                    Fecha: {formatDate(fum.fumigationDate)}
                  </p>

                  {/* SECURE PDF DOWNLOAD BUTTON */}
                  <div className="pt-1 border-t border-purple-100">
                    <TraceabilityPdfButton
                      certificateNumber={fum.certificateNumber}
                      downloadEndpoint={fum.certificateDownloadUrl}
                      directUrl={fum.certificateUrl}
                      fumigationId={fum.id}
                    />
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-xs text-slate-400 space-y-1.5">
                <ShieldCheck className="w-6 h-6 mx-auto text-slate-300" />
                <p className="font-medium text-slate-500">Lote sin tratamiento fitosanitario</p>
                <span className="inline-block text-[10px] text-slate-400 font-mono leading-relaxed">
                  (Válido para consumo local o pendiente de aplicación OIRSA)
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ================================================================== */}
        {/* ETAPA 4: SALIDAS / DESPACHOS A PLANTAS CLIENTE                     */}
        {/* ================================================================== */}
        <Card className="border-t-4 border-t-[#D97706] shadow-xs flex flex-col hover:border-slate-300 transition-all">
          <CardHeader className="p-3.5 pb-2 border-b border-slate-100 bg-amber-50/20">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-[#D97706] uppercase tracking-wider">
                4. Despachos
              </span>
              <div className="p-1 rounded-md bg-amber-100 text-[#D97706]">
                <Truck className="w-3.5 h-3.5" />
              </div>
            </div>
            <CardTitle className="text-xs text-slate-900 mt-1 flex items-center justify-between">
              <span>Salidas a Clientes</span>
              <Badge variant="warning" size="sm">
                {data.dispatches?.length || 0}
              </Badge>
            </CardTitle>
          </CardHeader>

          <CardContent className="p-3.5 pt-3 flex-1 space-y-2.5">
            {data.dispatches && data.dispatches.length > 0 ? (
              data.dispatches.map((disp, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-lg bg-amber-50/40 border border-amber-200 text-xs space-y-1.5 transition-all hover:bg-amber-50 group"
                >
                  <div className="flex justify-between items-center">
                    <button
                      type="button"
                      onClick={() => onDrillDown('INVOICE', disp.invoiceNumber)}
                      className="font-mono font-bold text-amber-900 text-left hover:underline flex items-center gap-1"
                      title="Filtrar por esta Factura"
                    >
                      <span>Fac. {disp.invoiceNumber}</span>
                      <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                    <span className="font-mono font-bold text-slate-900 tabular-nums">
                      {disp.quantityDispatched.toLocaleString()} pcs
                    </span>
                  </div>

                  <p className="font-semibold text-slate-800 truncate text-[11px]" title={disp.clientCenter}>
                    {disp.clientCenter}
                  </p>

                  {disp.driverName && (
                    <p className="text-[10px] text-slate-500 truncate">
                      Cond: {disp.driverName}
                    </p>
                  )}

                  <p className="text-[10px] text-slate-400 font-mono">
                    Despacho: {formatDate(disp.dispatchDate)}
                  </p>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-xs text-slate-400 space-y-1">
                <Truck className="w-5 h-5 mx-auto text-slate-300" />
                <p className="italic">Sin despachos registrados</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ================================================================== */}
        {/* ETAPA 5: DEVOLUCIONES COMERCIALES                                  */}
        {/* ================================================================== */}
        <Card className="border-t-4 border-t-[#059669] shadow-xs flex flex-col hover:border-slate-300 transition-all">
          <CardHeader className="p-3.5 pb-2 border-b border-slate-100 bg-emerald-50/20">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-[#059669] uppercase tracking-wider">
                5. Devoluciones
              </span>
              <div className="p-1 rounded-md bg-emerald-100 text-[#059669]">
                <RotateCcw className="w-3.5 h-3.5" />
              </div>
            </div>
            <CardTitle className="text-xs text-slate-900 mt-1 flex items-center justify-between">
              <span>Reincorporación</span>
              <Badge variant="neutral" size="sm">
                {data.returns?.length || 0}
              </Badge>
            </CardTitle>
          </CardHeader>

          <CardContent className="p-3.5 pt-3 flex-1 space-y-2.5">
            {data.returns && data.returns.length > 0 ? (
              data.returns.map((ret, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-lg bg-rose-50/40 border border-rose-200 text-xs space-y-1.5 transition-all hover:bg-rose-50 group"
                >
                  <div className="flex justify-between items-center">
                    <button
                      type="button"
                      onClick={() => onDrillDown('INVOICE', ret.invoiceNumber)}
                      className="font-mono font-bold text-rose-900 text-left hover:underline flex items-center gap-1"
                      title="Ver Factura de Devolución"
                    >
                      <span>Fac. {ret.invoiceNumber}</span>
                      <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                    <span className="font-mono font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 tabular-nums">
                      +{ret.quantityReturned} pcs
                    </span>
                  </div>

                  {ret.clientCenter && (
                    <p className="text-slate-800 text-[11px] font-semibold flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                      <span>{ret.clientCenter}</span>
                    </p>
                  )}

                  <p className="text-slate-700 text-[11px] leading-snug">
                    <strong>Motivo:</strong> {ret.reason}
                  </p>

                  <p className="text-[10px] text-slate-500 font-mono">
                    Retorno: {formatDate(ret.returnDate)}
                  </p>

                  <p className="text-[10px] text-slate-400 truncate">
                    Por: {ret.registeredBy}
                  </p>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-xs text-slate-400 space-y-1.5">
                <CheckCircle2 className="w-6 h-6 mx-auto text-emerald-500" />
                <p className="font-medium text-slate-700">Cero devoluciones</p>
                <span className="inline-block text-[10px] text-emerald-600 font-medium">
                  ✓ 100% recepción conforme en destino
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
