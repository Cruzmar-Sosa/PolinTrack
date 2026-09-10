'use client';

import React, { useState } from 'react';
import { Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';

interface CatalogStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  itemName: string;
  itemTypeLabel: string;
  currentStatus: boolean; // true = active (wants to inactivate), false = inactive (wants to activate)
}

export function CatalogStatusModal({
  isOpen,
  onClose,
  onConfirm,
  itemName,
  itemTypeLabel,
  currentStatus,
}: CatalogStatusModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleConfirm = async () => {
    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      await onConfirm();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al actualizar el estado del catálogo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const willInactivate = currentStatus;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={willInactivate ? `Inactivar ${itemTypeLabel}` : `Reactivar ${itemTypeLabel}`}
      subtitle="Cambio defensivo de estado operativo (Soft-Delete)"
      layer="nested"
      size="sm"
      headerVariant="default"
      badge={
        <div
          className={`w-7 h-7 rounded-lg flex items-center justify-center ${
            willInactivate
              ? 'bg-amber-50 border border-amber-200 text-amber-600'
              : 'bg-emerald-50 border border-emerald-200 text-emerald-600'
          }`}
        >
          {willInactivate ? (
            <AlertTriangle className="w-4 h-4" />
          ) : (
            <CheckCircle2 className="w-4 h-4" />
          )}
        </div>
      }
      footer={
        <div className="flex items-center justify-end gap-3 w-full">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting}
            className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white rounded-xl shadow-sm transition-colors disabled:opacity-50 ${
              willInactivate
                ? 'bg-amber-600 hover:bg-amber-700'
                : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{willInactivate ? 'Confirmar Inactivación' : 'Confirmar Reactivación'}</span>
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {errorMsg && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
            {errorMsg}
          </div>
        )}

        <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Elemento Seleccionado
          </p>
          <p className="text-sm font-bold text-slate-900 mt-0.5">{itemName}</p>
        </div>

        <div
          className={`p-4 rounded-xl border text-xs leading-relaxed ${
            willInactivate
              ? 'bg-amber-50/80 border-amber-200/80 text-amber-900'
              : 'bg-emerald-50/80 border-emerald-200/80 text-emerald-900'
          }`}
        >
          {willInactivate ? (
            <p>
              <strong>¿Está seguro de inactivar este elemento?</strong> Ya no aparecerá disponible para nuevas operaciones de planta (recepciones, producción o despachos), pero los registros históricos permanecerán intactos para auditoría y trazabilidad.
            </p>
          ) : (
            <p>
              <strong>¿Desea reactivar este elemento?</strong> Volverá a estar inmediatamente disponible en los selectores de operaciones diarias.
            </p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
