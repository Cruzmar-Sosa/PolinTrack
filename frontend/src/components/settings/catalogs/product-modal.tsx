'use client';

import React, { useState, useEffect } from 'react';
import { ProductItem, ProductFormData } from './types';
import { Loader2, Package, AlertCircle } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: ProductFormData) => Promise<void>;
  productToEdit?: ProductItem | null;
}

export function ProductModal({
  isOpen,
  onClose,
  onSubmit,
  productToEdit,
}: ProductModalProps) {
  const [formData, setFormData] = useState<ProductFormData>({
    name: '',
    dimensions: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (productToEdit) {
      setFormData({
        name: productToEdit.name,
        dimensions: productToEdit.dimensions,
      });
    } else {
      setFormData({
        name: '',
        dimensions: '',
      });
    }
    setErrorMessage(null);
  }, [productToEdit, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!formData.name.trim()) {
      setErrorMessage('El nombre del polín es obligatorio.');
      return;
    }
    if (!formData.dimensions.trim()) {
      setErrorMessage('Las dimensiones normalizadas son obligatorias.');
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit({
        name: formData.name.trim(),
        dimensions: formData.dimensions.trim(),
      });
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al guardar el producto.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={productToEdit ? 'Editar Polín / Producto' : 'Nuevo Polín de Producción'}
      subtitle={productToEdit ? 'Actualizar dimensiones o nombre comercial' : 'Registrar nuevo formato comercial normalizado'}
      size="sm"
      headerVariant="default"
      badge={
        <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-[#1D71CB]">
          <Package className="w-4 h-4" />
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
            form="product-form"
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#1D71CB] hover:bg-blue-700 rounded-xl shadow-sm transition-colors disabled:opacity-50"
          >
            {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{productToEdit ? 'Guardar Cambios' : 'Registrar Polín'}</span>
          </button>
        </div>
      }
    >
      <form id="product-form" onSubmit={handleSubmit} className="space-y-4">
        {errorMessage && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Nombre Comercial <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Ej: Polín 50x50 Especial"
            disabled={isSubmitting}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#1D71CB]/20 focus:border-[#1D71CB] text-slate-900"
          />
          <p className="text-[11px] text-slate-400 mt-1">
            Nombre descriptivo único utilizado en inventario, producción y despachos.
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Dimensiones (Formato Estándar) <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.dimensions}
            onChange={(e) => setFormData({ ...formData, dimensions: e.target.value })}
            placeholder="Ej: 50x50 o 120x80"
            disabled={isSubmitting}
            className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#1D71CB]/20 focus:border-[#1D71CB] text-slate-900"
          />
          <p className="text-[11px] text-slate-400 mt-1">
            Especificación dimensional normalizada en milímetros o pulgadas (ej. 45x48, 120x80).
          </p>
        </div>
      </form>
    </Dialog>
  );
}
