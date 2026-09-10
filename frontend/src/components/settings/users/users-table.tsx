'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { SystemUser, UserRoleFilter, UserStatusFilter } from './types';
import { formatDate, formatDateTime } from '@/lib/date-formatters';
import {
  Users,
  Search,
  SlidersHorizontal,
  RefreshCw,
  ShieldCheck,
  Calculator,
  Eye,
  Edit2,
  Power,
  UserCheck,
  UserX,
  AlertCircle,
  Loader2,
  Lock,
} from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { TablePagination } from '@/components/ui';

interface UsersTableProps {
  users: SystemUser[];
  currentUserId?: string;
  isLoading: boolean;
  onRefresh: () => void;
  onEdit: (user: SystemUser) => void;
  onToggleStatus: (user: SystemUser) => Promise<void>;
  onCreateNew?: () => void;
}

export function UsersTable({
  users,
  currentUserId,
  isLoading,
  onRefresh,
  onEdit,
  onToggleStatus,
  onCreateNew,
}: UsersTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRoleFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<UserStatusFilter>('ALL');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Reset page to 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, roleFilter, statusFilter]);

  // Confirmation modal for status change
  const [statusTarget, setStatusTarget] = useState<SystemUser | null>(null);
  const [isToggling, setIsToggling] = useState(false);

  // Filtered and sorted users (createdAt DESC, id DESC)
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
      if (statusFilter === 'ACTIVE' && !u.isActive) return false;
      if (statusFilter === 'INACTIVE' && u.isActive) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchName = u.fullName.toLowerCase().includes(q);
        const matchEmail = u.email.toLowerCase().includes(q);
        return matchName || matchEmail;
      }

      return true;
    }).sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime() || 0;
      const dateB = new Date(b.createdAt).getTime() || 0;
      if (dateB !== dateA) return dateB - dateA;
      return (b.id || '').localeCompare(a.id || '');
    });
  }, [users, roleFilter, statusFilter, searchTerm]);

  // Paginated users
  const paginatedUsers = useMemo(() => {
    if (pageSize === 0) return filteredUsers;
    const startIndex = (currentPage - 1) * pageSize;
    return filteredUsers.slice(startIndex, startIndex + pageSize);
  }, [filteredUsers, currentPage, pageSize]);

  const handleConfirmStatusToggle = async () => {
    if (!statusTarget) return;
    try {
      setIsToggling(true);
      await onToggleStatus(statusTarget);
      setStatusTarget(null);
    } finally {
      setIsToggling(false);
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase bg-purple-50 text-[#7C3AED] border border-purple-200">
            <ShieldCheck className="w-3.5 h-3.5" />
            ADMIN
          </span>
        );
      case 'CONTABILIDAD':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase bg-blue-50 text-[#1D71CB] border border-blue-200">
            <Calculator className="w-3.5 h-3.5" />
            CONTABILIDAD
          </span>
        );
      case 'CONSULTA':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase bg-slate-100 text-slate-700 border border-slate-300">
            <Eye className="w-3.5 h-3.5 text-slate-500" />
            CONSULTA
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters Toolbar */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center gap-3 justify-between">
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por nombre o correo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#1D71CB]/20 focus:border-[#1D71CB] transition-all"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto justify-end">
          {/* Role Filter */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as UserRoleFilter)}
            className="py-1.5 px-3 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#1D71CB] cursor-pointer"
          >
            <option value="ALL">Todos los roles</option>
            <option value="ADMIN">ADMIN</option>
            <option value="CONTABILIDAD">CONTABILIDAD</option>
            <option value="CONSULTA">CONSULTA</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as UserStatusFilter)}
            className="py-1.5 px-3 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#1D71CB] cursor-pointer"
          >
            <option value="ALL">Todos los estados</option>
            <option value="ACTIVE">Solo Activos</option>
            <option value="INACTIVE">Solo Inactivos</option>
          </select>

          {/* Refresh button */}
          <button
            onClick={onRefresh}
            title="Actualizar listado de usuarios"
            className="p-2 text-slate-500 hover:text-navy hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Users Table Container */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-[#1D71CB] animate-spin" />
            <p className="text-xs font-medium text-slate-500">Cargando directorio de usuarios...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center gap-2 text-center px-4">
            <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 mb-1">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-700">No se encontraron usuarios coincidentes</h3>
            <p className="text-xs text-slate-400 max-w-sm">
              {searchTerm || roleFilter !== 'ALL' || statusFilter !== 'ALL'
                ? 'Pruebe ajustando los filtros o el término de búsqueda.'
                : 'Aún no se han registrado usuarios adicionales en el sistema.'}
            </p>
            {onCreateNew && (
              <button
                onClick={onCreateNew}
                className="mt-3 px-4 py-2 bg-[#1D71CB] text-white text-xs font-semibold rounded-lg hover:bg-[#165EA8] transition-colors shadow-sm"
              >
                + Registrar Nuevo Usuario
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Usuario</th>
                  <th className="py-3 px-4">Rol Asignado</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4">Fecha de Creación</th>
                  <th className="py-3 px-4">Última Actualización</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {paginatedUsers.map((u) => {
                  const isSelf = u.id === currentUserId;

                  return (
                    <tr
                      key={u.id}
                      className={`hover:bg-slate-50/70 transition-colors ${
                        !u.isActive ? 'opacity-70 bg-slate-50/30' : ''
                      }`}
                    >
                      {/* Usuario (Nombre + Email) */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <div className="font-semibold text-navy">{u.fullName}</div>
                          {isSelf && (
                            <span className="text-[10px] font-bold px-1.5 py-0.2 bg-amber-50 text-amber-700 border border-amber-200 rounded">
                              Tú
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500 mt-0.5">{u.email}</div>
                      </td>

                      {/* Rol */}
                      <td className="py-3.5 px-4">{getRoleBadge(u.role)}</td>

                      {/* Estado */}
                      <td className="py-3.5 px-4">
                        {u.isActive ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Activo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                            Inactivo
                          </span>
                        )}
                      </td>

                      {/* Fecha de Creación */}
                      <td className="py-3.5 px-4 text-slate-600 font-mono">
                        {formatDate(u.createdAt)}
                      </td>

                      {/* Último Acceso / Actualización */}
                      <td className="py-3.5 px-4 text-slate-500 font-mono text-[11px]">
                        {u.updatedAt ? formatDateTime(u.updatedAt).full : 'Sin registro'}
                      </td>

                      {/* Acciones */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center justify-end gap-1">
                          <button
                            onClick={() => onEdit(u)}
                            className="p-1.5 text-slate-400 hover:text-[#1D71CB] hover:bg-blue-50 rounded-md transition-colors"
                            title="Editar usuario y rol"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => setStatusTarget(u)}
                            disabled={isSelf}
                            className={`p-1.5 rounded-md transition-colors ${
                              isSelf
                                ? 'opacity-30 cursor-not-allowed text-slate-300'
                                : u.isActive
                                ? 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                                : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                            }`}
                            title={
                              isSelf
                                ? 'No puede desactivar su propia cuenta de Administrador'
                                : u.isActive
                                ? 'Desactivar cuenta (borrado lógico)'
                                : 'Reactivar cuenta'
                            }
                          >
                            <Power className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {filteredUsers.length > 0 && (
          <TablePagination
            currentPage={currentPage}
            totalItems={filteredUsers.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setCurrentPage(1);
            }}
            isLoading={isLoading}
          />
        )}
      </div>

      {/* ======================================================================= */}
      {/* CONFIRM STATUS TOGGLE MODAL                                            */}
      {/* Confirmation modal for status change */}
      <Dialog
        isOpen={!!statusTarget}
        onClose={() => !isToggling && setStatusTarget(null)}
        layer="nested"
        size="sm"
        showCloseButton={false}
      >
        {statusTarget && (
          <div className="p-6">
            <div className="flex items-start gap-3.5">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                  statusTarget.isActive
                    ? 'bg-red-50 text-red-600 border-red-200'
                    : 'bg-emerald-50 text-emerald-600 border-emerald-200'
                }`}
              >
                <Power className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-navy">
                  {statusTarget.isActive
                    ? `¿Desactivar la cuenta de ${statusTarget.fullName}?`
                    : `¿Reactivar la cuenta de ${statusTarget.fullName}?`}
                </h3>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  {statusTarget.isActive
                    ? 'El usuario no podrá volver a iniciar sesión, pero todas sus transacciones históricas permanecerán intactas (borrado lógico no destructivo según REQ-FUNC-100).'
                    : 'El usuario recuperará de inmediato el acceso al sistema con su rol y permisos previamente asignados.'}
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={isToggling}
                onClick={() => setStatusTarget(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isToggling}
                onClick={handleConfirmStatusToggle}
                className={`px-4 py-2 text-white text-xs font-semibold rounded-lg shadow transition-all flex items-center gap-2 disabled:opacity-60 ${
                  statusTarget.isActive
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {isToggling && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>
                  {statusTarget.isActive ? 'Confirmar Desactivación' : 'Confirmar Reactivación'}
                </span>
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
