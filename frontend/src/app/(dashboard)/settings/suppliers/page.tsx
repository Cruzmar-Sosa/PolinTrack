'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { WoodSupplier, SupplierFormData } from '@/components/settings/suppliers/types';
import { SuppliersTable } from '@/components/settings/suppliers/suppliers-table';
import { SupplierFormModal } from '@/components/settings/suppliers/supplier-form-modal';
import { Button } from '@/components/ui';
import {
  Building2,
  Plus,
  CheckCircle2,
  AlertCircle,
  X,
  Loader2,
  ShieldAlert,
} from 'lucide-react';

export default function SuppliersManagementPage() {
  const { user: currentUser, role: authRole, session, isLoading: isAuthLoading } = useAuth();

  const [suppliers, setSuppliers] = useState<WoodSupplier[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [selectedSupplier, setSelectedSupplier] = useState<WoodSupplier | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

  // Helper to extract role directly from JWT payload as instant synchronous fallback
  const tokenRole = React.useMemo(() => {
    const token =
      session?.access_token ||
      (typeof window !== 'undefined'
        ? sessionStorage.getItem('polintrack_auth_token') ||
          localStorage.getItem('polintrack_auth_token')
        : null);
    if (!token) return null;
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        return payload.role || null;
      }
    } catch {}
    return null;
  }, [session?.access_token]);

  // Robust role resolution: check authRole, currentUser?.role, and tokenRole
  // ADMIN and CONTABILIDAD have full mutation rights; CONSULTA is read-only
  const effectiveRole = (authRole || currentUser?.role || tokenRole || '').toUpperCase();
  const canMutate = effectiveRole === 'ADMIN' || effectiveRole === 'CONTABILIDAD';
  const isConsulta = effectiveRole === 'CONSULTA';

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => {
      setSuccessMessage(null);
    }, 4000);
  };

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setTimeout(() => {
      setErrorMessage(null);
    }, 5000);
  };

  // Fetch suppliers
  const fetchSuppliers = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      setIsLoadingData(true);
      setErrorMessage(null);

      const res = await fetch(`${apiUrl}/suppliers?limit=0&includeInactive=true`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const msg = typeof errorData.message === 'string'
          ? errorData.message
          : Array.isArray(errorData.message)
          ? errorData.message.join(', ')
          : 'Error al cargar los proveedores de madera';
        throw new Error(msg);
      }

      const resData = await res.json();
      setSuppliers(resData.data || []);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error de conexión con el servidor');
    } finally {
      setIsLoadingData(false);
    }
  }, [session?.access_token, apiUrl]);

  useEffect(() => {
    if (session?.access_token) {
      fetchSuppliers();
    }
  }, [session?.access_token, fetchSuppliers]);

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setSelectedSupplier(null);
    setModalMode('create');
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (supplier: WoodSupplier) => {
    setSelectedSupplier(supplier);
    setModalMode('edit');
    setIsModalOpen(true);
  };

  // Submit Modal (Create or Edit)
  const handleFormSubmit = async (formData: SupplierFormData) => {
    if (!session?.access_token) return;

    const notesPayload = [formData.address?.trim(), formData.notes?.trim()]
      .filter(Boolean)
      .join(' | ') || undefined;

    if (modalMode === 'create') {
      const res = await fetch(`${apiUrl}/suppliers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          name: formData.name,
          legalId: formData.legalId || undefined,
          phone: formData.phone || undefined,
          notes: notesPayload,
          documentUrl: formData.documentUrl || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409) {
          throw new Error('DUPLICATE_RUC: Ya existe un proveedor registrado con este RUC/Cédula');
        }
        const errorMsg =
          typeof data.message === 'string'
            ? data.message
            : Array.isArray(data.message)
            ? data.message.join(', ')
            : 'No se pudo registrar el proveedor';
        throw new Error(errorMsg);
      }

      showSuccess('Proveedor registrado exitosamente.');
      setIsModalOpen(false);
      await fetchSuppliers();
    } else if (modalMode === 'edit' && selectedSupplier) {
      const res = await fetch(`${apiUrl}/suppliers/${selectedSupplier.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          name: formData.name,
          legalId: formData.legalId || null,
          phone: formData.phone || null,
          notes: notesPayload || null,
          documentUrl: formData.documentUrl || null,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409) {
          throw new Error('DUPLICATE_RUC: Ya existe un proveedor registrado con este RUC/Cédula');
        }
        const errorMsg =
          typeof data.message === 'string'
            ? data.message
            : Array.isArray(data.message)
            ? data.message.join(', ')
            : 'No se pudo actualizar el proveedor';
        throw new Error(errorMsg);
      }

      showSuccess(`Proveedor "${formData.name}" actualizado exitosamente.`);
      setIsModalOpen(false);
      await fetchSuppliers();
    }
  };

  // Toggle Supplier Status
  const handleToggleStatus = async (supplier: WoodSupplier) => {
    if (!session?.access_token) return;

    const newStatus = !supplier.isActive;
    try {
      const res = await fetch(`${apiUrl}/suppliers/${supplier.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ isActive: newStatus }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'No se pudo conmutar el estado del proveedor');
      }

      showSuccess(
        `Proveedor "${supplier.name}" ${newStatus ? 'reactivado' : 'desactivado'} correctamente.`,
      );
      await fetchSuppliers();
    } catch (err: any) {
      showError(err.message || 'Ocurrió un error al cambiar el estado');
      throw err;
    }
  };

  if (isAuthLoading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-[#1D71CB] animate-spin" />
        <p className="text-xs font-medium text-slate-500">Cargando sesión y permisos...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[#1D71CB] shrink-0">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Catálogo de Proveedores de Madera
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 font-bold">
                SCR-SUP-01
              </span>
              {!canMutate && isConsulta && (
                <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 font-semibold">
                  <ShieldAlert className="w-3 h-3 text-slate-400" />
                  Modo Solo Lectura (CONSULTA)
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Administración de proveedores autorizados de materia prima para recepción de trozas (UC-CAT-01, REQ-FUNC-010).
            </p>
          </div>
        </div>

        {/* Perfil Consulta Info */}
        {!canMutate && isConsulta && (
          <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-400 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
            <ShieldAlert className="w-4 h-4" />
            <span>Acción restringida para perfil de solo lectura</span>
          </div>
        )}
      </div>

      {/* Global Alerts */}
      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between text-emerald-800 text-xs shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-500 hover:text-emerald-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between text-red-800 text-xs shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span className="font-semibold">{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-red-500 hover:text-red-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Table */}
      <SuppliersTable
        suppliers={suppliers}
        isLoading={isLoadingData}
        canMutate={canMutate}
        onRefresh={fetchSuppliers}
        onEdit={handleOpenEditModal}
        onToggleStatus={handleToggleStatus}
        onCreateNew={handleOpenCreateModal}
      />

      {/* Modal Form */}
      <SupplierFormModal
        isOpen={isModalOpen}
        mode={modalMode}
        supplier={selectedSupplier}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleFormSubmit}
      />
    </div>
  );
}
