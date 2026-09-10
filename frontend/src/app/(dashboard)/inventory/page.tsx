'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import {
  PageTitle,
  MutedText,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Button,
  Select,
  Input,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableLoading,
  TableEmpty,
  Skeleton,
  Alert,
  TablePagination,
} from '@/components/ui';
import {
  Boxes,
  History,
  RefreshCw,
  SlidersHorizontal,
  ArrowDownLeft,
  ArrowUpRight,
  RotateCcw,
  Layers,
  Truck,
  RotateCcw as ReturnIcon,
  Filter,
  XCircle,
  ChevronLeft,
  ChevronRight,
  PackageCheck,
  Calendar,
} from 'lucide-react';
import { formatDateTime } from '@/lib/date-formatters';

interface ProductStock {
  productId: string;
  productName: string;
  dimensions: string;
  producedQuantity: number;
  dispatchedQuantity: number;
  returnedQuantity: number;
  adjustmentNetQuantity: number;
  availableStock: number;
}

interface KardexMovement {
  id: string;
  productId: string;
  movementType: 'PRODUCTION' | 'DISPATCH' | 'RETURN' | 'ADJUSTMENT';
  deltaQuantity: number;
  referenceTable: string;
  referenceId: string;
  timestamp: string;
  product?: {
    name: string;
    dimensions: string;
  };
  performedBy?: {
    id: string;
    fullName: string;
    email: string;
  };
}

interface KardexMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export default function InventoryPage() {
  const { session, role } = useAuth();
  const token = session?.access_token;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

  // Navigation tab: 'stock' | 'kardex'
  const [activeTab, setActiveTab] = useState<'stock' | 'kardex'>('stock');

  // Stock State
  const [inventory, setInventory] = useState<ProductStock[]>([]);
  const [isLoadingStock, setIsLoadingStock] = useState<boolean>(true);
  const [stockError, setStockError] = useState<string | null>(null);

  // Kardex State
  const [kardexMovements, setKardexMovements] = useState<KardexMovement[]>([]);
  const [kardexPageSize, setKardexPageSize] = useState<number>(10);
  const [kardexMeta, setKardexMeta] = useState<KardexMeta>({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 1,
  });
  const [isLoadingKardex, setIsLoadingKardex] = useState<boolean>(false);
  const [kardexError, setKardexError] = useState<string | null>(null);

  // Kardex Filters
  const [filterProduct, setFilterProduct] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');

  // --------------------------------------------------------------------------
  // 1. Fetch Inventory Stock (EP-INV-01)
  // --------------------------------------------------------------------------
  const fetchStock = useCallback(async () => {
    if (!token) return;
    setIsLoadingStock(true);
    setStockError(null);
    try {
      const res = await fetch(`${apiUrl}/inventory`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(`Error al consultar inventario: HTTP ${res.status}`);
      }
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setInventory(json.data);
      } else {
        setInventory([]);
      }
    } catch (err: any) {
      setStockError(err.message || 'Error de conexión con el servidor de inventario');
    } finally {
      setIsLoadingStock(false);
    }
  }, [apiUrl, token]);

  // --------------------------------------------------------------------------
  // 2. Fetch Kardex Movements (EP-INV-02)
  // --------------------------------------------------------------------------
  const fetchKardex = useCallback(
    async (page: number = 1, size: number = kardexPageSize) => {
      if (!token) return;
      setIsLoadingKardex(true);
      setKardexError(null);
      try {
        const queryParams = new URLSearchParams();
        queryParams.append('page', page.toString());
        queryParams.append('limit', size.toString());

        if (filterProduct) queryParams.append('productId', filterProduct);
        if (filterType) queryParams.append('movementType', filterType);
        if (filterStartDate) queryParams.append('startDate', filterStartDate);
        if (filterEndDate) queryParams.append('endDate', filterEndDate);

        const res = await fetch(`${apiUrl}/inventory/movements?${queryParams.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error(`Error al consultar movimientos del Kardex: HTTP ${res.status}`);
        }
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setKardexMovements(json.data);
          if (json.meta) {
            setKardexMeta(json.meta);
          }
        } else {
          setKardexMovements([]);
        }
      } catch (err: any) {
        setKardexError(err.message || 'Error de conexión con el Kardex');
      } finally {
        setIsLoadingKardex(false);
      }
    },
    [apiUrl, token, filterProduct, filterType, filterStartDate, filterEndDate, kardexPageSize]
  );

  // Initial load
  useEffect(() => {
    fetchStock();
  }, [fetchStock]);

  // Load Kardex when tab switches or filters change
  useEffect(() => {
    if (activeTab === 'kardex') {
      fetchKardex(1);
    }
  }, [activeTab, fetchKardex]);

  // Reset Filters
  const handleClearFilters = () => {
    setFilterProduct('');
    setFilterType('');
    setFilterStartDate('');
    setFilterEndDate('');
  };

  // --------------------------------------------------------------------------
  // Global Aggregated KPI Calculations
  // --------------------------------------------------------------------------
  const totalStockAvailable = inventory.reduce((sum, p) => sum + (p.availableStock || 0), 0);
  const totalProduced = inventory.reduce((sum, p) => sum + (p.producedQuantity || 0), 0);
  const totalDispatched = inventory.reduce((sum, p) => sum + (p.dispatchedQuantity || 0), 0);
  const totalReturned = inventory.reduce((sum, p) => sum + (p.returnedQuantity || 0), 0);
  const totalAdjustments = inventory.reduce((sum, p) => sum + (p.adjustmentNetQuantity || 0), 0);

  return (
    <div className="space-y-6 pb-12">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <PageTitle>Existencias & Kardex de Polines</PageTitle>
          <MutedText>
            Control de inventario físico en patio y libro mayor de movimientos append-only (RN-010, TSK-21).
          </MutedText>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (activeTab === 'stock') fetchStock();
              else fetchKardex(kardexMeta.page);
            }}
            disabled={isLoadingStock || isLoadingKardex}
            className="flex items-center gap-2 text-slate-700 bg-white shadow-xs"
          >
            <RefreshCw
              className={`w-4 h-4 ${isLoadingStock || isLoadingKardex ? 'animate-spin text-blue-600' : ''}`}
            />
            <span>Actualizar</span>
          </Button>

          {role === 'ADMIN' && (
            <Link href="/inventory/adjustments">
              <Button size="sm" className="bg-[#1D71CB] hover:bg-[#165ba3] text-white shadow-xs flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4" />
                <span>Ajustes de Stock</span>
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* KPI METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="border-l-4 border-l-blue-600 shadow-xs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Stock Disponible</p>
                {isLoadingStock ? (
                  <Skeleton className="h-8 w-24 mt-1" />
                ) : (
                  <h3 className="text-2xl font-black text-slate-900 font-mono mt-1">
                    {totalStockAvailable.toLocaleString()} <span className="text-xs font-normal text-slate-500">pcs</span>
                  </h3>
                )}
              </div>
              <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600">
                <Boxes className="w-5 h-5" />
              </div>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">Saldo físico real en patio de acopio</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-600 shadow-xs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Producido</p>
                {isLoadingStock ? (
                  <Skeleton className="h-8 w-24 mt-1" />
                ) : (
                  <h3 className="text-2xl font-black text-slate-900 font-mono mt-1">
                    {totalProduced.toLocaleString()} <span className="text-xs font-normal text-slate-500">pcs</span>
                  </h3>
                )}
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600">
                <Layers className="w-5 h-5" />
              </div>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">Acumulado de órdenes de aserrío</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-600 shadow-xs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Despachado</p>
                {isLoadingStock ? (
                  <Skeleton className="h-8 w-24 mt-1" />
                ) : (
                  <h3 className="text-2xl font-black text-slate-900 font-mono mt-1">
                    {totalDispatched.toLocaleString()} <span className="text-xs font-normal text-slate-500">pcs</span>
                  </h3>
                )}
              </div>
              <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600">
                <Truck className="w-5 h-5" />
              </div>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">Salidas a plantas cliente</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-indigo-600 shadow-xs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Devoluciones</p>
                {isLoadingStock ? (
                  <Skeleton className="h-8 w-24 mt-1" />
                ) : (
                  <h3 className="text-2xl font-black text-slate-900 font-mono mt-1">
                    {totalReturned.toLocaleString()} <span className="text-xs font-normal text-slate-500">pcs</span>
                  </h3>
                )}
              </div>
              <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600">
                <ReturnIcon className="w-5 h-5" />
              </div>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">Reincorporaciones de producto</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-600 shadow-xs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Ajustes Netos</p>
                {isLoadingStock ? (
                  <Skeleton className="h-8 w-24 mt-1" />
                ) : (
                  <h3 className="text-2xl font-black text-slate-900 font-mono mt-1">
                    {totalAdjustments > 0 ? `+${totalAdjustments}` : totalAdjustments}{' '}
                    <span className="text-xs font-normal text-slate-500">pcs</span>
                  </h3>
                )}
              </div>
              <div className="p-2.5 rounded-xl bg-purple-50 text-purple-600">
                <SlidersHorizontal className="w-5 h-5" />
              </div>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">Rectificaciones de patio autorizadas</p>
          </CardContent>
        </Card>
      </div>

      {/* VIEW TABS SEGMENTED CONTROL */}
      <div className="flex items-center border-b border-slate-200">
        <button
          onClick={() => setActiveTab('stock')}
          className={`flex items-center gap-2 px-5 py-3 font-semibold text-sm transition-colors border-b-2 -mb-px ${
            activeTab === 'stock'
              ? 'border-blue-600 text-blue-600 bg-blue-50/50'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Boxes className="w-4 h-4" />
          <span>Existencias en Patio ({inventory.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('kardex')}
          className={`flex items-center gap-2 px-5 py-3 font-semibold text-sm transition-colors border-b-2 -mb-px ${
            activeTab === 'kardex'
              ? 'border-blue-600 text-blue-600 bg-blue-50/50'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Kardex Append-Only</span>
          {kardexMeta.total > 0 && (
            <Badge variant="neutral" size="sm">
              {kardexMeta.total}
            </Badge>
          )}
        </button>
      </div>

      {/* ==================================================================== */}
      {/* TAB 1: EXISTENCIAS EN PATIO                                          */}
      {/* ==================================================================== */}
      {activeTab === 'stock' && (
        <Card className="shadow-xs border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base text-slate-900 flex items-center gap-2">
                <PackageCheck className="w-4 h-4 text-blue-600" />
                <span>Existencias Físicas por Catálogo de Polines</span>
              </CardTitle>
              <MutedText>
                Fórmula canónica RN-010: Stock = Producción - Salidas + Devoluciones ± Ajustes
              </MutedText>
            </div>
            <Badge variant="institutional">Fuente Única: Ledger</Badge>
          </CardHeader>
          <CardContent className="p-0">
            {stockError && (
              <div className="p-4">
                <Alert variant="destructive">{stockError}</Alert>
              </div>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[280px]">Producto</TableHead>
                  <TableHead>Dimensiones</TableHead>
                  <TableHead className="text-right">Producido</TableHead>
                  <TableHead className="text-right">Despachado</TableHead>
                  <TableHead className="text-right">Devuelto</TableHead>
                  <TableHead className="text-right">Ajustes</TableHead>
                  <TableHead className="text-right w-[160px]">Stock Disponible</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingStock ? (
                  <TableLoading colSpan={7} message="Calculando existencias en vivo desde PostgreSQL..." />
                ) : inventory.length === 0 ? (
                  <TableEmpty
                    colSpan={7}
                    title="Sin productos en inventario"
                    message="No se encontraron productos registrados en el catálogo."
                  />
                ) : (
                  inventory.map((item) => {
                    const isZeroStock = item.availableStock === 0;
                    const isLowStock = item.availableStock > 0 && item.availableStock < 50;

                    return (
                      <TableRow key={item.productId} className="hover:bg-slate-50/70 transition-colors">
                        <TableCell className="font-semibold text-slate-900">
                          {item.productName}
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                            {item.dimensions}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-slate-700">
                          +{item.producedQuantity.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-mono text-slate-700">
                          -{item.dispatchedQuantity.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-mono text-slate-700">
                          {item.returnedQuantity > 0 ? `+${item.returnedQuantity.toLocaleString()}` : '0'}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {item.adjustmentNetQuantity > 0 ? (
                            <span className="text-emerald-700">+{item.adjustmentNetQuantity}</span>
                          ) : item.adjustmentNetQuantity < 0 ? (
                            <span className="text-rose-700">{item.adjustmentNetQuantity}</span>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-sm">
                          <span
                            className={`px-2.5 py-1 rounded-full border ${
                              isZeroStock
                                ? 'bg-slate-100 text-slate-500 border-slate-200'
                                : isLowStock
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            }`}
                          >
                            {item.availableStock.toLocaleString()} pcs
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ==================================================================== */}
      {/* TAB 2: KARDEX APPEND-ONLY (READ-ONLY)                                */}
      {/* ==================================================================== */}
      {activeTab === 'kardex' && (
        <div className="space-y-4">
          {/* FILTERS BAR */}
          <Card className="shadow-xs border-slate-200 bg-slate-50/50">
            <CardContent className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
                {/* Product Filter */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Producto
                  </label>
                  <Select
                    value={filterProduct}
                    onChange={(e) => setFilterProduct(e.target.value)}
                  >
                    <option value="">Todos los productos</option>
                    {inventory.map((p) => (
                      <option key={p.productId} value={p.productId}>
                        {p.productName} ({p.dimensions})
                      </option>
                    ))}
                  </Select>
                </div>

                {/* Movement Type Filter */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Tipo de Movimiento
                  </label>
                  <Select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                  >
                    <option value="">Todos los tipos</option>
                    <option value="PRODUCTION">PRODUCCIÓN (+)</option>
                    <option value="DISPATCH">DESPACHO (-)</option>
                    <option value="RETURN">DEVOLUCIÓN (+)</option>
                    <option value="ADJUSTMENT">AJUSTE (±)</option>
                  </Select>
                </div>

                {/* Start Date */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Desde (Fecha)
                  </label>
                  <Input
                    type="date"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                  />
                </div>

                {/* End Date */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Hasta (Fecha)
                  </label>
                  <Input
                    type="date"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="md"
                    onClick={handleClearFilters}
                    className="w-full text-slate-600 bg-white"
                  >
                    <XCircle className="w-4 h-4 mr-1 text-slate-400" />
                    <span>Limpiar</span>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* KARDEX TABLE */}
          <Card className="shadow-xs border-slate-200">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base text-slate-900 flex items-center gap-2">
                  <History className="w-4 h-4 text-blue-600" />
                  <span>Libro Mayor de Inventario (Append-Only)</span>
                </CardTitle>
                <MutedText>
                  Registro secuencial inmutable de variaciones físicas. Solo lectura (UC-INV-01).
                </MutedText>
              </div>
              <Badge variant="neutral">Inmutable (Sin borrados)</Badge>
            </CardHeader>
            <CardContent className="p-0">
              {kardexError && (
                <div className="p-4">
                  <Alert variant="destructive">{kardexError}</Alert>
                </div>
              )}

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Fecha / Hora</TableHead>
                    <TableHead className="w-[150px]">Tipo Movimiento</TableHead>
                    <TableHead>Producto Afectado</TableHead>
                    <TableHead className="text-right w-[130px]">Variación (Delta)</TableHead>
                    <TableHead>Referencia Origen</TableHead>
                    <TableHead>Ejecutado Por</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingKardex ? (
                    <TableLoading colSpan={6} message="Consultando movimientos del libro mayor..." />
                  ) : kardexMovements.length === 0 ? (
                    <TableEmpty
                      colSpan={6}
                      title="Sin movimientos registrados"
                      message="No se encontraron variaciones físicas para los filtros seleccionados."
                    />
                  ) : (
                    kardexMovements.map((mov) => {
                      const dt = formatDateTime(mov.timestamp);
                      const isPositive = mov.deltaQuantity > 0;

                      return (
                        <TableRow key={mov.id} className="hover:bg-slate-50/70 transition-colors">
                          <TableCell className="font-mono text-xs text-slate-600">
                            {dt.full}
                          </TableCell>
                          <TableCell>
                            {mov.movementType === 'PRODUCTION' && (
                              <Badge variant="success">
                                <ArrowDownLeft className="w-3 h-3 mr-1 inline" />
                                PRODUCCIÓN
                              </Badge>
                            )}
                            {mov.movementType === 'DISPATCH' && (
                              <Badge variant="warning">
                                <ArrowUpRight className="w-3 h-3 mr-1 inline" />
                                DESPACHO
                              </Badge>
                            )}
                            {mov.movementType === 'RETURN' && (
                              <Badge variant="default">
                                <RotateCcw className="w-3 h-3 mr-1 inline" />
                                DEVOLUCIÓN
                              </Badge>
                            )}
                            {mov.movementType === 'ADJUSTMENT' && (
                              <Badge variant="purple">
                                <SlidersHorizontal className="w-3 h-3 mr-1 inline" />
                                AJUSTE
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-semibold text-slate-900 text-xs">
                            {mov.product ? (
                              <span>
                                {mov.product.name}{' '}
                                <span className="font-mono text-slate-500 font-normal">
                                  ({mov.product.dimensions})
                                </span>
                              </span>
                            ) : (
                              <span className="font-mono text-slate-400 text-xs">{mov.productId}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold text-xs">
                            <span
                              className={`px-2 py-0.5 rounded ${
                                isPositive
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}
                            >
                              {isPositive ? `+${mov.deltaQuantity}` : mov.deltaQuantity} pcs
                            </span>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-slate-500">
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-600">
                              {mov.referenceTable}
                            </span>{' '}
                            <span title={mov.referenceId}>
                              #{mov.referenceId.slice(0, 8)}...
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-slate-600">
                            {mov.performedBy?.fullName || 'Sistema'}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>

              {/* PAGINATION */}
              {kardexMeta.total > 0 && (
                <TablePagination
                  currentPage={kardexMeta.page}
                  totalPages={kardexMeta.totalPages}
                  totalRecords={kardexMeta.total}
                  pageSize={kardexPageSize}
                  onPageChange={(newPage) => {
                    fetchKardex(newPage, kardexPageSize);
                  }}
                  onPageSizeChange={(newSize) => {
                    setKardexPageSize(newSize);
                    fetchKardex(1, newSize);
                  }}
                  isLoading={isLoadingKardex}
                />
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
