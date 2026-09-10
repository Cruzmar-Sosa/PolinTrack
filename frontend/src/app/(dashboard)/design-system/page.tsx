'use client';

import React, { useState } from 'react';
import {
  PageTitle,
  SectionTitle,
  CardTitle,
  MutedText,
  DataMono,
  Button,
  Input,
  Textarea,
  Select,
  Checkbox,
  Badge,
  StatusBadge,
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  KpiCard,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
  Dialog,
  DialogFooter,
  Alert,
  EmptyState,
  ErrorState,
  Skeleton,
} from '@/components/ui';
import {
  Boxes,
  CheckCircle2,
  FileSpreadsheet,
  Layers,
  Send,
  Sliders,
  Sparkles,
  Truck,
  Users,
} from 'lucide-react';

export default function DesignSystemShowcasePage() {
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  // Form State
  const [inputValue, setInputValue] = useState('Texto de demostración');
  const [hasError, setHasError] = useState(false);
  const [isChecked, setIsChecked] = useState(true);
  const [isLoadingButton, setIsLoadingButton] = useState(false);

  return (
    <div className="space-y-10 pb-16">
      {/* 1. Header de Sección */}
      <div className="border-b border-slate-200 pb-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <PageTitle>UI Design System & Primitives (TSK-18)</PageTitle>
          <MutedText>
            Catálogo industrial de tokens y componentes reutilizables aprobados según especificaciones de Stitch.
          </MutedText>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="institutional">Stitch Project 17027511193866501411</Badge>
          <Badge variant="default">v1.0.0 Core</Badge>
        </div>
      </div>

      {/* 2. Swatches de Paleta de Colores Normativa */}
      <section className="space-y-4">
        <SectionTitle>1. Tokens Cromáticos Normativos</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          <div className="p-3 bg-[#1D71CB] text-white rounded-lg shadow-sm">
            <span className="text-xs font-mono font-bold block">ACTION BLUE</span>
            <span className="text-[10px] font-mono opacity-80">#1D71CB</span>
          </div>
          <div className="p-3 bg-[#0D1B36] text-white rounded-lg shadow-sm">
            <span className="text-xs font-mono font-bold block">STRUCTURAL</span>
            <span className="text-[10px] font-mono opacity-80">#0D1B36</span>
          </div>
          <div className="p-3 bg-[#3A6A44] text-white rounded-lg shadow-sm">
            <span className="text-xs font-mono font-bold block">FOREST PINE</span>
            <span className="text-[10px] font-mono opacity-80">#3A6A44</span>
          </div>
          <div className="p-3 bg-[#16A34A] text-white rounded-lg shadow-sm">
            <span className="text-xs font-mono font-bold block">SUCCESS</span>
            <span className="text-[10px] font-mono opacity-80">#16A34A</span>
          </div>
          <div className="p-3 bg-[#D97706] text-white rounded-lg shadow-sm">
            <span className="text-xs font-mono font-bold block">WARNING</span>
            <span className="text-[10px] font-mono opacity-80">#D97706</span>
          </div>
          <div className="p-3 bg-[#DC2626] text-white rounded-lg shadow-sm">
            <span className="text-xs font-mono font-bold block">DESTRUCTIVE</span>
            <span className="text-[10px] font-mono opacity-80">#DC2626</span>
          </div>
        </div>
      </section>

      {/* 3. Tipografía y Jerarquías */}
      <section className="space-y-4">
        <SectionTitle>2. Jerarquía Tipográfica y Tabular-Nums</SectionTitle>
        <Card>
          <CardContent className="space-y-3">
            <div>
              <PageTitle>PageTitle (H1) — 24px / 32px Semibold</PageTitle>
              <MutedText>Utilizado en la cabecera superior de cada módulo operativo.</MutedText>
            </div>
            <div>
              <SectionTitle>SectionTitle (H2) — 18px / 28px Medium</SectionTitle>
              <MutedText>Utilizado para delimitar secciones en formularios y tablas.</MutedText>
            </div>
            <div>
              <CardTitle>CardTitle (H3) — 14px / 20px Semibold Uppercase Mono</CardTitle>
            </div>
            <div className="flex items-center gap-4 pt-2">
              <span className="text-sm text-slate-700">Lote Industrial:</span>
              <DataMono className="text-primary bg-primary/10 px-2 py-0.5 rounded">
                LT-030926-01
              </DataMono>
              <span className="text-sm text-slate-700">Factura Comercial:</span>
              <DataMono className="text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                F-1002
              </DataMono>
              <span className="text-sm text-slate-700">Cantidad:</span>
              <DataMono className="text-emerald-700 font-bold">
                +1,500 pcs
              </DataMono>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 4. Botones y Variantes */}
      <section className="space-y-4">
        <SectionTitle>3. Botones y Estados Interactivos</SectionTitle>
        <Card>
          <CardContent className="space-y-4">
            <div>
              <span className="text-xs font-semibold text-slate-500 block mb-2 font-mono uppercase">
                Variantes Semánticas
              </span>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="default">Action Blue (Default)</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="institutional">Forest Pine (Empresa)</Button>
                <Button variant="destructive">Destructive</Button>
                <Button variant="ghost">Ghost Action</Button>
              </div>
            </div>

            <div>
              <span className="text-xs font-semibold text-slate-500 block mb-2 font-mono uppercase">
                Tamaños y Estados Especiales
              </span>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm">Botón Pequeño (sm)</Button>
                <Button size="md">Botón Normal (md)</Button>
                <Button size="lg">Botón Grande (lg)</Button>
                <Button disabled>Deshabilitado</Button>
                <Button
                  isLoading={isLoadingButton}
                  onClick={() => {
                    setIsLoadingButton(true);
                    setTimeout(() => setIsLoadingButton(false), 2000);
                  }}
                >
                  {isLoadingButton ? 'Procesando...' : 'Probar Loading Spinner'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 5. Controles de Formulario */}
      <section className="space-y-4">
        <SectionTitle>4. Controles de Entrada (Inputs, Select, Textarea, Checkbox)</SectionTitle>
        <Card>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Input
              label="Campo Estándar Requerido"
              placeholder="Ingrese el número de guía..."
              isRequired
              helperText="Número de remisión emitido por el proveedor."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
            />

            <Input
              label="Campo con Validación de Error en Vivo"
              placeholder="Cantidad solicitada..."
              isRequired
              defaultValue="3500"
              error={hasError ? 'Excede el stock disponible en patio (RN-002)' : undefined}
              rightAddon="pcs"
            />

            <Input
              label="Campo Generado por Sistema (Inmutable)"
              value="LT-030926-W36"
              readOnly
              helperText="El código de lote es asignado determinísticamente por el backend."
            />

            <Select
              label="Tipo de Polín Normalizado"
              isRequired
              options={[
                { value: '45x48', label: 'Polín 45x48' },
                { value: '45x47', label: 'Polín 45x47' },
                { value: '48x54', label: 'Polín 48x54' },
                { value: '48x64', label: 'Polín 48x64' },
                { value: '120x80', label: 'Polín 120x80' },
              ]}
            />

            <div className="md:col-span-2">
              <Textarea
                label="Observaciones Operativas"
                placeholder="Comentarios adicionales sobre el estado de la carga..."
                rows={2}
              />
            </div>

            <div className="flex items-center gap-6">
              <Checkbox
                label="Confirmar verificación fitosanitaria OIRSA"
                description="Habilitado únicamente con certificado en mano"
                checked={isChecked}
                onChange={(e) => setIsChecked(e.target.checked)}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setHasError(!hasError)}
              >
                Alternar Estado Error Input
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 6. Badges y Estados Operativos */}
      <section className="space-y-4">
        <SectionTitle>5. Badges y Estados Operativos</SectionTitle>
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3">
            <StatusBadge status="COMPLETED" />
            <StatusBadge status="RETURNED_PARTIAL" />
            <StatusBadge status="RETURNED_TOTAL" />
            <StatusBadge status="ACTIVE" />
            <StatusBadge status="INACTIVE" />
            <Badge variant="purple">Semana W36</Badge>
            <Badge variant="institutional">Venta de Madera y Pallet</Badge>
            <Badge variant="default">Fumigado OIRSA</Badge>
          </CardContent>
        </Card>
      </section>

      {/* 7. Tarjetas KPI */}
      <section className="space-y-4">
        <SectionTitle>6. Tarjetas de Métricas (KPI Cards)</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="Inventario Físico"
            value="24,500"
            unit="pcs"
            icon={Boxes}
            description="5 tipos de polines en patio"
            trend={{ value: '+1,200 hoy', isPositive: true }}
          />
          <KpiCard
            title="Entradas de Madera"
            value="18,340.50"
            unit="pt"
            icon={Truck}
            description="Timbre vs Procesada"
          />
          <KpiCard
            title="Polines Despachados"
            value="3,200"
            unit="pcs"
            icon={Send}
            description="Facturas comerciales F-1002"
          />
          <KpiCard
            title="Métrica en Carga"
            value="---"
            icon={Layers}
            isLoading
          />
        </div>
      </section>

      {/* 8. Tablas Industriales Densas */}
      <section className="space-y-4">
        <SectionTitle>7. Tablas de Datos Densas Industriales</SectionTitle>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lote Producción</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Semana ISO</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
              <TableHead className="text-center">Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-mono font-medium text-primary">
                LT-030926-W36
              </TableCell>
              <TableCell className="font-mono text-xs">2026-09-03</TableCell>
              <TableCell>
                <Badge variant="purple" size="sm">Semana W36</Badge>
              </TableCell>
              <TableCell className="font-medium">Polín 45x48</TableCell>
              <TableCell className="text-right font-mono text-emerald-600 font-bold tabular-nums">
                +1,500 pcs
              </TableCell>
              <TableCell className="text-center">
                <StatusBadge status="COMPLETED" />
              </TableCell>
              <TableCell className="text-right">
                <Button variant="outline" size="sm">Ver Ficha</Button>
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-mono font-medium text-primary">
                LT-020926-W36
              </TableCell>
              <TableCell className="font-mono text-xs">2026-09-02</TableCell>
              <TableCell>
                <Badge variant="purple" size="sm">Semana W36</Badge>
              </TableCell>
              <TableCell className="font-medium">Polín 48x54</TableCell>
              <TableCell className="text-right font-mono text-emerald-600 font-bold tabular-nums">
                +800 pcs
              </TableCell>
              <TableCell className="text-center">
                <StatusBadge status="RETURNED_PARTIAL" />
              </TableCell>
              <TableCell className="text-right">
                <Button variant="outline" size="sm">Ver Ficha</Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </section>

      {/* 9. Alertas y Diálogos */}
      <section className="space-y-4">
        <SectionTitle>8. Alertas y Diálogo Modal Accesible</SectionTitle>
        <div className="space-y-3">
          <Alert variant="info" title="Informativo">
            El sistema de trazabilidad transversal vincula automáticamente el lote de madera con la producción diaria.
          </Alert>
          <Alert variant="success" title="Operación Exitosa">
            El lote LT-030926-01 ha sido registrado satisfactoriamente en el Kardex.
          </Alert>
          <Alert variant="warning" title="Advertencia de Inventario">
            El stock remanente para Polín 120x80 se encuentra por debajo de 500 piezas.
          </Alert>
          <Alert variant="destructive" title="Error de Regla de Negocio (RN-002)">
            No es posible autorizar un despacho que supere las existencias físicas en patio.
          </Alert>
        </div>

        <div className="pt-2">
          <Button onClick={() => setIsModalOpen(true)}>
            Abrir Modal de Demostración (Accessible Dialog)
          </Button>
        </div>
      </section>

      {/* 10. Estados Vacíos y de Error */}
      <section className="space-y-4">
        <SectionTitle>9. Estados de Pantalla (Empty & Error)</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <EmptyState
            title="Sin recepciones registradas"
            description="No se encontraron ingresos de madera en el rango de fechas seleccionado."
            action={<Button variant="outline" size="sm">Limpiar Filtros</Button>}
          />
          <ErrorState
            title="Fallo de comunicación temporal"
            description="El servidor de planta no respondió en el tiempo límite estipulado."
            onRetry={() => alert('Reintento ejecutado')}
          />
        </div>
      </section>

      {/* Modal Dialog */}
      <Dialog
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Confirmar Salida y Despacho de Polines"
        description="Esta acción descontará piezas físicas del Kardex de manera atómica (RN-002)."
        size="md"
      >
        <div className="space-y-4 text-sm text-slate-700">
          <div className="p-3 bg-slate-50 rounded border border-slate-200 space-y-1 font-mono text-xs">
            <p>• Factura Destino: <span className="font-bold text-slate-900">F-1002</span></p>
            <p>• Total a Descontar: <span className="font-bold text-slate-900">1,000 unidades (Polín 45x48)</span></p>
            <p>• Stock Resultante: <span className="font-bold text-emerald-700">1,500 piezas en patio</span></p>
          </div>
          <p className="text-xs text-slate-500">
            Al confirmar, el registro quedará inmutablemente indexado en el Libro Mayor de Inventario.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsModalOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={() => setIsModalOpen(false)}>
            Confirmar Despacho
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
