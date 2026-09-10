'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { AccessDenied } from '@/components/ui/access-denied';
import { SystemUser, UserFormData } from '@/components/settings/users/types';
import { UsersTable } from '@/components/settings/users/users-table';
import { UserFormModal } from '@/components/settings/users/user-form-modal';
import {
  Users,
  UserPlus,
  CheckCircle2,
  AlertCircle,
  X,
  Loader2,
  ShieldCheck,
} from 'lucide-react';

export default function UsersManagementPage() {
  const { user: currentUser, session, isLoading: isAuthLoading } = useAuth();

  const [users, setUsers] = useState<SystemUser[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [selectedUser, setSelectedUser] = useState<SystemUser | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

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

  // Load Users List (EP-USR-01)
  const fetchUsers = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      setIsLoadingData(true);
      setErrorMessage(null);

      const res = await fetch(`${apiUrl}/users?limit=0`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (res.status === 403) {
        setErrorMessage('Acceso denegado: este módulo es exclusivo para administradores (RN-004).');
        return;
      }

      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setUsers(data.data);
      } else {
        throw new Error(data?.error?.message || 'Error al cargar la lista de usuarios');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'No se pudo conectar con el servidor para obtener los usuarios.');
    } finally {
      setIsLoadingData(false);
    }
  }, [session?.access_token, apiUrl]);

  useEffect(() => {
    if (session?.access_token && currentUser?.role === 'ADMIN') {
      fetchUsers();
    } else if (currentUser && currentUser.role !== 'ADMIN') {
      setIsLoadingData(false);
    }
  }, [session?.access_token, currentUser, fetchUsers]);

  // Handle Create New User
  const handleOpenCreateModal = () => {
    setSelectedUser(null);
    setModalMode('create');
    setIsModalOpen(true);
  };

  // Handle Edit User
  const handleOpenEditModal = (user: SystemUser) => {
    setSelectedUser(user);
    setModalMode('edit');
    setIsModalOpen(true);
  };

  // Handle Form Submit (EP-USR-02 or EP-USR-04)
  const handleFormSubmit = async (formData: UserFormData) => {
    if (!session?.access_token) return;

    if (modalMode === 'create') {
      const res = await fetch(`${apiUrl}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          fullName: formData.fullName,
          email: formData.email,
          password: formData.password,
          role: formData.role,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.error?.message || data?.message || 'Error al registrar el nuevo usuario');
      }

      showSuccess(`Usuario '${formData.fullName}' creado exitosamente.`);
      setIsModalOpen(false);
      await fetchUsers();
    } else if (modalMode === 'edit' && selectedUser) {
      const updatePayload: Record<string, any> = {
        fullName: formData.fullName,
        role: formData.role,
      };
      if (formData.password?.trim()) {
        updatePayload.password = formData.password.trim();
      }

      const res = await fetch(`${apiUrl}/users/${selectedUser.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(updatePayload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.error?.message || data?.message || 'Error al actualizar el usuario');
      }

      showSuccess(`Usuario '${formData.fullName}' actualizado correctamente.`);
      setIsModalOpen(false);
      await fetchUsers();
    }
  };

  // Handle Status Toggle (EP-USR-05)
  const handleToggleStatus = async (user: SystemUser) => {
    if (!session?.access_token) return;

    // Self-deactivation protection
    if (user.id === currentUser?.id) {
      showError('Un usuario administrador no puede desactivar su propia cuenta.');
      return;
    }

    const newStatus = !user.isActive;
    try {
      const res = await fetch(`${apiUrl}/users/${user.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ isActive: newStatus }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.error?.message || data?.message || 'No se pudo conmutar el estado del usuario');
      }

      showSuccess(
        newStatus
          ? `La cuenta de '${user.fullName}' ha sido reactivada con éxito.`
          : `La cuenta de '${user.fullName}' ha sido desactivada lógicamente.`,
      );
      await fetchUsers();
    } catch (err: any) {
      showError(err.message || 'Error al cambiar el estado del usuario.');
      throw err;
    }
  };

  // RBAC Shield: Non-Admin Forbidden Shield View (RN-004)
  if (!isAuthLoading && currentUser && currentUser.role !== 'ADMIN') {
    return (
      <AccessDenied
        moduleName="Gestión de Usuarios y Roles"
        userRole={currentUser.role}
        ruleCode="RN-004"
        description="El módulo de Gestión de Usuarios y Permisos es de acceso exclusivo para Administradores del Sistema (PolinTrack RBAC)."
      />
    );
  }

  if (isAuthLoading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-[#1D71CB] animate-spin" />
        <p className="text-xs font-medium text-slate-500">Cargando directorio de usuarios...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full pb-16">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-[#1D71CB] flex items-center justify-center border border-blue-100 shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-bold text-navy tracking-tight">
                Gestión de Usuarios y Roles
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 font-bold">
                SCR-USR-01
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-purple-50 text-[#7C3AED] border border-purple-200 uppercase tracking-wider">
                <ShieldCheck className="w-3.5 h-3.5" />
                Exclusivo ADMIN (RN-004)
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Administración de personal operativo, gobernanza de roles RBAC y control de acceso (UC-SEC-02, REQ-FUNC-100).
            </p>
          </div>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1D71CB] hover:bg-[#165EA8] text-white text-xs font-semibold rounded-lg shadow-sm hover:shadow transition-all shrink-0"
        >
          <UserPlus className="w-4 h-4" />
          <span>+ Nuevo Usuario</span>
        </button>
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

      {/* Users Table */}
      <UsersTable
        users={users}
        currentUserId={currentUser?.id}
        isLoading={isLoadingData}
        onRefresh={fetchUsers}
        onEdit={handleOpenEditModal}
        onToggleStatus={handleToggleStatus}
        onCreateNew={handleOpenCreateModal}
      />

      {/* User Form Modal */}
      <UserFormModal
        isOpen={isModalOpen}
        mode={modalMode}
        user={selectedUser}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleFormSubmit}
      />
    </div>
  );
}
