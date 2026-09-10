'use client';

import React, { useState, useMemo } from 'react';
import {
  WoodSpeciesItem,
  WoodTypeItem,
  ProductItem,
  ClientCenterItem,
  CatalogTab,
  WoodSpeciesFormData,
  ProductFormData,
  ClientCenterFormData,
  CatalogStatusModalState,
} from './types';
import { formatDate } from '@/lib/date-formatters';
import { SpeciesModal } from './species-modal';
import { ProductModal } from './product-modal';
import { ClientCenterModal } from './client-center-modal';
import { CatalogStatusModal } from './catalog-status-modal';
import {
  TreePine,
  Layers,
  Package,
  Building2,
  Search,
  Lock,
  Info,
  ShieldCheck,
  CheckCircle2,
  MapPin,
  Clock,
  Ruler,
  Scale,
  Sparkles,
  Plus,
  Edit2,
  Power,
  PowerOff,
  Eye,
  EyeOff,
} from 'lucide-react';

interface FixedCatalogsViewProps {
  woodSpecies: WoodSpeciesItem[];
  woodTypes: WoodTypeItem[];
  products: ProductItem[];
  clientCenters: ClientCenterItem[];
  isLoading: boolean;
  userRole?: string;
  onCreateSpecies: (data: WoodSpeciesFormData) => Promise<void>;
  onUpdateSpecies: (id: string, data: WoodSpeciesFormData) => Promise<void>;
  onToggleSpeciesStatus: (id: string, currentStatus: boolean) => Promise<void>;
  onCreateProduct: (data: ProductFormData) => Promise<void>;
  onUpdateProduct: (id: string, data: ProductFormData) => Promise<void>;
  onToggleProductStatus: (id: string, currentStatus: boolean) => Promise<void>;
  onCreateClientCenter: (data: ClientCenterFormData) => Promise<void>;
  onUpdateClientCenter: (id: string, data: ClientCenterFormData) => Promise<void>;
  onToggleClientCenterStatus: (id: string, currentStatus: boolean) => Promise<void>;
}

export function FixedCatalogsView({
  woodSpecies,
  woodTypes,
  products,
  clientCenters,
  isLoading,
  userRole,
  onCreateSpecies,
  onUpdateSpecies,
  onToggleSpeciesStatus,
  onCreateProduct,
  onUpdateProduct,
  onToggleProductStatus,
  onCreateClientCenter,
  onUpdateClientCenter,
  onToggleClientCenterStatus,
}: FixedCatalogsViewProps) {
  const [activeTab, setActiveTab] = useState<CatalogTab>('wood-species');
  const [searchTerm, setSearchTerm] = useState('');

  // Toggles for inactive rows
  const [showInactiveSpecies, setShowInactiveSpecies] = useState(false);
  const [showInactiveProducts, setShowInactiveProducts] = useState(false);
  const [showInactiveCenters, setShowInactiveCenters] = useState(false);

  // Modals state
  const [isSpeciesModalOpen, setIsSpeciesModalOpen] = useState(false);
  const [speciesToEdit, setSpeciesToEdit] = useState<WoodSpeciesItem | null>(null);

  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [productToEdit, setProductToEdit] = useState<ProductItem | null>(null);

  const [isCenterModalOpen, setIsCenterModalOpen] = useState(false);
  const [centerToEdit, setCenterToEdit] = useState<ClientCenterItem | null>(null);

  const [statusModal, setStatusModal] = useState<CatalogStatusModalState>({
    isOpen: false,
    itemType: 'species',
    id: '',
    name: '',
    currentStatus: true,
  });

  const canManage = userRole === 'ADMIN' || userRole === 'CONTABILIDAD';

  // Botanical descriptions dictionary
  const speciesDetailsMap: Record<string, { code: string; botanical: string; description: string }> = {
    PINO: {
      code: 'ESP-PIN',
      botanical: 'Pinus caribaea / Pinus oocarpa',
      description: 'Conífera de densidad media (450–550 kg/m³), alta resistencia estructural y excelente absorción de preservantes químicos OIRSA.',
    },
    TECA: {
      code: 'ESP-TEC',
      botanical: 'Tectona grandis',
      description: 'Madera tropical dura de grano fino (650–750 kg/m³), con resinas naturales de alta resistencia a intemperie, plagas y humedad salina.',
    },
    OTRAS: {
      code: 'ESP-OTR',
      botanical: 'Especies nativas y latifoliadas autorizadas',
      description: 'Maderas autorizadas bajo plan de manejo forestal sostenible, sujetas a clasificación técnica por lote de ingreso.',
    },
  };

  // Operational wood types dictionary (RN-016)
  const woodTypeDetailsMap: Record<string, { code: string; unit: string; rule: string; context: string }> = {
    TIMBRE: {
      code: 'TP-TMB',
      unit: 'PIE_TABLAR (FBM)',
      rule: 'Medición volumétrica en Pie Tablar (RN-016). Aplica exclusivamente para trozas en bruto y madera aserrada sin procesar.',
      context: 'Unidad mandatoria en recepción de materia prima (M03) calculada por fórmula de volumen comercial.',
    },
    PROCESADA: {
      code: 'TP-PRC',
      unit: 'PIEZA (Pcs)',
      rule: 'Conteo unitario por pieza (RN-016). Aplica a piezas habilitadas, cepilladas y componentes listos para armado.',
      context: 'Unidad mandatoria para ensamble de polines en producción diaria (M04) e inventario de producto terminado.',
    },
  };

  // Canonical product dimensions dictionary
  const productDetailsMap: Record<string, { code: string; dimensionsMm: string; weightEst: string; application: string }> = {
    '120x80': {
      code: 'POL-12080',
      dimensionsMm: '1200 mm x 800 mm',
      weightEst: '22 - 25 kg',
      application: 'Pallet/Polín estándar Europallet exportación. Apto para estanterías pesadas y contenedor marítimo.',
    },
    '45x48': {
      code: 'POL-4548',
      dimensionsMm: '1140 mm x 1220 mm (45" x 48")',
      weightEst: '18 - 20 kg',
      application: 'Formato cuadrado compacto industrial. Utilizado comúnmente en plantas químicas y agroindustriales.',
    },
    '48x64': {
      code: 'POL-4864',
      dimensionsMm: '1220 mm x 1625 mm (48" x 64")',
      weightEst: '28 - 32 kg',
      application: 'Polín de gran formato para carga pesada y productos industriales voluminosos.',
    },
    '45x47': {
      code: 'POL-4547',
      dimensionsMm: '1143 mm x 1194 mm (45" x 47")',
      weightEst: '17 - 19 kg',
      application: 'Polín estructural de transporte intermedio para bobinas y cajas paletizadas.',
    },
    '48x54': {
      code: 'POL-4854',
      dimensionsMm: '1220 mm x 1372 mm (48" x 54")',
      weightEst: '21 - 24 kg',
      application: 'Polín de carga media para centros de distribución y estiba rápida de almacenes.',
    },
  };

  // Client centers dictionary
  const clientCentersMap: Record<string, { code: string; location: string; freightTime: string; zone: string }> = {
    'Planta 1': { code: 'PL-01', location: 'Km 12.5 Carretera Norte, Managua', freightTime: '~1.5 horas', zone: 'Sector Industrial Norte' },
    'Planta 2': { code: 'PL-02', location: 'Km 18 Carretera a Masaya, Nindirí', freightTime: '~2.0 horas', zone: 'Sector Industrial Este' },
    'Planta 3': { code: 'PL-03', location: 'Zona Franca Las Mercedes, Módulo C-4', freightTime: '~2.5 horas', zone: 'Zona Franca Exportación' },
    'Planta 4': { code: 'PL-04', location: 'Complejo Logístico Sabana Grande', freightTime: '~1.8 horas', zone: 'Corredor Logístico Metropolitano' },
    'Planta 5': { code: 'PL-05', location: 'Parque Industrial Chilamatillo', freightTime: '~3.0 horas', zone: 'Sector Agroindustrial Occidente' },
    'Planta 6': { code: 'PL-06', location: 'Zona Franca El Trébol, Tipitapa', freightTime: '~2.2 horas', zone: 'Parque Industrial Tipitapa' },
    'Planta Camanica': { code: 'PL-CAM', location: 'Chinandega / Puerto Corinto', freightTime: '~4.5 horas', zone: 'Hub Portuario & Acuícola de Occidente' },
  };

  // Filtered lists
  const filteredSpecies = useMemo(() => {
    return woodSpecies.filter((item) => {
      if (!showInactiveSpecies && !item.isActive) return false;
      const q = searchTerm.toLowerCase();
      const meta = speciesDetailsMap[item.name.toUpperCase()];
      return (
        item.name.toLowerCase().includes(q) ||
        (meta && (meta.code.toLowerCase().includes(q) || meta.botanical.toLowerCase().includes(q)))
      );
    });
  }, [woodSpecies, searchTerm, showInactiveSpecies]);

  const filteredTypes = useMemo(() => {
    return woodTypes.filter((item) => {
      const q = searchTerm.toLowerCase();
      const meta = woodTypeDetailsMap[item.name.toUpperCase()];
      return (
        item.name.toLowerCase().includes(q) ||
        item.defaultUnit.toLowerCase().includes(q) ||
        (meta && meta.rule.toLowerCase().includes(q))
      );
    });
  }, [woodTypes, searchTerm]);

  const filteredProducts = useMemo(() => {
    return products.filter((item) => {
      if (!showInactiveProducts && !item.isActive) return false;
      const q = searchTerm.toLowerCase();
      const meta = productDetailsMap[item.dimensions] || productDetailsMap[item.name];
      return (
        item.name.toLowerCase().includes(q) ||
        item.dimensions.toLowerCase().includes(q) ||
        (meta && meta.code.toLowerCase().includes(q))
      );
    });
  }, [products, searchTerm, showInactiveProducts]);

  const filteredCenters = useMemo(() => {
    return clientCenters.filter((item) => {
      if (!showInactiveCenters && !item.isActive) return false;
      const q = searchTerm.toLowerCase();
      const meta = clientCentersMap[item.name];
      return (
        item.name.toLowerCase().includes(q) ||
        (item.location && item.location.toLowerCase().includes(q)) ||
        (meta && (meta.code.toLowerCase().includes(q) || meta.zone.toLowerCase().includes(q)))
      );
    });
  }, [clientCenters, searchTerm, showInactiveCenters]);

  // Handle status toggle confirmation
  const handleConfirmStatusToggle = async () => {
    if (statusModal.itemType === 'species') {
      await onToggleSpeciesStatus(statusModal.id, statusModal.currentStatus);
    } else if (statusModal.itemType === 'product') {
      await onToggleProductStatus(statusModal.id, statusModal.currentStatus);
    } else if (statusModal.itemType === 'clientCenter') {
      await onToggleClientCenterStatus(statusModal.id, statusModal.currentStatus);
    }
  };

  return (
    <div className="space-y-6">
      {/* ======================================================================= */}
      {/* CONTEXTUAL BANNER: MASTER CATALOG MANAGEMENT                           */}
      {/* ======================================================================= */}
      <div className="bg-gradient-to-r from-blue-50/90 via-slate-50 to-emerald-50/60 rounded-2xl p-5 border border-blue-200/80 shadow-sm flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-blue-100/80 border border-blue-200 flex items-center justify-center text-[#1D71CB] shrink-0 mt-0.5">
          <Layers className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-sm font-bold text-navy">
              Gestión Dinámica de Catálogos Maestros
            </h2>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-100/80 text-[#1D71CB] border border-blue-200">
              <CheckCircle2 className="w-3.5 h-3.5" />
              CRUD & Soft-Delete Activo
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-200">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Preservación Histórica
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
            Gestión de Catálogos Maestros: Los registros inactivos se ocultan automáticamente de las operaciones diarias de planta sin afectar la integridad referencial ni los registros históricos de trazabilidad.
          </p>
        </div>
      </div>

      {/* ======================================================================= */}
      {/* TABS NAVIGATION & SEARCH BAR                                            */}
      {/* ======================================================================= */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl overflow-x-auto">
          <button
            onClick={() => { setActiveTab('wood-species'); setSearchTerm(''); }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
              activeTab === 'wood-species'
                ? 'bg-white text-navy shadow-sm'
                : 'text-slate-600 hover:text-navy hover:bg-white/50'
            }`}
          >
            <TreePine className="w-4 h-4 text-forest" />
            <span>Especies de Madera</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-slate-200/80 text-slate-700">
              {woodSpecies.length}
            </span>
          </button>

          <button
            onClick={() => { setActiveTab('products'); setSearchTerm(''); }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
              activeTab === 'products'
                ? 'bg-white text-navy shadow-sm'
                : 'text-slate-600 hover:text-navy hover:bg-white/50'
            }`}
          >
            <Package className="w-4 h-4 text-[#1D71CB]" />
            <span>Polines Terminados</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-slate-200/80 text-slate-700">
              {products.length}
            </span>
          </button>

          <button
            onClick={() => { setActiveTab('client-centers'); setSearchTerm(''); }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
              activeTab === 'client-centers'
                ? 'bg-white text-navy shadow-sm'
                : 'text-slate-600 hover:text-navy hover:bg-white/50'
            }`}
          >
            <Building2 className="w-4 h-4 text-purple-600" />
            <span>Plantas Cliente</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-slate-200/80 text-slate-700">
              {clientCenters.length}
            </span>
          </button>

          <button
            onClick={() => { setActiveTab('wood-types'); setSearchTerm(''); }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
              activeTab === 'wood-types'
                ? 'bg-white text-navy shadow-sm'
                : 'text-slate-600 hover:text-navy hover:bg-white/50'
            }`}
          >
            <Layers className="w-4 h-4 text-amber-600" />
            <span>Tipos de Madera</span>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100/70 px-1.5 py-0.5 rounded">
              <Lock className="w-3 h-3" />
              RN-016
            </span>
          </button>
        </div>

        {/* Right side: Search and Create buttons */}
        <div className="flex items-center gap-3 w-full lg:w-auto">
          <div className="relative flex-1 lg:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar en catálogo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#1D71CB]/20 focus:border-[#1D71CB] bg-white text-slate-900"
            />
          </div>

          {/* Action button conditional on active tab & role */}
          {canManage && activeTab === 'wood-species' && (
            <button
              onClick={() => { setSpeciesToEdit(null); setIsSpeciesModalOpen(true); }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-[#1D71CB] hover:bg-blue-700 transition-colors shadow-sm shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Nueva Especie</span>
            </button>
          )}

          {canManage && activeTab === 'products' && (
            <button
              onClick={() => { setProductToEdit(null); setIsProductModalOpen(true); }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-[#1D71CB] hover:bg-blue-700 transition-colors shadow-sm shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Nuevo Polín</span>
            </button>
          )}

          {canManage && activeTab === 'client-centers' && (
            <button
              onClick={() => { setCenterToEdit(null); setIsCenterModalOpen(true); }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-[#1D71CB] hover:bg-blue-700 transition-colors shadow-sm shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Nueva Planta</span>
            </button>
          )}
        </div>
      </div>

      {/* ======================================================================= */}
      {/* TAB 1: ESPECIES BOTÁNICAS DE MADERA                                     */}
      {/* ======================================================================= */}
      {activeTab === 'wood-species' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-semibold text-slate-500">
              Mostrando {filteredSpecies.length} de {woodSpecies.length} especies
            </span>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showInactiveSpecies}
                onChange={(e) => setShowInactiveSpecies(e.target.checked)}
                className="w-4 h-4 text-[#1D71CB] rounded border-slate-300 focus:ring-[#1D71CB]"
              />
              <span>Mostrar inactivas</span>
            </label>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Código</th>
                    <th className="py-3 px-4">Nombre Comercial</th>
                    <th className="py-3 px-4">Especie Botánica</th>
                    <th className="py-3 px-4">Características Físicas</th>
                    <th className="py-3 px-4 text-center">Estado</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredSpecies.map((item) => {
                    const meta = speciesDetailsMap[item.name.toUpperCase()] || {
                      code: 'ESP-GEN',
                      botanical: item.botanicalName || 'Especie forestal autorizada',
                      description: item.description || 'Madera clasificada para producción',
                    };

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-bold text-[#1D71CB]">
                          {meta.code}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-navy">
                          {item.name}
                        </td>
                        <td className="py-3.5 px-4 italic text-slate-600">
                          {meta.botanical}
                        </td>
                        <td className="py-3.5 px-4 text-slate-500 max-w-xs truncate" title={meta.description}>
                          {meta.description}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                              item.isActive
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            {item.isActive ? 'ACTIVO' : 'INACTIVO'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          {canManage ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                onClick={() => { setSpeciesToEdit(item); setIsSpeciesModalOpen(true); }}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-[#1D71CB] hover:bg-blue-50 transition-colors"
                                title="Editar especie"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() =>
                                  setStatusModal({
                                    isOpen: true,
                                    itemType: 'species',
                                    id: item.id,
                                    name: item.name,
                                    currentStatus: item.isActive,
                                  })
                                }
                                className={`p-1.5 rounded-lg transition-colors ${
                                  item.isActive
                                    ? 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                                    : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                                }`}
                                title={item.isActive ? 'Inactivar especie' : 'Reactivar especie'}
                              >
                                {item.isActive ? (
                                  <PowerOff className="w-3.5 h-3.5 text-amber-600" />
                                ) : (
                                  <Power className="w-3.5 h-3.5 text-emerald-600" />
                                )}
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">Solo lectura</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredSpecies.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400 text-xs">
                        No se encontraron especies con los filtros seleccionados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================= */}
      {/* TAB 2: PRODUCTOS / POLINES TERMINADOS                                    */}
      {/* ======================================================================= */}
      {activeTab === 'products' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-semibold text-slate-500">
              Mostrando {filteredProducts.length} de {products.length} polines
            </span>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showInactiveProducts}
                onChange={(e) => setShowInactiveProducts(e.target.checked)}
                className="w-4 h-4 text-[#1D71CB] rounded border-slate-300 focus:ring-[#1D71CB]"
              />
              <span>Mostrar inactivos</span>
            </label>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Código</th>
                    <th className="py-3 px-4">Denominación Comercial</th>
                    <th className="py-3 px-4">Dimensiones Normalizadas</th>
                    <th className="py-3 px-4">Peso / Aplicación</th>
                    <th className="py-3 px-4 text-center">Estado</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredProducts.map((item) => {
                    const meta = productDetailsMap[item.dimensions] || productDetailsMap[item.name] || {
                      code: `POL-${item.dimensions.replace(/[^0-9]/g, '') || 'GEN'}`,
                      dimensionsMm: `${item.dimensions} mm`,
                      weightEst: 'Estándar',
                      application: 'Formato comercial para despacho',
                    };

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-bold text-[#1D71CB]">
                          {meta.code}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-navy">
                          {item.name}
                        </td>
                        <td className="py-3.5 px-4 font-mono font-semibold text-slate-700">
                          {item.dimensions}
                        </td>
                        <td className="py-3.5 px-4 text-slate-500 max-w-xs truncate" title={meta.application}>
                          {meta.application}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                              item.isActive
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            {item.isActive ? 'ACTIVO' : 'INACTIVO'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          {canManage ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                onClick={() => { setProductToEdit(item); setIsProductModalOpen(true); }}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-[#1D71CB] hover:bg-blue-50 transition-colors"
                                title="Editar polín"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() =>
                                  setStatusModal({
                                    isOpen: true,
                                    itemType: 'product',
                                    id: item.id,
                                    name: item.name,
                                    currentStatus: item.isActive,
                                  })
                                }
                                className={`p-1.5 rounded-lg transition-colors ${
                                  item.isActive
                                    ? 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                                    : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                                }`}
                                title={item.isActive ? 'Inactivar polín' : 'Reactivar polín'}
                              >
                                {item.isActive ? (
                                  <PowerOff className="w-3.5 h-3.5 text-amber-600" />
                                ) : (
                                  <Power className="w-3.5 h-3.5 text-emerald-600" />
                                )}
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">Solo lectura</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredProducts.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400 text-xs">
                        No se encontraron polines con los filtros seleccionados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================= */}
      {/* TAB 3: PLANTAS CLIENTE / DESTINOS DE ENTREGA                            */}
      {/* ======================================================================= */}
      {activeTab === 'client-centers' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-semibold text-slate-500">
              Mostrando {filteredCenters.length} de {clientCenters.length} plantas
            </span>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showInactiveCenters}
                onChange={(e) => setShowInactiveCenters(e.target.checked)}
                className="w-4 h-4 text-[#1D71CB] rounded border-slate-300 focus:ring-[#1D71CB]"
              />
              <span>Mostrar inactivas</span>
            </label>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Código</th>
                    <th className="py-3 px-4">Nombre de Planta / Centro</th>
                    <th className="py-3 px-4">Ubicación Logística</th>
                    <th className="py-3 px-4">Flete Estimado</th>
                    <th className="py-3 px-4 text-center">Estado</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredCenters.map((item) => {
                    const meta = clientCentersMap[item.name] || {
                      code: 'PL-EXT',
                      location: item.location || 'Ubicación industrial',
                      freightTime: '~2.0 horas',
                      zone: 'Sector Logístico',
                    };

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-bold text-[#1D71CB]">
                          {meta.code}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-navy">
                          {item.name}
                        </td>
                        <td className="py-3.5 px-4 text-slate-600">
                          {item.location || meta.location}
                        </td>
                        <td className="py-3.5 px-4 text-slate-500">
                          {meta.freightTime}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                              item.isActive
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            {item.isActive ? 'ACTIVO' : 'INACTIVO'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          {canManage ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                onClick={() => { setCenterToEdit(item); setIsCenterModalOpen(true); }}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-[#1D71CB] hover:bg-blue-50 transition-colors"
                                title="Editar planta"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() =>
                                  setStatusModal({
                                    isOpen: true,
                                    itemType: 'clientCenter',
                                    id: item.id,
                                    name: item.name,
                                    currentStatus: item.isActive,
                                  })
                                }
                                className={`p-1.5 rounded-lg transition-colors ${
                                  item.isActive
                                    ? 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                                    : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                                }`}
                                title={item.isActive ? 'Inactivar planta' : 'Reactivar planta'}
                              >
                                {item.isActive ? (
                                  <PowerOff className="w-3.5 h-3.5 text-amber-600" />
                                ) : (
                                  <Power className="w-3.5 h-3.5 text-emerald-600" />
                                )}
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">Solo lectura</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredCenters.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400 text-xs">
                        No se encontraron plantas cliente con los filtros seleccionados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================= */}
      {/* TAB 4: TIPOS DE MADERA Y UNIDADES (INMUTABLE / RN-016)                  */}
      {/* ======================================================================= */}
      {activeTab === 'wood-types' && (
        <div className="space-y-4">
          <div className="bg-amber-50/80 border border-amber-200/80 rounded-2xl p-4 flex items-start gap-3">
            <Lock className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold text-amber-900">
                Invariante Regulatorio RN-016: Catálogo Estructural Inmutable
              </h4>
              <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                Los tipos de madera física rigen la unidad de medida forzosa de la plataforma (TIMBRE en Pie Tablar vs PROCESADA en Piezas). Este catálogo permanece 100% inmutable para garantizar la consistencia física del libro mayor append-only de existencias.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Código</th>
                    <th className="py-3 px-4">Tipo de Madera</th>
                    <th className="py-3 px-4">Unidad Forzosa (RN-016)</th>
                    <th className="py-3 px-4">Regla de Negocio</th>
                    <th className="py-3 px-4 text-center">Protección</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredTypes.map((item) => {
                    const meta = woodTypeDetailsMap[item.name.toUpperCase()] || {
                      code: 'TP-GEN',
                      unit: item.defaultUnit,
                      rule: 'Regla normativa de unidad física',
                    };

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-bold text-amber-700">
                          {meta.code}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-navy">
                          {item.name}
                        </td>
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-800">
                          {meta.unit}
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 max-w-md">
                          {meta.rule}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
                            <Lock className="w-3 h-3" />
                            SOLO LECTURA
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <SpeciesModal
        isOpen={isSpeciesModalOpen}
        onClose={() => setIsSpeciesModalOpen(false)}
        onSubmit={async (data) => {
          if (speciesToEdit) {
            await onUpdateSpecies(speciesToEdit.id, data);
          } else {
            await onCreateSpecies(data);
          }
        }}
        speciesToEdit={speciesToEdit}
      />

      <ProductModal
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
        onSubmit={async (data) => {
          if (productToEdit) {
            await onUpdateProduct(productToEdit.id, data);
          } else {
            await onCreateProduct(data);
          }
        }}
        productToEdit={productToEdit}
      />

      <ClientCenterModal
        isOpen={isCenterModalOpen}
        onClose={() => setIsCenterModalOpen(false)}
        onSubmit={async (data) => {
          if (centerToEdit) {
            await onUpdateClientCenter(centerToEdit.id, data);
          } else {
            await onCreateClientCenter(data);
          }
        }}
        clientCenterToEdit={centerToEdit}
      />

      <CatalogStatusModal
        isOpen={statusModal.isOpen}
        onClose={() => setStatusModal({ ...statusModal, isOpen: false })}
        onConfirm={handleConfirmStatusToggle}
        itemName={statusModal.name}
        itemTypeLabel={
          statusModal.itemType === 'species'
            ? 'Especie de Madera'
            : statusModal.itemType === 'product'
            ? 'Polín'
            : 'Planta Cliente'
        }
        currentStatus={statusModal.currentStatus}
      />
    </div>
  );
}
