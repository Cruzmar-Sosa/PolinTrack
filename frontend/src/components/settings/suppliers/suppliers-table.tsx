'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { WoodSupplier, SupplierStatusFilter } from './types';
import { formatDate, formatDateLong, formatDateTime } from '@/lib/date-formatters';
import {
  Building2,
  Search,
  SlidersHorizontal,
  RefreshCw,
  Phone,
  FileText,
  ExternalLink,
  Edit2,
  Power,
  ChevronRight,
  X,
  Lock,
  AlertCircle,
  Loader2,
  Plus,
} from 'lucide-react';
import { Dialog, Drawer } from '@/components/ui/dialog';
import { TablePagination } from '@/components/ui';

interface SuppliersTableProps {
  suppliers: WoodSupplier[];
  isLoading: boolean;
  canMutate: boolean;
  onRefresh: () => void;
  onEdit: (supplier: WoodSupplier) => void;
  onToggleStatus: (supplier: WoodSupplier) => Promise<void>;
  onCreateNew?: () => void;
}

export function SuppliersTable({
  suppliers,
  isLoading,
  canMutate,
  onRefresh,
  onEdit,
  onToggleStatus,
  onCreateNew,
}: SuppliersTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<SupplierStatusFilter>('ALL');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Reset page to 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  // Drawer state
  const [selectedDrawerSupplier, setSelectedDrawerSupplier] = useState<WoodSupplier | null>(null);
  const [drawerDetails, setDrawerDetails] = useState<WoodSupplier | null>(null);
  const [loadingDrawer, setLoadingDrawer] = useState(false);

  // Status toggle confirmation modal
  const [statusTarget, setStatusTarget] = useState<WoodSupplier | null>(null);
  const [isToggling, setIsToggling] = useState(false);

  // Fetch full details (including supply history) when drawer opens
  useEffect(() => {
    if (!selectedDrawerSupplier) {
      setDrawerDetails(null);
      return;
    }
    setDrawerDetails(selectedDrawerSupplier);

    const token =
      typeof window !== 'undefined'
        ? sessionStorage.getItem('polintrack_auth_token') || localStorage.getItem('polintrack_auth_token')
        : null;
    if (!token) return;

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
    setLoadingDrawer(true);
    fetch(`${apiUrl}/suppliers/${selectedDrawerSupplier.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data) {
          setDrawerDetails(json.data);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingDrawer(false));
  }, [selectedDrawerSupplier]);

  // Filtered and sorted items (createdAt DESC, id DESC)
  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((sup) => {
      if (statusFilter === 'ACTIVE' && !sup.isActive) return false;
      if (statusFilter === 'INACTIVE' && sup.isActive) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchName = sup.name.toLowerCase().includes(q);
        const matchLegalId = sup.legalId ? sup.legalId.toLowerCase().includes(q) : false;
        const matchPhone = sup.phone ? sup.phone.toLowerCase().includes(q) : false;
        const matchNotes = sup.notes ? sup.notes.toLowerCase().includes(q) : false;
        return matchName || matchLegalId || matchPhone || matchNotes;
      }

      return true;
    }).sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime() || 0;
      const dateB = new Date(b.createdAt).getTime() || 0;
      if (dateB !== dateA) return dateB - dateA;
      return (b.id || '').localeCompare(a.id || '');
    });
  }, [suppliers, statusFilter, searchTerm]);

  // Paginated items
  const paginatedSuppliers = useMemo(() => {
    if (pageSize === 0) return filteredSuppliers;
    const startIndex = (currentPage - 1) * pageSize;
    return filteredSuppliers.slice(startIndex, startIndex + pageSize);
  }, [filteredSuppliers, currentPage, pageSize]);

  const handleConfirmStatusToggle = async () => {
    if (!statusTarget) return;
    try {
      setIsToggling(true);
      await onToggleStatus(statusTarget);
      setStatusTarget(null);
      if (selectedDrawerSupplier?.id === statusTarget.id) {
        setSelectedDrawerSupplier({
          ...selectedDrawerSupplier,
          isActive: !selectedDrawerSupplier.isActive,
        });
      }
    } finally {
      setIsToggling(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters and Search Toolbar (TSK-UI-POLISH) */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Fila 1 (Mobile) / Izquierda (Desktop): Búsqueda */}
        <div className="relative w-full md:w-80 lg:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por nombre, RUC, teléfono..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#1D71CB]/20 focus:border-[#1D71CB] transition-all min-h-[40px]"
          />
        </div>

        {/* Controles de Acción (Fila 2 & 3 en Mobile, Derecha en Desktop) */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full md:w-auto justify-end">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-500 shrink-0">
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Estado:
              </span>
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as SupplierStatusFilter)}
              className="flex-1 sm:flex-none px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#1D71CB]/20 focus:border-[#1D71CB] cursor-pointer min-h-[40px]"
            >
              <option value="ALL">Todos los Estados</option>
              <option value="ACTIVE">Solo Activos</option>
              <option value="INACTIVE">Solo Inactivos</option>
            </select>

            <button
              onClick={onRefresh}
              title="Sincronizar proveedores"
              className="p-2.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200 cursor-pointer min-h-[40px] min-w-[40px] flex items-center justify-center shrink-0"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {canMutate && onCreateNew && (
            <button
              onClick={onCreateNew}
              className="w-full sm:w-auto px-4 py-2.5 bg-[#1D71CB] hover:bg-[#165EA8] text-white text-xs font-semibold rounded-lg shadow-sm flex items-center justify-center gap-2 transition-colors cursor-pointer min-h-[40px] sm:min-h-[44px] touch-manipulation"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Nuevo Proveedor</span>
            </button>
          )}
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-[#1D71CB] animate-spin" />
            <p className="text-xs font-medium text-slate-500">Cargando catálogo de proveedores...</p>
          </div>
        ) : filteredSuppliers.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center gap-2 text-center px-4">
            <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 mb-1">
              <Building2 className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-700">No se encontraron proveedores</h3>
            <p className="text-xs text-slate-400 max-w-sm">
              {searchTerm || statusFilter !== 'ALL'
                ? 'No hay registros que coincidan con los filtros de búsqueda aplicados.'
                : 'Aún no se han registrado proveedores de madera en el sistema.'}
            </p>
            {canMutate && onCreateNew && (
              <button
                onClick={onCreateNew}
                className="mt-3 px-4 py-2 bg-[#1D71CB] hover:bg-[#165EA8] text-white text-xs font-semibold rounded-lg hover:shadow transition-all shadow-sm flex items-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>+ Registrar Primer Proveedor</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Razón Social / Proveedor</th>
                  <th className="py-3 px-4">RUC / Cédula</th>
                  <th className="py-3 px-4">Teléfono / Contacto</th>
                  <th className="py-3 px-4">Ubicación / Notas</th>
                  <th className="py-3 px-4">Documentación</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4">Fecha Registro</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {paginatedSuppliers.map((sup) => (
                  <tr
                    key={sup.id}
                    onClick={() => setSelectedDrawerSupplier(sup)}
                    className="hover:bg-slate-50/70 transition-colors cursor-pointer group"
                  >
                    {/* Razón Social */}
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900 group-hover:text-forest transition-colors">
                        {sup.name}
                      </div>
                    </td>

                    {/* RUC */}
                    <td className="py-3.5 px-4 font-mono text-slate-600">
                      {sup.legalId || <span className="text-slate-300 italic">No registrado</span>}
                    </td>

                    {/* Teléfono */}
                    <td className="py-3.5 px-4">
                      {sup.phone ? (
                        <div className="flex items-center gap-1.5 text-slate-700">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          <span>{sup.phone}</span>
                        </div>
                      ) : (
                        <span className="text-slate-300 italic">Sin teléfono</span>
                      )}
                    </td>

                    {/* Dirección / Notas */}
                    <td className="py-3.5 px-4 max-w-xs">
                      {sup.notes ? (
                        <p className="text-slate-600 line-clamp-1 text-xs">{sup.notes}</p>
                      ) : (
                        <span className="text-slate-300 italic text-xs">Sin observaciones</span>
                      )}
                    </td>

                    {/* Documentación */}
                    <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                      {sup.documentUrl ? (
                        <a
                          href={sup.documentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-forest hover:underline font-medium"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Permiso</span>
                          <ExternalLink className="w-3 h-3 text-slate-400" />
                        </a>
                      ) : (
                        <span className="text-slate-300 italic">Sin adjunto</span>
                      )}
                    </td>

                    {/* Estado */}
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase border ${
                          sup.isActive
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-slate-100 text-slate-500 border-slate-200'
                        }`}
                      >
                        {sup.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>

                    {/* Fecha de Registro */}
                    <td className="py-3.5 px-4 text-slate-500 font-mono">
                      {formatDate(sup.createdAt)}
                    </td>

                    {/* Acciones */}
                    <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setSelectedDrawerSupplier(sup)}
                          className="p-1.5 text-slate-400 hover:text-navy hover:bg-slate-100 rounded-md transition-colors"
                          title="Ver ficha completa"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>

                        {canMutate ? (
                          <>
                            <button
                              onClick={() => onEdit(sup)}
                              className="p-1.5 text-slate-400 hover:text-[#1D71CB] hover:bg-blue-50 rounded-md transition-colors"
                              title="Editar proveedor"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>

                            <button
                              onClick={() => setStatusTarget(sup)}
                              className={`p-1.5 rounded-md transition-colors ${
                                sup.isActive
                                  ? 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                                  : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                              }`}
                              title={sup.isActive ? 'Desactivar proveedor' : 'Reactivar proveedor'}
                            >
                              <Power className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <span
                            title="Operación restringida a perfil de lectura (Rol CONSULTA)"
                            className="p-1.5 text-slate-300 cursor-not-allowed"
                          >
                            <Lock className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filteredSuppliers.length > 0 && (
          <TablePagination
            currentPage={currentPage}
            totalItems={filteredSuppliers.length}
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
      {/* DRAWER LATERAL: FICHA TÉCNICA DE PROVEEDOR                              */}
      {/* ======================================================================= */}
      {/* DETALLE DRAWER                                                          */}
      {/* ======================================================================= */}
      <Drawer
        isOpen={!!selectedDrawerSupplier}
        onClose={() => setSelectedDrawerSupplier(null)}
        subtitle="Ficha de Proveedor"
        title={selectedDrawerSupplier?.name}
        size="md"
        footer={
          canMutate && selectedDrawerSupplier ? (
            <div className="flex items-center justify-between gap-3 w-full">
              <button
                onClick={() => {
                  const sup = selectedDrawerSupplier;
                  setSelectedDrawerSupplier(null);
                  setStatusTarget(sup);
                }}
                className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-white transition-colors flex items-center gap-1.5"
              >
                <Power className="w-3.5 h-3.5" />
                <span>{selectedDrawerSupplier.isActive ? 'Desactivar' : 'Reactivar'}</span>
              </button>

              <button
                onClick={() => {
                  const sup = selectedDrawerSupplier;
                  setSelectedDrawerSupplier(null);
                  onEdit(sup);
                }}
                className="px-4 py-2 bg-forest hover:bg-forest/90 text-white rounded-lg text-xs font-semibold shadow transition-colors flex items-center gap-1.5"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Editar Información</span>
              </button>
            </div>
          ) : undefined
        }
      >
        {selectedDrawerSupplier && (
          <div className="p-6 flex flex-col gap-6">
            <div>
              <div className="flex items-center justify-between">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase border ${
                    selectedDrawerSupplier.isActive
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-slate-100 text-slate-500 border-slate-200'
                  }`}
                >
                  {selectedDrawerSupplier.isActive ? 'Activo' : 'Inactivo'}
                </span>
                <span className="text-[11px] text-slate-400 font-mono">
                  ID: {selectedDrawerSupplier.id.substring(0, 8)}...
                </span>
              </div>
            </div>

            {/* Antecedentes */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 flex flex-col gap-3">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Identificación Fiscal (RUC / Cédula)
                </span>
                <p className="text-sm font-mono text-slate-800 font-semibold mt-0.5">
                  {selectedDrawerSupplier.legalId || 'No registrada'}
                </p>
              </div>

              <div className="border-t border-slate-200/70 pt-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Teléfono de Contacto
                </span>
                {selectedDrawerSupplier.phone ? (
                  <p className="text-sm font-medium text-slate-800 mt-0.5 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-forest" />
                    <a href={`tel:${selectedDrawerSupplier.phone}`} className="hover:underline text-forest">
                      {selectedDrawerSupplier.phone}
                    </a>
                  </p>
                ) : (
                  <p className="text-xs text-slate-400 italic mt-0.5">No registrado</p>
                )}
              </div>
            </div>

            {/* Observaciones */}
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Notas u Observaciones Operativas
              </span>
              <div className="mt-1.5 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                {selectedDrawerSupplier.notes || 'Sin observaciones registradas.'}
              </div>
            </div>

            {/* Permiso Forestal */}
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Permiso Forestal / Documentación
              </span>
              <div className="mt-1.5">
                {selectedDrawerSupplier.documentUrl ? (
                  <a
                    href={selectedDrawerSupplier.documentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition-colors"
                  >
                    <FileText className="w-4 h-4 text-emerald-700" />
                    <span>Ver Documentación en Storage</span>
                    <ExternalLink className="w-3.5 h-3.5 text-emerald-600" />
                  </a>
                ) : (
                  <p className="text-xs text-slate-400 italic">No se ha adjuntado documentación.</p>
                )}
              </div>
            </div>

            {/* Historial de Lotes Suministrados */}
            <div className="border-t border-slate-200/70 pt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Historial de Lotes Suministrados
                </span>
                <span className="text-[11px] font-mono font-semibold text-slate-600">
                  {drawerDetails?._count?.woodReceipts ?? drawerDetails?.woodReceipts?.length ?? 0} lotes registrados
                </span>
              </div>

              {loadingDrawer ? (
                <div className="py-4 flex justify-center">
                  <Loader2 className="w-5 h-5 text-forest animate-spin" />
                </div>
              ) : !drawerDetails?.woodReceipts || drawerDetails.woodReceipts.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-2">
                  No hay lotes de madera registrados para este proveedor.
                </p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {drawerDetails.woodReceipts.map((rcpt) => (
                    <div
                      key={rcpt.id}
                      className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-mono font-bold text-slate-800">{rcpt.lotNumber}</div>
                        <div className="text-[10px] text-slate-500">
                          {formatDate(rcpt.receiptDate)} • {rcpt.species?.name || 'TECA'} ({rcpt.woodType?.name || 'TIMBRE'})
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-slate-800">
                          {Number(rcpt.quantity).toLocaleString()} {rcpt.unit}
                        </div>
                        {rcpt.guideNumber && (
                          <div className="text-[10px] text-slate-400 font-mono">
                            Guía: {rcpt.guideNumber}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Fechas de Auditoría */}
            <div className="text-[11px] text-slate-400 flex flex-col gap-1 border-t border-slate-100 pt-4 mt-auto">
              <p>Fecha de registro: {formatDateLong(selectedDrawerSupplier.createdAt)}</p>
              <p>Última actualización: {formatDateTime(selectedDrawerSupplier.updatedAt).full}</p>
            </div>
          </div>
        )}
      </Drawer>

      {/* ======================================================================= */}
      {/* MODAL: CONFIRMACIÓN DE CONMUTACIÓN DE ESTADO                             */}
      {/* ======================================================================= */}
      <Dialog
        isOpen={!!statusTarget}
        onClose={() => !isToggling && setStatusTarget(null)}
        layer="nested"
        size="sm"
        showCloseButton={false}
      >
        {statusTarget && (
          <div className="px-6 sm:px-8 py-6 sm:py-7 space-y-6">
            <div className="flex items-start gap-4">
              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${
                  statusTarget.isActive
                    ? 'bg-amber-50 text-amber-600 border-amber-200'
                    : 'bg-emerald-50 text-emerald-600 border-emerald-200'
                }`}
              >
                <Power className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-slate-900 tracking-tight">
                  {statusTarget.isActive
                    ? `¿Está seguro de inactivar al proveedor ${statusTarget.name}?`
                    : `¿Está seguro de reactivar al proveedor ${statusTarget.name}?`}
                </h3>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  {statusTarget.isActive
                    ? 'Este proveedor ya no podrá ser seleccionado en nuevos ingresos de madera, pero su historial de recepciones se mantendrá intacto.'
                    : 'El proveedor volverá a estar disponible inmediatamente en el formulario de ingreso de materia prima.'}
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex flex-col-reverse sm:flex-row items-center justify-end gap-3">
              <button
                type="button"
                disabled={isToggling}
                onClick={() => setStatusTarget(null)}
                className="w-full sm:w-auto px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors min-h-[40px] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isToggling}
                onClick={handleConfirmStatusToggle}
                className={`w-full sm:w-auto px-5 py-2.5 text-white text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60 min-h-[40px] cursor-pointer ${
                  statusTarget.isActive
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {isToggling && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>
                  {statusTarget.isActive ? 'Proceder a Inactivar' : 'Proceder a Reactivar'}
                </span>
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
