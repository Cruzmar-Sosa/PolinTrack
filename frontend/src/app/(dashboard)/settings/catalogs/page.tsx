'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import {
  WoodSpeciesItem,
  WoodTypeItem,
  ProductItem,
  ClientCenterItem,
  WoodSpeciesFormData,
  ProductFormData,
  ClientCenterFormData,
} from '@/components/settings/catalogs/types';
import { FixedCatalogsView } from '@/components/settings/catalogs/fixed-catalogs-view';
import {
  Layers,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  X,
} from 'lucide-react';

export default function CatalogsPage() {
  const { session, user: authUser, isLoading: isAuthLoading } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Data states
  const [woodSpecies, setWoodSpecies] = useState<WoodSpeciesItem[]>([]);
  const [woodTypes, setWoodTypes] = useState<WoodTypeItem[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [clientCenters, setClientCenters] = useState<ClientCenterItem[]>([]);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

  // Auto-dismiss success message
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Fetch all catalogs in parallel
  const fetchAllCatalogs = useCallback(async () => {
    if (!session?.access_token) return;

    try {
      setIsLoading(true);
      setErrorMessage(null);

      const headers = {
        Authorization: `Bearer ${session.access_token}`,
      };

      const [resSpecies, resTypes, resProd, resCC] = await Promise.all([
        fetch(`${apiUrl}/catalog/wood-species?includeInactive=true`, { headers }),
        fetch(`${apiUrl}/catalog/wood-types?includeInactive=true`, { headers }),
        fetch(`${apiUrl}/catalog/products?includeInactive=true`, { headers }),
        fetch(`${apiUrl}/catalog/client-centers?includeInactive=true`, { headers }),
      ]);

      const [dataSpecies, dataTypes, dataProd, dataCC] = await Promise.all([
        resSpecies.json(),
        resTypes.json(),
        resProd.json(),
        resCC.json(),
      ]);

      if (dataSpecies.success) setWoodSpecies(dataSpecies.data || []);
      if (dataTypes.success) setWoodTypes(dataTypes.data || []);
      if (dataProd.success) setProducts(dataProd.data || []);
      if (dataCC.success) setClientCenters(dataCC.data || []);
    } catch (err: any) {
      setErrorMessage('Error al sincronizar los catálogos maestros con el servidor.');
    } finally {
      setIsLoading(false);
    }
  }, [session?.access_token, apiUrl]);

  useEffect(() => {
    if (session?.access_token) {
      fetchAllCatalogs();
    }
  }, [session?.access_token, fetchAllCatalogs]);

  // Handlers for Species
  const handleCreateSpecies = async (data: WoodSpeciesFormData) => {
    if (!session?.access_token) return;
    const res = await fetch(`${apiUrl}/catalog/wood-species`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Error al registrar la especie');
    setSuccessMessage('Especie de madera registrada exitosamente.');
    fetchAllCatalogs();
  };

  const handleUpdateSpecies = async (id: string, data: WoodSpeciesFormData) => {
    if (!session?.access_token) return;
    const res = await fetch(`${apiUrl}/catalog/wood-species/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Error al actualizar la especie');
    setSuccessMessage('Especie de madera actualizada.');
    fetchAllCatalogs();
  };

  const handleToggleSpeciesStatus = async (id: string, currentStatus: boolean) => {
    if (!session?.access_token) return;
    const res = await fetch(`${apiUrl}/catalog/wood-species/${id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ isActive: !currentStatus }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Error al cambiar estado de la especie');
    setSuccessMessage(`Especie de madera ${!currentStatus ? 'reactivada' : 'inactivada'} exitosamente.`);
    fetchAllCatalogs();
  };

  // Handlers for Products
  const handleCreateProduct = async (data: ProductFormData) => {
    if (!session?.access_token) return;
    const res = await fetch(`${apiUrl}/catalog/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Error al registrar el polín');
    setSuccessMessage('Polín de producción registrado exitosamente.');
    fetchAllCatalogs();
  };

  const handleUpdateProduct = async (id: string, data: ProductFormData) => {
    if (!session?.access_token) return;
    const res = await fetch(`${apiUrl}/catalog/products/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Error al actualizar el polín');
    setSuccessMessage('Polín de producción actualizado.');
    fetchAllCatalogs();
  };

  const handleToggleProductStatus = async (id: string, currentStatus: boolean) => {
    if (!session?.access_token) return;
    const res = await fetch(`${apiUrl}/catalog/products/${id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ isActive: !currentStatus }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Error al cambiar estado del polín');
    setSuccessMessage(`Polín ${!currentStatus ? 'reactivado' : 'inactivado'} exitosamente.`);
    fetchAllCatalogs();
  };

  // Handlers for Client Centers
  const handleCreateClientCenter = async (data: ClientCenterFormData) => {
    if (!session?.access_token) return;
    const res = await fetch(`${apiUrl}/catalog/client-centers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Error al registrar la planta cliente');
    setSuccessMessage('Planta cliente registrada exitosamente.');
    fetchAllCatalogs();
  };

  const handleUpdateClientCenter = async (id: string, data: ClientCenterFormData) => {
    if (!session?.access_token) return;
    const res = await fetch(`${apiUrl}/catalog/client-centers/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Error al actualizar la planta cliente');
    setSuccessMessage('Planta cliente actualizada.');
    fetchAllCatalogs();
  };

  const handleToggleClientCenterStatus = async (id: string, currentStatus: boolean) => {
    if (!session?.access_token) return;
    const res = await fetch(`${apiUrl}/catalog/client-centers/${id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ isActive: !currentStatus }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Error al cambiar estado de la planta cliente');
    setSuccessMessage(`Planta cliente ${!currentStatus ? 'reactivada' : 'inactivada'} exitosamente.`);
    fetchAllCatalogs();
  };

  if (isAuthLoading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-[#1D71CB] animate-spin" />
        <p className="text-xs font-medium text-slate-500">Cargando sesión...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto w-full pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-forest/10 border border-forest/20 flex items-center justify-center text-forest shrink-0">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-navy tracking-tight">
                Gestión de Catálogos Maestros
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 font-bold">
                SCR-CAT-01
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-50 text-[#1D71CB] border border-blue-200 font-bold">
                M02
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Catálogos canónicos de especies de madera, tipos normalizados, polines de producción y plantas cliente autorizadas.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={fetchAllCatalogs}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-navy transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Sincronizar</span>
          </button>
        </div>
      </div>

      {/* Success alert */}
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

      {/* Error alert */}
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

      {/* Catalogs View with Dynamic CRUD and Soft-Delete */}
      <FixedCatalogsView
        woodSpecies={woodSpecies}
        woodTypes={woodTypes}
        products={products}
        clientCenters={clientCenters}
        isLoading={isLoading}
        userRole={authUser?.role}
        onCreateSpecies={handleCreateSpecies}
        onUpdateSpecies={handleUpdateSpecies}
        onToggleSpeciesStatus={handleToggleSpeciesStatus}
        onCreateProduct={handleCreateProduct}
        onUpdateProduct={handleUpdateProduct}
        onToggleProductStatus={handleToggleProductStatus}
        onCreateClientCenter={handleCreateClientCenter}
        onUpdateClientCenter={handleUpdateClientCenter}
        onToggleClientCenterStatus={handleToggleClientCenterStatus}
      />
    </div>
  );
}
