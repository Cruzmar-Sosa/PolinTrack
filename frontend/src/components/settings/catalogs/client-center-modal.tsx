'use client';

import React, { useState, useEffect } from 'react';
import { ClientCenterItem, ClientCenterFormData } from './types';
import { Loader2, Building2, AlertCircle } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';

interface ClientCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: ClientCenterFormData) => Promise<void>;
  clientCenterToEdit?: ClientCenterItem | null;
}

export function ClientCenterModal({
  isOpen,
  onClose,
  onSubmit,
  clientCenterToEdit,
}: ClientCenterModalProps) {
  const [formData, setFormData] = useState<ClientCenterFormData>({
    name: '',
    location: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (clientCenterToEdit) {
      setFormData({
        name: clientCenterToEdit.name,
        location: clientCenterToEdit.location || '',
      });
    } else {
      setFormData({
        name: '',
        location: '',
      });
    }
    setErrorMessage(null);
  }, [clientCenterToEdit, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!formData.name.trim()) {
      setErrorMessage('El nombre de la planta cliente es obligatorio.');
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit({
        name: formData.name.trim(),
        location: formData.location.trim(),
      });
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al guardar la planta cliente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={clientCenterToEdit ? 'Editar Planta Cliente' : 'Nueva Planta Cliente / Destino'}
      subtitle={clientCenterToEdit ? 'Actualizar centro o sector logístico' : 'Registrar centro receptor de despachos'}
      size="sm"
      headerVariant="default"
      badge={
        <div className="w-7 h-7 rounded-lg bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-700">
          <Building2 className="w-4 h-4 text-purple-700" />
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
            type="submit"
            form="client-center-form"
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#1D71CB] hover:bg-blue-700 rounded-xl shadow-sm transition-colors disabled:opacity-50"
          >
            {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{clientCenterToEdit ? 'Guardar Cambios' : 'Registrar Planta'}</span>
          </button>
        </div>
      }
    >
      <form id="client-center-form" onSubmit={handleSubmit} className="space-y-4">
        {errorMessage && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Nombre de la Planta / Centro <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Ej: Planta 7 — Chinandega Norte"
            disabled={isSubmitting}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#1D71CB]/20 focus:border-[#1D71CB] text-slate-900"
          />
          <p className="text-[11px] text-slate-400 mt-1">
            Nombre oficial de la instalación cliente que figurará en las facturas de despacho.
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Ubicación / Sector Geográfico
          </label>
          <input
            type="text"
            value={formData.location}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            placeholder="Ej: Km 134 Carretera Panamericana, Chinandega"
            disabled={isSubmitting}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#1D71CB]/20 focus:border-[#1D71CB] text-slate-900"
          />
          <p className="text-[11px] text-slate-400 mt-1">
            Referencia logística de entrega y cálculo de flete en ruta.
          </p>
        </div>
      </form>
    </Dialog>
  );
}
