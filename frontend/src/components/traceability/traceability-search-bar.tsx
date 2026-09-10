'use client';

import React from 'react';
import { Card, CardContent, Button, Select, Input } from '@/components/ui';
import { GitFork, Search, RefreshCw, X, Sparkles } from 'lucide-react';
import { TraceabilityQueryType } from './types';

interface TraceabilitySearchBarProps {
  queryType: TraceabilityQueryType;
  queryValue: string;
  isLoading: boolean;
  onQueryTypeChange: (type: TraceabilityQueryType) => void;
  onQueryValueChange: (value: string) => void;
  onSearch: (type: TraceabilityQueryType, value: string) => void;
}

export function TraceabilitySearchBar({
  queryType,
  queryValue,
  isLoading,
  onQueryTypeChange,
  onQueryValueChange,
  onSearch,
}: TraceabilitySearchBarProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (queryValue.trim()) {
      onSearch(queryType, queryValue.trim());
    }
  };

  const handleClear = () => {
    onQueryValueChange('');
  };

  return (
    <Card className="shadow-xs border-slate-200">
      <CardContent className="p-4 sm:p-5">
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            {/* Criterio selector */}
            <div className="w-full sm:w-72 shrink-0">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <span>Criterio de Consulta</span>
              </label>
              <Select
                value={queryType}
                onChange={(e) => onQueryTypeChange(e.target.value as TraceabilityQueryType)}
                disabled={isLoading}
                className="h-10 text-sm font-medium"
              >
                <option value="LOT_PRODUCTION">Lote de Producción (LT-DDMMYY-WXX)</option>
                <option value="LOT_WOOD">Lote de Madera (LT-DDMMYY-XX)</option>
                <option value="INVOICE">Número de Factura de Despacho</option>
              </Select>
            </div>

            {/* Input field */}
            <div className="flex-1 w-full">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Código o Identificador a Rastrear <span className="text-blue-600">*</span>
              </label>
              <div className="relative">
                <Input
                  type="text"
                  placeholder={
                    queryType === 'LOT_PRODUCTION'
                      ? 'Ej: LT-070926-W37'
                      : queryType === 'LOT_WOOD'
                      ? 'Ej: LT-070926-01'
                      : 'Ej: 00004 o F-1002'
                  }
                  value={queryValue}
                  onChange={(e) => onQueryValueChange(e.target.value)}
                  disabled={isLoading}
                  autoFocus
                  className="pl-9 pr-8 font-mono text-sm h-10 border-slate-300 focus:border-blue-500 focus:ring-blue-500"
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                {queryValue && !isLoading && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
                    title="Limpiar búsqueda"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Submit button */}
            <Button
              type="submit"
              disabled={isLoading || !queryValue.trim()}
              className="w-full sm:w-auto bg-[#1D71CB] hover:bg-[#165ba3] text-white min-w-[140px] h-10 shadow-xs flex items-center justify-center gap-2 font-semibold text-sm"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Rastreando...</span>
                </>
              ) : (
                <>
                  <GitFork className="w-4 h-4" />
                  <span>Rastrear Cadena</span>
                </>
              )}
            </Button>
          </div>

          {/* Quick sample chips */}
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
            <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-500" />
              <span>Accesos rápidos de muestra:</span>
            </span>
            <button
              type="button"
              onClick={() => onSearch('LOT_PRODUCTION', 'LT-070926-W37')}
              className="text-xs font-mono px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors active:scale-95"
            >
              Producción: <strong>LT-070926-W37</strong>
            </button>
            <button
              type="button"
              onClick={() => onSearch('INVOICE', '00004')}
              className="text-xs font-mono px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors active:scale-95"
            >
              Factura: <strong>00004</strong>
            </button>
            <button
              type="button"
              onClick={() => onSearch('LOT_WOOD', 'LT-070926-01')}
              className="text-xs font-mono px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors active:scale-95"
            >
              Madera: <strong>LT-070926-01</strong>
            </button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
