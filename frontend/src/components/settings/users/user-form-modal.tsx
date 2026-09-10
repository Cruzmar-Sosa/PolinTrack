'use client';

import React, { useState, useEffect } from 'react';
import { SystemUser, UserFormData, UserRole } from './types';
import {
  UserPlus,
  Edit2,
  X,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  ShieldCheck,
  Calculator,
  Eye as EyeIcon,
} from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';

interface UserFormModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  user?: SystemUser | null;
  onClose: () => void;
  onSubmit: (data: UserFormData) => Promise<void>;
}

export function UserFormModal({
  isOpen,
  mode,
  user,
  onClose,
  onSubmit,
}: UserFormModalProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('CONSULTA');
  const [showPassword, setShowPassword] = useState(false);

  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (user && mode === 'edit') {
      setFullName(user.fullName);
      setEmail(user.email);
      setPassword('');
      setRole(user.role);
    } else {
      setFullName('');
      setEmail('');
      setPassword('');
      setRole('CONSULTA');
    }
    setFormError(null);
    setShowPassword(false);
  }, [user, mode, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (trimmedName.length < 2) {
      setFormError('El nombre completo debe tener al menos 2 caracteres.');
      return;
    }

    if (!trimmedEmail || !/^\S+@\S+\.\S+$/.test(trimmedEmail)) {
      setFormError('Ingrese una dirección de correo electrónico válida.');
      return;
    }

    if (mode === 'create') {
      if (!trimmedPassword) {
        setFormError('La contraseña temporal es obligatoria para la creación.');
        return;
      }
      if (trimmedPassword.length < 8) {
        setFormError('La contraseña temporal debe tener al menos 8 caracteres.');
        return;
      }
    } else {
      if (trimmedPassword && trimmedPassword.length < 8) {
        setFormError('La nueva contraseña debe tener al menos 8 caracteres.');
        return;
      }
    }

    try {
      setIsSubmitting(true);
      await onSubmit({
        fullName: trimmedName,
        email: trimmedEmail,
        password: trimmedPassword || undefined,
        role,
      });
    } catch (err: any) {
      setFormError(err.message || 'Error al procesar el usuario.');
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
      title={mode === 'create' ? 'Registrar Nuevo Usuario' : 'Editar Usuario y Rol'}
      subtitle={
        mode === 'create'
          ? 'Crea la identidad y asigna el rol RBAC (EP-USR-02)'
          : `Actualizando perfil operativo de ${user?.email}`
      }
    >
      <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span className="font-medium">{formError}</span>
            </div>
          )}

          {/* Nombre Completo */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Nombre Completo <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="Ej. Carlos Mendoza"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#1D71CB]/20 focus:border-[#1D71CB] transition-all"
            />
          </div>

          {/* Correo Electrónico Institucional */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Correo Electrónico Institucional <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              required
              disabled={mode === 'edit'}
              placeholder="usuario@polintrack.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`w-full px-3.5 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#1D71CB]/20 focus:border-[#1D71CB] transition-all ${
                mode === 'edit' ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''
              }`}
            />
            {mode === 'edit' && (
              <p className="text-[10px] text-slate-400 mt-1">
                El correo electrónico actúa como clave primaria inmutable de Supabase Auth.
              </p>
            )}
          </div>

          {/* Rol en el Sistema con Descripción Operacional */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Rol en el Sistema (RBAC) <span className="text-red-500">*</span>
            </label>
            <div className="space-y-2">
              {/* Option ADMIN */}
              <label
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  role === 'ADMIN'
                    ? 'border-[#7C3AED] bg-purple-50/50 shadow-sm'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="userRole"
                  value="ADMIN"
                  checked={role === 'ADMIN'}
                  onChange={() => setRole('ADMIN')}
                  className="mt-0.5 text-[#7C3AED] focus:ring-[#7C3AED]"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-[#7C3AED]" />
                    <span className="text-xs font-bold text-[#0D1B36]">ADMIN</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Control total del sistema, ajustes de stock y administración exclusiva de usuarios.
                  </p>
                </div>
              </label>

              {/* Option CONTABILIDAD */}
              <label
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  role === 'CONTABILIDAD'
                    ? 'border-[#1D71CB] bg-blue-50/50 shadow-sm'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="userRole"
                  value="CONTABILIDAD"
                  checked={role === 'CONTABILIDAD'}
                  onChange={() => setRole('CONTABILIDAD')}
                  className="mt-0.5 text-[#1D71CB] focus:ring-[#1D71CB]"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <Calculator className="w-4 h-4 text-[#1D71CB]" />
                    <span className="text-xs font-bold text-[#1D71CB]">CONTABILIDAD</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Operaciones de recepción de madera, producción diaria, despachos, devoluciones y reportes.
                  </p>
                </div>
              </label>

              {/* Option CONSULTA */}
              <label
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  role === 'CONSULTA'
                    ? 'border-slate-400 bg-slate-100 shadow-sm'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="userRole"
                  value="CONSULTA"
                  checked={role === 'CONSULTA'}
                  onChange={() => setRole('CONSULTA')}
                  className="mt-0.5 text-slate-600 focus:ring-slate-500"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <EyeIcon className="w-4 h-4 text-slate-600" />
                    <span className="text-xs font-bold text-slate-700">CONSULTA</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Acceso de solo lectura a inventarios, trazabilidad transversal, histórico y reportes.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Contraseña Temporal / Reset */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              {mode === 'create'
                ? 'Contraseña Inicial (mínimo 8 caracteres) *'
                : 'Nueva Contraseña (Opcional - dejar en blanco para mantener la actual)'}
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required={mode === 'create'}
                placeholder={mode === 'create' ? '••••••••••••' : 'Nueva contraseña segura...'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-3.5 pr-10 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#1D71CB]/20 focus:border-[#1D71CB] transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100 mt-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-[#1D71CB] hover:bg-[#165EA8] text-white text-xs font-semibold rounded-lg shadow transition-all flex items-center gap-2 disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <span>{mode === 'create' ? 'Guardar Usuario' : 'Actualizar Usuario'}</span>
              )}
            </button>
          </div>
        </form>
    </Dialog>
  );
}
