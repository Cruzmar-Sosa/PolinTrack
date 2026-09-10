'use client';

import React, { useState, useEffect } from 'react';
import { WoodSpeciesItem, WoodSpeciesFormData } from './types';
import { Loader2, TreePine, AlertCircle } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';

interface SpeciesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: WoodSpeciesFormData) => Promise<void>;
  speciesToEdit?: WoodSpeciesItem | null;
}

export function SpeciesModal({
  isOpen,
  onClose,
  onSubmit,
  speciesToEdit,
}: SpeciesModalProps) {
  const [formData, setFormData] = useState<WoodSpeciesFormData>({
    name: 'PINO',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (speciesToEdit) {
      setFormData({
        name: speciesToEdit.name,
      });
    } else {
      setFormData({
        name: 'PINO',
      });
    }
    setErrorMessage(null);
  }, [speciesToEdit, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!formData.name.trim()) {
      setErrorMessage('La especie botánica es obligatoria.');
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit(formData);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al guardar la especie de madera.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={() => !isSubmitting && onClose()}
      size="sm"
      headerVariant="default"
      title={speciesToEdit ? 'Editar Especie de Madera' : 'Nueva Especie de Madera'}
      subtitle={
        speciesToEdit ? 'Actualizar clasificación botánica' : 'Registrar especie autorizada'
      }
    >
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        {errorMessage && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Especie Botánica Autorizada <span className="text-red-500">*</span>
          </label>
          <select
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            disabled={isSubmitting}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#1D71CB]/20 focus:border-[#1D71CB] bg-white text-slate-900"
          >
            <option value="PINO">PINO (Pinus caribaea / Pinus oocarpa)</option>
            <option value="TECA">TECA (Tectona grandis)</option>
            <option value="OTRAS">OTRAS (Especies nativas y latifoliadas)</option>
          </select>
          <p className="text-[11px] text-slate-500 mt-1">
            Catálogo botánico normalizado del Core P0 según norma técnica forestal.
          </p>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#1D71CB] hover:bg-blue-700 rounded-xl shadow-sm transition-colors disabled:opacity-50"
          >
            {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{speciesToEdit ? 'Guardar Cambios' : 'Registrar Especie'}</span>
          </button>
        </div>
      </form>
    </Dialog>
  );
}
