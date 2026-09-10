'use client';

import React, { useState, useEffect } from 'react';
import { WoodSupplier, SupplierFormData } from './types';
import { Building2, Plus, Edit2, X, AlertCircle, Loader2 } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';

interface SupplierFormModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  supplier?: WoodSupplier | null;
  onClose: () => void;
  onSubmit: (data: SupplierFormData) => Promise<void>;
}

export function SupplierFormModal({
  isOpen,
  mode,
  supplier,
  onClose,
  onSubmit,
}: SupplierFormModalProps) {
  const [formData, setFormData] = useState<SupplierFormData>({
    name: '',
    legalId: '',
    phone: '',
    address: '',
    notes: '',
    documentUrl: '',
  });

  const [formError, setFormError] = useState<string | null>(null);
  const [rucError, setRucError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (supplier && mode === 'edit') {
      setFormData({
        name: supplier.name,
        legalId: supplier.legalId || '',
        phone: supplier.phone || '',
        address: '',
        notes: supplier.notes || '',
        documentUrl: supplier.documentUrl || '',
      });
    } else {
      setFormData({
        name: '',
        legalId: '',
        phone: '',
        address: '',
        notes: '',
        documentUrl: '',
      });
    }
    setFormError(null);
    setRucError(null);
  }, [supplier, mode, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setRucError(null);

    const trimmedName = formData.name.trim();
    const trimmedLegalId = formData.legalId.trim();

    if (trimmedName.length < 3) {
      setFormError('La razón social o nombre comercial debe tener al menos 3 caracteres.');
      return;
    }

    if (!trimmedLegalId) {
      setRucError('La identificación fiscal (RUC / Cédula) es obligatoria.');
      return;
    }

    if (trimmedLegalId.length < 5) {
      setRucError('La identificación fiscal (RUC / Cédula) debe tener al menos 5 caracteres.');
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit({
        ...formData,
        name: trimmedName,
        legalId: trimmedLegalId,
        phone: formData.phone.trim(),
        address: formData.address?.trim() || '',
        notes: formData.notes.trim(),
        documentUrl: formData.documentUrl.trim(),
      });
    } catch (err: any) {
      const errMsg = err.message || 'Error al procesar el formulario de proveedor.';
      if (
        errMsg.includes('DUPLICATE_RUC') ||
        errMsg.includes('Ya existe un proveedor') ||
        errMsg.includes('RUC') ||
        errMsg.includes('409')
      ) {
        setRucError('Ya existe un proveedor registrado con este RUC/Cédula');
      } else {
        setFormError(errMsg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={() => !isSubmitting && onClose()}
      size="md"
      headerVariant="default"
      title={mode === 'create' ? 'Registrar Nuevo Proveedor de Madera' : 'Editar Proveedor de Madera'}
      subtitle={
        mode === 'create'
          ? 'Ingrese los antecedentes comerciales y fiscales del proveedor para recepción de materia prima.'
          : `Actualizando ficha de ${supplier?.name || 'proveedor'}`
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col">
        {/* Cuerpo del Formulario con respiro perimetral */}
        <div className="px-6 sm:px-8 py-6 space-y-5 max-h-[75vh] overflow-y-auto pr-4 sm:pr-6">
          {formError && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span className="font-medium">{formError}</span>
            </div>
          )}

          {/* Razón Social */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-600">
              Razón Social / Nombre Comercial <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="Ej. Maderas El Bosque S.A."
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3.5 py-2.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#1D71CB]/20 focus:border-[#1D71CB] transition-all min-h-[40px]"
            />
            <p className="text-[10px] text-slate-400 mt-1">Mínimo 3 caracteres oficiales.</p>
          </div>

          {/* Identificación Fiscal (RUC) */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-600">
              RUC / Cédula / Identificación Fiscal <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="Ej. J-0810009999901 / 001-010190-0001A"
              value={formData.legalId}
              onChange={(e) => {
                setFormData({ ...formData, legalId: e.target.value });
                if (rucError) setRucError(null);
              }}
              className={`w-full px-3.5 py-2.5 text-xs font-mono rounded-lg border transition-all min-h-[40px] ${
                rucError
                  ? 'border-red-500 focus:ring-2 focus:ring-red-200'
                  : 'border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#1D71CB]/20 focus:border-[#1D71CB]'
              }`}
            />
            {rucError ? (
              <p className="text-xs text-red-600 font-semibold mt-1.5 flex items-center gap-1.5 animate-in fade-in">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{rucError}</span>
              </p>
            ) : (
              <p className="text-[10px] text-slate-400 mt-1 font-mono">
                Formato monoespaciado obligatorio (mínimo 5 caracteres).
              </p>
            )}
          </div>

          {/* Teléfono de Contacto */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-600">
              Teléfono / Contacto
            </label>
            <input
              type="tel"
              placeholder="Ej. +505 8888-9999"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full px-3.5 py-2.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#1D71CB]/20 focus:border-[#1D71CB] transition-all min-h-[40px]"
            />
          </div>

          {/* Ubicación / Dirección */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-600">
              Ubicación / Dirección
            </label>
            <input
              type="text"
              placeholder="Ej. Km 45 Carretera Norte, Tipitapa"
              value={formData.address || ''}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="w-full px-3.5 py-2.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#1D71CB]/20 focus:border-[#1D71CB] transition-all min-h-[40px]"
            />
          </div>

          {/* Observaciones / Notas */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-600">
              Observaciones / Notas
            </label>
            <textarea
              rows={2}
              placeholder="Centros de acopio, permisos forestales INAFOR, acuerdos comerciales..."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full px-3.5 py-2.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#1D71CB]/20 focus:border-[#1D71CB] resize-none transition-all"
            />
          </div>

          {/* Enlace a Documentación en Storage */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-600">
              Enlace a Documentación / Permisos (URL)
            </label>
            <input
              type="url"
              placeholder="https://..."
              value={formData.documentUrl}
              onChange={(e) => setFormData({ ...formData, documentUrl: e.target.value })}
              className="w-full px-3.5 py-2.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#1D71CB]/20 focus:border-[#1D71CB] transition-all min-h-[40px]"
            />
          </div>
        </div>

        {/* Pie de Acciones con fondo contrastado y botones estándar */}
        <div className="px-6 sm:px-8 py-4 bg-slate-50/80 border-t border-slate-100 flex flex-col-reverse sm:flex-row justify-end items-center gap-3 shrink-0">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors min-h-[40px] cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full sm:w-auto px-5 py-2.5 bg-[#1D71CB] hover:bg-[#165EA8] text-white text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60 min-h-[40px] cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Guardando...</span>
              </>
            ) : (
              <span>{mode === 'create' ? 'Registrar Proveedor' : 'Guardar Cambios'}</span>
            )}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
