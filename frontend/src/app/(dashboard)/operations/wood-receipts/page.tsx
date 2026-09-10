'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import {
  formatDate,
  formatTime,
  formatDateLong,
  formatDateTime,
} from '@/lib/date-formatters';
import { Dialog, Drawer } from '@/components/ui/dialog';
import { TablePagination } from '@/components/ui';

interface Supplier {
  id: string;
  name: string;
  legalId: string | null;
  isActive: boolean;
}

interface WoodSpecies {
  id: string;
  name: string;
  isActive: boolean;
}

interface WoodType {
  id: string;
  name: string;
  defaultUnit: 'PIE_TABLAR' | 'PIEZAS';
  isActive: boolean;
}

interface WoodReceipt {
  id: string;
  lotNumber: string;
  receiptDate: string;
  receiptTime: string;
  supplierId: string;
  supplier: {
    id: string;
    name: string;
    legalId: string | null;
  };
  speciesId: string;
  species: {
    id: string;
    name: string;
  };
  woodTypeId: string;
  woodType: {
    id: string;
    name: string;
    defaultUnit: string;
  };
  quantity: number | string;
  unit: 'PIE_TABLAR' | 'PIEZAS';
  yugosQuantity?: number | null;
  reglasQuantity?: number | null;
  guideNumber: string | null;
  woodStatus: string | null;
  createdById: string;
  createdBy: {
    id: string;
    fullName: string;
    email: string;
  };
  createdAt: string;
}

interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: 'ADMIN' | 'CONTABILIDAD' | 'CONSULTA';
}

export default function WoodReceiptsPage() {
  const router = useRouter();
  const { session, user: authUser, loading: isAuthLoading } = useAuth();

  // Session & RBAC
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string>('');

  // Catalogs
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [speciesList, setSpeciesList] = useState<WoodSpecies[]>([]);
  const [woodTypes, setWoodTypes] = useState<WoodType[]>([]);

  // Operational Data
  const [receipts, setReceipts] = useState<WoodReceipt[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  // Filters
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [supplierFilter, setSupplierFilter] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Reset page to 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, supplierFilter, startDate, endDate]);

  // Drawer Detail (SCR-REC-03)
  const [selectedReceipt, setSelectedReceipt] = useState<WoodReceipt | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);

  // Modal Create (SCR-REC-02)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [createLoading, setCreateLoading] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string>('');

  // Form State
  const [formSupplierId, setFormSupplierId] = useState<string>('');
  const [formSpeciesId, setFormSpeciesId] = useState<string>('');
  const [formWoodTypeId, setFormWoodTypeId] = useState<string>('');
  const [formQuantity, setFormQuantity] = useState<string>('');
  const [formReceiptDate, setFormReceiptDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [formReceiptTime, setFormReceiptTime] = useState<string>(() => {
    const now = new Date();
    return now.toTimeString().split(' ')[0].substring(0, 5); // HH:mm
  });
  const [formGuideNumber, setFormGuideNumber] = useState<string>('');
  const [formWoodStatus, setFormWoodStatus] = useState<string>('');
  const [formYugosQuantity, setFormYugosQuantity] = useState<string>('');
  const [formReglasQuantity, setFormReglasQuantity] = useState<string>('');

  // Auto-calculated unit label based on selected woodType (RN-016)
  const selectedWoodTypeObj = useMemo(() => {
    return woodTypes.find((wt) => wt.id === formWoodTypeId);
  }, [woodTypes, formWoodTypeId]);

  const isProcesada = useMemo(() => {
    return selectedWoodTypeObj?.name === 'PROCESADA';
  }, [selectedWoodTypeObj]);

  const totalProcesadaPiezas = useMemo(() => {
    const y = parseInt(formYugosQuantity || '0', 10);
    const r = parseInt(formReglasQuantity || '0', 10);
    return (isNaN(y) || y < 0 ? 0 : y) + (isNaN(r) || r < 0 ? 0 : r);
  }, [formYugosQuantity, formReglasQuantity]);

  const unitLabel = useMemo(() => {
    if (!selectedWoodTypeObj) return 'Seleccione un tipo de madera';
    if (selectedWoodTypeObj.name === 'TIMBRE') return 'Pies Tablares (pt)';
    if (selectedWoodTypeObj.name === 'PROCESADA') return 'Piezas (pcs)';
    return selectedWoodTypeObj.defaultUnit === 'PIE_TABLAR' ? 'Pies Tablares (pt)' : 'Piezas (pcs)';
  }, [selectedWoodTypeObj]);

  const previewLotNumber = useMemo(() => {
    if (!formReceiptDate) return 'LT-DDMMYY-XX';
    const parts = formReceiptDate.split('-');
    if (parts.length !== 3) return 'LT-DDMMYY-XX';
    const [y, m, d] = parts;
    return `LT-${d}${m}${y.slice(2)}-XX`;
  }, [formReceiptDate]);

  // Auth & Initial load
  useEffect(() => {
    if (isAuthLoading || !session?.access_token) return;

    if (authUser) {
      setUser(authUser);
    }
    setToken(session.access_token);
    loadAllData(session.access_token);
  }, [isAuthLoading, session, authUser]);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

  const loadAllData = async (authToken: string) => {
    setLoading(true);
    setErrorMsg('');
    try {
      const headers = { Authorization: `Bearer ${authToken}` };

      const [resReceipts, resSuppliers, resSpecies, resTypes] = await Promise.all([
        fetch(`${apiUrl}/wood-receipts?limit=0`, { headers }),
        fetch(`${apiUrl}/suppliers?limit=0&includeInactive=false`, { headers }),
        fetch(`${apiUrl}/catalog/wood-species?includeInactive=false`, { headers }),
        fetch(`${apiUrl}/catalog/wood-types?includeInactive=false`, { headers }),
      ]);

      if (resReceipts.ok) {
        const json = await resReceipts.json();
        setReceipts(json.data || []);
      }
      if (resSuppliers.ok) {
        const json = await resSuppliers.json();
        setSuppliers(json.data || []);
      }
      if (resSpecies.ok) {
        const json = await resSpecies.json();
        setSpeciesList(json.data || []);
      }
      if (resTypes.ok) {
        const json = await resTypes.json();
        setWoodTypes(json.data || []);
      }
    } catch (err) {
      setErrorMsg('Error al conectar con el servidor de datos');
    } finally {
      setLoading(false);
    }
  };

  // Filtered and Chronologically Sorted List (Regla 1: createdAt DESC / receiptDate DESC)
  const filteredReceipts = useMemo(() => {
    return receipts
      .filter((r) => {
        const matchesSearch =
          searchTerm === '' ||
          r.lotNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
          r.supplier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (r.guideNumber && r.guideNumber.toLowerCase().includes(searchTerm.toLowerCase()));

        const matchesSupplier =
          supplierFilter === '' || r.supplierId === supplierFilter;

        const matchesStart =
          startDate === '' || r.receiptDate >= startDate;

        const matchesEnd =
          endDate === '' || r.receiptDate <= endDate;

        return matchesSearch && matchesSupplier && matchesStart && matchesEnd;
      })
      .sort((a, b) => {
        // 1. Business date: receiptDate DESC
        const dateA = new Date(a.receiptDate).getTime();
        const dateB = new Date(b.receiptDate).getTime();
        if (dateB !== dateA) return dateB - dateA;
        // 2. Creation timestamp: createdAt DESC
        const createdA = new Date(a.createdAt).getTime();
        const createdB = new Date(b.createdAt).getTime();
        if (createdB !== createdA) return createdB - createdA;
        // 3. Deterministic id DESC
        return b.id.localeCompare(a.id);
      });
  }, [receipts, searchTerm, supplierFilter, startDate, endDate]);

  const totalPages = useMemo(() => {
    if (pageSize === 0) return 1;
    return Math.ceil(filteredReceipts.length / pageSize) || 1;
  }, [filteredReceipts.length, pageSize]);

  const paginatedReceipts = useMemo(() => {
    if (pageSize === 0) return filteredReceipts;
    const start = (currentPage - 1) * pageSize;
    return filteredReceipts.slice(start, start + pageSize);
  }, [filteredReceipts, currentPage, pageSize]);

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setCreateError('');
    setFormSupplierId(suppliers.filter((s) => s.isActive)[0]?.id || '');
    setFormSpeciesId(speciesList[0]?.id || '');
    setFormWoodTypeId(woodTypes[0]?.id || '');
    setFormQuantity('');
    setFormYugosQuantity('');
    setFormReglasQuantity('');
    setFormReceiptDate(new Date().toISOString().split('T')[0]);
    setFormReceiptTime(new Date().toTimeString().split(' ')[0].substring(0, 5));
    setFormGuideNumber('');
    setFormWoodStatus('');
    setIsCreateModalOpen(true);
  };

  // Submit Create Receipt
  const handleCreateReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');

    if (!formSupplierId) {
      setCreateError('Debe seleccionar un proveedor válido');
      return;
    }
    if (!formSpeciesId) {
      setCreateError('Debe seleccionar la especie de madera');
      return;
    }
    if (!formWoodTypeId) {
      setCreateError('Debe seleccionar el tipo de madera');
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    if (formReceiptDate > todayStr) {
      setCreateError('La fecha de recepción no puede ser posterior al día de hoy (FA-03)');
      return;
    }

    let calculatedQuantity = 0;
    let yugosPayload: number | undefined = undefined;
    let reglasPayload: number | undefined = undefined;

    if (isProcesada) {
      const yugos = parseInt(formYugosQuantity || '0', 10);
      const reglas = parseInt(formReglasQuantity || '0', 10);

      if (isNaN(yugos) || yugos < 0 || isNaN(reglas) || reglas < 0) {
        setCreateError('Las cantidades de Yugos y Reglas deben ser números enteros mayores o iguales a 0');
        return;
      }

      if (yugos + reglas <= 0) {
        setCreateError('Para madera procesada, debe ingresar al menos 1 Yugo o 1 Regla (total de piezas > 0)');
        return;
      }

      calculatedQuantity = yugos + reglas;
      yugosPayload = yugos;
      reglasPayload = reglas;
    } else {
      const numQty = parseFloat(formQuantity);
      if (isNaN(numQty) || numQty <= 0) {
        setCreateError('La cantidad recibida debe ser estrictamente mayor a cero (FA-02)');
        return;
      }
      calculatedQuantity = numQty;
    }

    setCreateLoading(true);

    try {
      const payload: {
        supplierId: string;
        speciesId: string;
        woodTypeId: string;
        quantity: number;
        receiptDate: string;
        receiptTime: string;
        guideNumber?: string;
        woodStatus?: string;
        yugosQuantity?: number;
        reglasQuantity?: number;
      } = {
        supplierId: formSupplierId,
        speciesId: formSpeciesId,
        woodTypeId: formWoodTypeId,
        quantity: calculatedQuantity,
        receiptDate: formReceiptDate,
        receiptTime: formReceiptTime,
        guideNumber: formGuideNumber.trim() || undefined,
        woodStatus: formWoodStatus.trim() || undefined,
      };

      if (isProcesada) {
        payload.yugosQuantity = yugosPayload;
        payload.reglasQuantity = reglasPayload;
      }

      const res = await fetch(`${apiUrl}/wood-receipts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        setCreateError(json.message || 'Error al registrar el ingreso de madera');
        setCreateLoading(false);
        return;
      }

      setSuccessMsg(`Ingreso registrado exitosamente. Lote oficial generado: ${json.data.lotNumber}`);
      setTimeout(() => setSuccessMsg(''), 6000);
      setIsCreateModalOpen(false);
      loadAllData(token);
      setCurrentPage(1);
    } catch (err) {
      setCreateError('Error de red al registrar el ingreso de madera');
    } finally {
      setCreateLoading(false);
    }
  };

  // Open Drawer Detail
  const handleOpenDrawer = (receipt: WoodReceipt) => {
    setSelectedReceipt(receipt);
    setIsDrawerOpen(true);
  };

  const isMutationAllowed = user?.role === 'ADMIN' || user?.role === 'CONTABILIDAD';

  return (
    <div className="space-y-6">
      {/* Title Bar & Main Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                Recepción de Materia Prima
              </h1>
              <span className="text-xs bg-blue-100 text-blue-800 font-semibold px-2 py-0.5 rounded border border-blue-200">
                M03: Ingreso de Madera
              </span>
            </div>
            <p className="text-sm text-slate-600 mt-1">
              Registro físico de madera en patio con generación automática de lote determinístico (LT-DDMMYY-XX) e inmutabilidad estricta.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {isMutationAllowed ? (
              <button
                onClick={handleOpenCreateModal}
                className="inline-flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 text-white font-semibold text-sm px-4 py-2.5 rounded-lg shadow transition focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
                + Registrar Ingreso (SCR-REC-02)
              </button>
            ) : (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2 rounded-lg font-medium">
                Modo Solo Lectura (Rol CONSULTA)
              </div>
            )}
          </div>
        </div>

        {/* Global Feedback Banners */}
        {successMsg && (
          <div className="mt-4 p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              <span>{successMsg}</span>
            </div>
            <button onClick={() => setSuccessMsg('')} className="text-emerald-700 hover:text-emerald-900 font-bold">
              ✕
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="mt-4 p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{errorMsg}</span>
            </div>
            <button onClick={() => setErrorMsg('')} className="text-rose-700 hover:text-rose-900 font-bold">
              ✕
            </button>
          </div>
        )}

        {/* Filters Panel */}
        <div className="mt-6 bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center gap-4">
          <div className="flex-1 w-full relative">
            <svg
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Buscar por lote (LT-...), proveedor o guía..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
            />
          </div>

          <div className="w-full md:w-56">
            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="w-full py-2 px-3 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
            >
              <option value="">Todos los Proveedores</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              title="Fecha inicial"
            />
            <span className="text-xs text-slate-400">a</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              title="Fecha final"
            />
          </div>

          {(searchTerm || supplierFilter || startDate || endDate) && (
            <button
              onClick={() => {
                setSearchTerm('');
                setSupplierFilter('');
                setStartDate('');
                setEndDate('');
              }}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1"
            >
              Limpiar
            </button>
          )}
        </div>

        {/* Data Table */}
        <div className="mt-6 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[11px] font-bold tracking-wider border-b border-slate-200">
                <tr>
                  <th scope="col" className="py-3.5 px-4">Lote (RN-009)</th>
                  <th scope="col" className="py-3.5 px-4">Fecha / Hora</th>
                  <th scope="col" className="py-3.5 px-4">Proveedor</th>
                  <th scope="col" className="py-3.5 px-4">Especie</th>
                  <th scope="col" className="py-3.5 px-4">Tipo de Madera</th>
                  <th scope="col" className="py-3.5 px-4 text-right">Cantidad Recibida</th>
                  <th scope="col" className="py-3.5 px-4">Guía Forestal</th>
                  <th scope="col" className="py-3.5 px-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mb-2"></div>
                      <p className="text-xs">Cargando histórico de recepciones de madera...</p>
                    </td>
                  </tr>
                ) : filteredReceipts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500">
                      <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                      </svg>
                      <p className="text-sm font-semibold">No se encontraron recepciones de madera</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {receipts.length === 0
                          ? 'Aún no se han registrado ingresos físicos en patio.'
                          : 'No hay resultados que coincidan con los filtros aplicados.'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  paginatedReceipts.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => handleOpenDrawer(r)}
                      className="hover:bg-slate-50/80 cursor-pointer transition"
                    >
                      <td className="py-3.5 px-4">
                        <span className="inline-block font-mono font-bold text-xs bg-slate-100 text-slate-900 border border-slate-300 px-2.5 py-1 rounded">
                          {r.lotNumber}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-medium text-slate-900">
                          {formatDate(r.receiptDate)}
                        </div>
                        <div className="text-xs text-slate-400 font-mono">
                          {formatTime(r.receiptTime)}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900">{r.supplier.name}</div>
                        {r.supplier.legalId && (
                          <div className="text-xs text-slate-400">RUC: {r.supplier.legalId}</div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                          {r.species.name}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-block text-xs font-semibold px-2 py-0.5 rounded ${
                            r.woodType.name === 'TIMBRE'
                              ? 'bg-amber-100 text-amber-900 border border-amber-200'
                              : 'bg-blue-100 text-blue-900 border border-blue-200'
                          }`}
                        >
                          {r.woodType.name} ({r.unit === 'PIE_TABLAR' ? 'pt' : 'piezas'})
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="font-bold text-slate-900 text-base">
                          {Number(r.quantity).toLocaleString('es-NI', {
                            minimumFractionDigits: r.unit === 'PIE_TABLAR' ? 2 : 0,
                            maximumFractionDigits: 2,
                          })}
                          <span className="text-xs font-medium text-slate-500 ml-1">
                            {r.unit === 'PIE_TABLAR' ? 'pt' : 'pcs'}
                          </span>
                        </div>
                        {r.woodType?.name === 'PROCESADA' && (r.yugosQuantity != null || r.reglasQuantity != null) && (
                          <div className="text-[11px] text-slate-500 font-medium">
                            {r.yugosQuantity ?? 0} Yugos · {r.reglasQuantity ?? 0} Reglas
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-600">
                        {r.guideNumber || <span className="text-slate-300">-</span>}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDrawer(r);
                          }}
                          className="text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded transition"
                        >
                          Ficha Técnica
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <TablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalRecords={filteredReceipts.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setCurrentPage(1);
            }}
            isLoading={loading}
          />
        </div>


      {/* 3. Drawer Lateral de Detalle (SCR-REC-03) */}
      <Drawer
        isOpen={isDrawerOpen && !!selectedReceipt}
        onClose={() => setIsDrawerOpen(false)}
        subtitle="Ficha Técnica de Recepción (SCR-REC-03)"
        title={selectedReceipt?.lotNumber}
        size="md"
        footer={
          <button
            onClick={() => setIsDrawerOpen(false)}
            className="w-full bg-slate-800 hover:bg-slate-700 text-white font-semibold py-2 rounded-lg text-sm transition"
          >
            Cerrar Ficha
          </button>
        }
      >
        {selectedReceipt && (
          <div className="space-y-6">
            {/* Status and Lot pill */}
            <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-xs text-emerald-800 font-semibold">Lote de Patio Disponible</p>
                <p className="text-[11px] text-emerald-600">
                  Listo para consumo en órdenes de producción diaria (TSK-09)
                </p>
              </div>
              <span className="px-2.5 py-1 bg-emerald-600 text-white rounded text-xs font-bold font-mono">
                {selectedReceipt.lotNumber}
              </span>
            </div>

            {/* General Info */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-1">
                Datos de la Recepción
              </h4>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-400">Fecha de Ingreso:</span>
                  <p className="font-semibold text-slate-800 mt-0.5">
                    {formatDate(selectedReceipt.receiptDate)}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {formatDateLong(selectedReceipt.receiptDate)}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Hora de Llegada:</span>
                  <p className="font-mono font-semibold text-slate-800 mt-0.5">
                    {formatTime(selectedReceipt.receiptTime)}
                  </p>
                </div>
              </div>

              <div className="text-xs">
                <span className="text-slate-400">Proveedor de Madera:</span>
                <p className="font-bold text-slate-900 text-sm mt-0.5">
                  {selectedReceipt.supplier.name}
                </p>
                {selectedReceipt.supplier.legalId && (
                  <p className="text-[11px] text-slate-500">
                    Identificación Fiscal: {selectedReceipt.supplier.legalId}
                  </p>
                )}
              </div>
            </div>

            {/* Species, Type, Quantity */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-1">
                Especificación de Materia Prima
              </h4>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-400">Especie Botánica:</span>
                  <p className="font-bold text-slate-800 mt-0.5">{selectedReceipt.species.name}</p>
                </div>
                <div>
                  <span className="text-slate-400">Tipo Físico:</span>
                  <p className="font-bold text-slate-800 mt-0.5">
                    {selectedReceipt.woodType.name}
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg text-center">
                <span className="text-xs text-slate-500 block">Cantidad Verificada en Patio</span>
                <span className="text-2xl font-black text-slate-900 font-mono">
                  {Number(selectedReceipt.quantity).toLocaleString('es-NI', {
                    minimumFractionDigits: selectedReceipt.unit === 'PIE_TABLAR' ? 2 : 0,
                    maximumFractionDigits: 2,
                  })}
                </span>
                <span className="text-xs font-bold text-blue-700 ml-2 uppercase">
                  {selectedReceipt.unit === 'PIE_TABLAR' ? 'Pies Tablares (pt)' : 'Piezas (pcs)'}
                </span>

                {selectedReceipt.woodType.name === 'PROCESADA' &&
                  (selectedReceipt.yugosQuantity != null || selectedReceipt.reglasQuantity != null) && (
                    <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-200 text-left">
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">
                          Yugos de Soporte
                        </span>
                        <span className="text-base font-black text-slate-800 font-mono">
                          {selectedReceipt.yugosQuantity ?? 0}
                        </span>
                        <span className="text-[10px] text-slate-500 ml-1">piezas</span>
                      </div>
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">
                          Reglas / Tablas
                        </span>
                        <span className="text-base font-black text-slate-800 font-mono">
                          {selectedReceipt.reglasQuantity ?? 0}
                        </span>
                        <span className="text-[10px] text-slate-500 ml-1">piezas</span>
                      </div>
                    </div>
                  )}
              </div>

              {selectedReceipt.guideNumber && (
                <div className="text-xs">
                  <span className="text-slate-400">Guía de Transporte / Remisión:</span>
                  <p className="font-mono font-semibold text-slate-800 mt-0.5">
                    {selectedReceipt.guideNumber}
                  </p>
                </div>
              )}

              {selectedReceipt.woodStatus && (
                <div className="text-xs">
                  <span className="text-slate-400">Condición / Estado de la Madera:</span>
                  <p className="text-slate-700 mt-0.5 italic">{selectedReceipt.woodStatus}</p>
                </div>
              )}
            </div>

            {/* Audit Information */}
            <div className="space-y-2 pt-4 border-t border-slate-100 text-xs">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Trazabilidad y Auditoría
              </h4>
              <p className="text-slate-500">
                Registrado por:{' '}
                <strong className="text-slate-700">{selectedReceipt.createdBy.fullName}</strong> (
                {selectedReceipt.createdBy.email})
              </p>
              <p className="text-[11px] text-slate-400">
                Timestamp: {formatDateTime(selectedReceipt.createdAt).full}
              </p>
              <div className="p-2.5 rounded bg-slate-100 text-[11px] text-slate-600 border border-slate-200 mt-2">
                🔒 Registro inmutable (RN-001). No admite modificaciones ni eliminaciones destructivas en el sistema.
              </div>
            </div>
          </div>
        )}
      </Drawer>

      {/* 4. Modal de Registro de Ingreso (SCR-REC-02) */}
      <Dialog
        isOpen={isCreateModalOpen}
        onClose={() => !createLoading && setIsCreateModalOpen(false)}
        size="lg"
        headerVariant="industrial"
        subtitle="Operación M03 — Patio de Madera"
        title="Registrar Ingreso de Materia Prima (SCR-REC-02)"
      >
        <form onSubmit={handleCreateReceipt} className="p-6 space-y-4">
              {createError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg flex items-center gap-2">
                  <svg className="w-4 h-4 text-rose-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{createError}</span>
                </div>
              )}

              {/* Lote de Ingreso (READONLY) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1 flex items-center justify-between">
                  <span>Lote de Ingreso</span>
                  <span className="text-[10px] font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded border border-blue-200">
                    READONLY — Generado por Servidor
                  </span>
                </label>
                <div className="w-full text-sm bg-slate-100 border border-slate-300 rounded-lg p-2.5 text-slate-800 font-mono font-bold flex items-center justify-between">
                  <span>[ {previewLotNumber} ]</span>
                  <span className="text-xs font-sans font-normal text-slate-500">
                    Consecutivo diario determinístico
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  El servidor genera automáticamente el identificador oficial (<strong>LT-DDMMYY-XX</strong>) con reinicio de consecutivo cada nuevo día.
                </p>
              </div>

              {/* Proveedor */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Proveedor de Madera *
                </label>
                <select
                  value={formSupplierId}
                  onChange={(e) => setFormSupplierId(e.target.value)}
                  className="w-full text-sm bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  required
                >
                  <option value="">-- Seleccione un proveedor activo --</option>
                  {suppliers
                    .filter((s) => s.isActive)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.legalId ? `(RUC: ${s.legalId})` : ''}
                      </option>
                    ))}
                </select>
              </div>

              {/* Especie y Tipo */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Especie de Madera *
                  </label>
                  <select
                    value={formSpeciesId}
                    onChange={(e) => setFormSpeciesId(e.target.value)}
                    className="w-full text-sm bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    required
                  >
                    {speciesList.map((sp) => (
                      <option key={sp.id} value={sp.id}>
                        {sp.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Tipo de Madera *
                  </label>
                  <select
                    value={formWoodTypeId}
                    onChange={(e) => setFormWoodTypeId(e.target.value)}
                    className="w-full text-sm bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    required
                  >
                    {woodTypes.map((wt) => (
                      <option key={wt.id} value={wt.id}>
                        {wt.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Cantidad y Unidad Automática (RN-016 / RN-016-B) */}
              {isProcesada ? (
                <div className="space-y-3 bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-900 uppercase tracking-wide">
                      Desglose de Madera Procesada (RN-016-B)
                    </span>
                    <span className="text-[10px] bg-blue-200 text-blue-800 font-bold px-2 py-0.5 rounded">
                      Unidad: Piezas
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                        Yugos de Soporte (piezas) *
                      </label>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        placeholder="Ej: 120"
                        value={formYugosQuantity}
                        onChange={(e) => setFormYugosQuantity(e.target.value)}
                        className="w-full text-sm bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
                        required={!formReglasQuantity || parseInt(formReglasQuantity, 10) <= 0}
                      />
                      <span className="text-[10px] text-slate-400 mt-0.5 block">Piezas de soporte transversal</span>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                        Reglas / Tablas (piezas) *
                      </label>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        placeholder="Ej: 80"
                        value={formReglasQuantity}
                        onChange={(e) => setFormReglasQuantity(e.target.value)}
                        className="w-full text-sm bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
                        required={!formYugosQuantity || parseInt(formYugosQuantity, 10) <= 0}
                      />
                      <span className="text-[10px] text-slate-400 mt-0.5 block">Piezas de listones / cubiertas</span>
                    </div>
                  </div>

                  <div className="p-3 bg-white border border-blue-200 rounded-lg flex items-center justify-between shadow-xs">
                    <div className="text-xs text-slate-700">
                      <span className="font-semibold text-slate-500">Total Calculado en Patio:</span>{' '}
                      <strong className="font-mono text-base text-blue-900 font-bold ml-1">
                        {totalProcesadaPiezas} piezas
                      </strong>
                      <span className="text-slate-400 ml-1 text-[11px]">
                        ({formYugosQuantity || 0} Yugos + {formReglasQuantity || 0} Reglas)
                      </span>
                    </div>
                    {totalProcesadaPiezas > 0 ? (
                      <span className="text-[11px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        Válido
                      </span>
                    ) : (
                      <span className="text-[11px] text-rose-600 font-semibold bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                        Total debe ser &gt; 0
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Cantidad Recibida *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="Ej: 1250.50"
                      value={formQuantity}
                      onChange={(e) => setFormQuantity(e.target.value)}
                      className="w-full text-sm bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Unidad de Medida (Auto RN-016)
                    </label>
                    <div className="w-full text-sm bg-slate-100 border border-slate-300 rounded-lg p-2.5 text-slate-800 font-semibold flex items-center justify-between">
                      <span>{unitLabel}</span>
                      <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">Fijo</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Fecha y Hora */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Fecha de Recepción *
                  </label>
                  <input
                    type="date"
                    max={new Date().toISOString().split('T')[0]}
                    value={formReceiptDate}
                    onChange={(e) => setFormReceiptDate(e.target.value)}
                    className="w-full text-sm bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Hora de Llegada *
                  </label>
                  <input
                    type="time"
                    value={formReceiptTime}
                    onChange={(e) => setFormReceiptTime(e.target.value)}
                    className="w-full text-sm bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    required
                  />
                </div>
              </div>

              {/* Guía y Estado */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    N° Guía Forestal / Remisión (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: GUIA-2026-0914"
                    maxLength={100}
                    value={formGuideNumber}
                    onChange={(e) => setFormGuideNumber(e.target.value)}
                    className="w-full text-sm bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Estado / Condición (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Madera verde en troza"
                    maxLength={100}
                    value={formWoodStatus}
                    onChange={(e) => setFormWoodStatus(e.target.value)}
                    className="w-full text-sm bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Footer Buttons */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  disabled={createLoading}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 rounded-lg transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createLoading || (isProcesada && totalProcesadaPiezas <= 0)}
                  className="bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-400 text-white font-semibold text-sm px-5 py-2 rounded-lg shadow transition flex items-center gap-2"
                >
                  {createLoading && (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  )}
                  {createLoading ? 'Generando Lote...' : 'Confirmar e Ingresar a Patio'}
                </button>
              </div>
            </form>
      </Dialog>
    </div>
  );
}
