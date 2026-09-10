'use client';

import React, { useState, useMemo } from 'react';
import {
  TraceabilityGraphNode,
  TraceabilityGraphEdge,
  OnDrillDownFn,
  TraceabilityQueryType,
} from './types';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from '@/components/ui';
import {
  Truck,
  Factory,
  ShieldCheck,
  Send,
  RotateCcw,
  ArrowRight,
  GitFork,
  Maximize2,
  Info,
  Layers,
  Search,
} from 'lucide-react';
import { formatDate } from '@/lib/date-formatters';

interface TraceabilityDagGraphProps {
  nodes: TraceabilityGraphNode[];
  edges: TraceabilityGraphEdge[];
  currentQueryValue?: string;
  onDrillDown: OnDrillDownFn;
}

interface NodeStyleConfig {
  label: string;
  badgeBg: string;
  badgeText: string;
  cardBorder: string;
  cardBg: string;
  iconBg: string;
  iconColor: string;
  icon: React.ComponentType<{ className?: string }>;
  queryType?: TraceabilityQueryType;
  extractQueryValue: (node: TraceabilityGraphNode) => string | null;
}

const NODE_CONFIGS: Record<string, NodeStyleConfig> = {
  WOOD_RECEIPT: {
    label: 'Materia Prima',
    badgeBg: 'bg-emerald-100',
    badgeText: 'text-[#3A6A44]',
    cardBorder: 'border-emerald-300 hover:border-[#3A6A44]',
    cardBg: 'bg-emerald-50/40',
    iconBg: 'bg-emerald-100',
    iconColor: 'text-[#3A6A44]',
    icon: Truck,
    queryType: 'LOT_WOOD',
    extractQueryValue: (node) => {
      if (node.data?.lotNumber) return node.data.lotNumber;
      return node.label.replace(/^Madera\s*/i, '').trim() || null;
    },
  },
  DAILY_PRODUCTION: {
    label: 'Producción Diaria',
    badgeBg: 'bg-blue-100',
    badgeText: 'text-[#1D71CB]',
    cardBorder: 'border-blue-300 hover:border-[#1D71CB]',
    cardBg: 'bg-blue-50/40',
    iconBg: 'bg-blue-100',
    iconColor: 'text-[#1D71CB]',
    icon: Factory,
    queryType: 'LOT_PRODUCTION',
    extractQueryValue: (node) => {
      if (node.data?.lot) return node.data.lot;
      return node.label.replace(/^Lote\s*/i, '').trim() || null;
    },
  },
  FUMIGATION: {
    label: 'Tratamiento OIRSA',
    badgeBg: 'bg-purple-100',
    badgeText: 'text-[#7C3AED]',
    cardBorder: 'border-purple-300 hover:border-[#7C3AED]',
    cardBg: 'bg-purple-50/40',
    iconBg: 'bg-purple-100',
    iconColor: 'text-[#7C3AED]',
    icon: ShieldCheck,
    extractQueryValue: () => null,
  },
  DISPATCH: {
    label: 'Despacho Cliente',
    badgeBg: 'bg-amber-100',
    badgeText: 'text-[#D97706]',
    cardBorder: 'border-amber-300 hover:border-[#D97706]',
    cardBg: 'bg-amber-50/40',
    iconBg: 'bg-amber-100',
    iconColor: 'text-[#D97706]',
    icon: Send,
    queryType: 'INVOICE',
    extractQueryValue: (node) => {
      if (node.data?.invoiceNumber) return node.data.invoiceNumber;
      return node.label.replace(/^Factura\s*/i, '').trim() || null;
    },
  },
  RETURN: {
    label: 'Devolución Patio',
    badgeBg: 'bg-rose-100',
    badgeText: 'text-[#059669]',
    cardBorder: 'border-rose-300 hover:border-rose-500',
    cardBg: 'bg-rose-50/40',
    iconBg: 'bg-rose-100',
    iconColor: 'text-rose-600',
    icon: RotateCcw,
    extractQueryValue: () => null,
  },
};

const RELATIONSHIP_CONFIGS: Record<
  string,
  { label: string; stroke: string; badgeClass: string }
> = {
  SUPPLIES: {
    label: 'SUPPLIES',
    stroke: '#3A6A44',
    badgeClass: 'bg-emerald-100 text-[#3A6A44] border-emerald-300',
  },
  TREATED_BY: {
    label: 'TREATED_BY',
    stroke: '#7C3AED',
    badgeClass: 'bg-purple-100 text-[#7C3AED] border-purple-300',
  },
  DISPATCHED_IN: {
    label: 'DISPATCHED_IN',
    stroke: '#D97706',
    badgeClass: 'bg-amber-100 text-[#D97706] border-amber-300',
  },
  RETURNED_FROM: {
    label: 'RETURNED_FROM',
    stroke: '#059669',
    badgeClass: 'bg-rose-100 text-rose-700 border-rose-300',
  },
};

export function TraceabilityDagGraph({
  nodes,
  edges,
  currentQueryValue = '',
  onDrillDown,
}: TraceabilityDagGraphProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('ALL');

  // Categorize nodes by topological rank/level
  const rankedNodes = useMemo(() => {
    const rank1: TraceabilityGraphNode[] = []; // Wood Receipts
    const rank2: TraceabilityGraphNode[] = []; // Daily Production
    const rank3: TraceabilityGraphNode[] = []; // Fumigation & Dispatches
    const rank4: TraceabilityGraphNode[] = []; // Returns
    const other: TraceabilityGraphNode[] = [];

    nodes.forEach((n) => {
      switch (n.type) {
        case 'WOOD_RECEIPT':
          rank1.push(n);
          break;
        case 'DAILY_PRODUCTION':
          rank2.push(n);
          break;
        case 'FUMIGATION':
        case 'DISPATCH':
          rank3.push(n);
          break;
        case 'RETURN':
          rank4.push(n);
          break;
        default:
          other.push(n);
          break;
      }
    });

    return [
      { rank: 1, title: 'Origen / Materia Prima', nodes: rank1, color: 'border-t-emerald-600' },
      { rank: 2, title: 'Fabricación / Aserrío', nodes: rank2, color: 'border-t-blue-600' },
      { rank: 3, title: 'Tratamiento y Salidas', nodes: rank3, color: 'border-t-amber-600' },
      { rank: 4, title: 'Retornos a Patio', nodes: rank4, color: 'border-t-rose-600' },
    ].filter((col) => col.nodes.length > 0);
  }, [nodes]);

  // Find selected node details
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return nodes.find((n) => n.id === selectedNodeId) || null;
  }, [nodes, selectedNodeId]);

  // Edges linked to selected node
  const connectedEdges = useMemo(() => {
    if (!selectedNodeId) return edges;
    return edges.filter((e) => e.source === selectedNodeId || e.target === selectedNodeId);
  }, [edges, selectedNodeId]);

  // Check if a node is currently queried
  const isNodeActive = (node: TraceabilityGraphNode) => {
    if (!currentQueryValue) return false;
    const cleanQuery = currentQueryValue.trim().toLowerCase();
    const config = NODE_CONFIGS[node.type];
    const extracted = config?.extractQueryValue(node)?.toLowerCase();
    const cleanLabel = node.label.toLowerCase();
    return extracted === cleanQuery || cleanLabel.includes(cleanQuery);
  };

  return (
    <Card className="border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <CardHeader className="bg-slate-50/70 border-b border-slate-100 p-4 sm:p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-100 text-[#1D71CB]">
              <GitFork className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>Explorador Visual del Grafo DAG</span>
                <Badge variant="neutral" size="sm">
                  {nodes.length} Nodos
                </Badge>
                <Badge variant="neutral" size="sm">
                  {edges.length} Aristas
                </Badge>
              </CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Topología acíclica de trazabilidad industrial. Haga clic en cualquier nodo para inspeccionar o pivotar la consulta.
              </p>
            </div>
          </div>

          {/* Legend / Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
            <span className="text-[11px] text-slate-400 font-sans mr-1">Leyenda:</span>
            {Object.entries(NODE_CONFIGS).map(([type, cfg]) => {
              const Icon = cfg.icon;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setFilterType((prev) => (prev === type ? 'ALL' : type))}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-all ${
                    filterType === type
                      ? `${cfg.badgeBg} ${cfg.badgeText} ring-2 ring-offset-1 ring-blue-500`
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${cfg.iconColor}`} />
                  <span>{cfg.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 space-y-6">
        {/* TOPOLOGICAL RANKED COLUMNS WITH DIRECTED FLOW */}
        <div className="relative">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {rankedNodes.map((column, colIdx) => (
              <div
                key={column.rank}
                className="flex flex-col rounded-xl bg-slate-50/70 border border-slate-200 p-3 sm:p-4 relative"
              >
                {/* Column Title */}
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-mono font-bold flex items-center justify-center">
                      {column.rank}
                    </span>
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                      {column.title}
                    </h4>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500">
                    {column.nodes.length}
                  </span>
                </div>

                {/* Nodes Stack */}
                <div className="space-y-3 flex-1">
                  {column.nodes.map((node) => {
                    const cfg = NODE_CONFIGS[node.type] || NODE_CONFIGS.WOOD_RECEIPT;
                    const Icon = cfg.icon;
                    const active = isNodeActive(node);
                    const isSelected = selectedNodeId === node.id;
                    const queryVal = cfg.extractQueryValue(node);
                    const isDimmed = filterType !== 'ALL' && filterType !== node.type;

                    return (
                      <div
                        key={node.id}
                        onClick={() => setSelectedNodeId((prev) => (prev === node.id ? null : node.id))}
                        className={`group relative rounded-xl border p-3.5 transition-all cursor-pointer shadow-xs ${
                          cfg.cardBg
                        } ${cfg.cardBorder} ${
                          isSelected
                            ? 'ring-2 ring-blue-600 shadow-md scale-[1.02]'
                            : active
                            ? 'ring-2 ring-amber-500 shadow-md'
                            : 'hover:shadow-sm'
                        } ${isDimmed ? 'opacity-30' : 'opacity-100'}`}
                      >
                        {/* Node Type & Icon Header */}
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`p-1.5 rounded-lg ${cfg.iconBg} ${cfg.iconColor} shrink-0`}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 truncate">
                              {cfg.label}
                            </span>
                          </div>
                          {active && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-amber-500 text-white animate-pulse">
                              Activo
                            </span>
                          )}
                        </div>

                        {/* Node Label / Identifier */}
                        <div className="font-mono font-bold text-xs sm:text-sm text-slate-900 truncate mb-1">
                          {node.label}
                        </div>

                        {/* Node Metadata Snippet */}
                        {node.data && (
                          <div className="text-[11px] text-slate-600 space-y-0.5">
                            {node.data.supplier && (
                              <p className="truncate font-sans text-slate-700">
                                <strong>Prov:</strong> {node.data.supplier}
                              </p>
                            )}
                            {node.data.species && (
                              <p className="text-[10px] text-slate-500">
                                {node.data.species} • {node.data.woodType}
                              </p>
                            )}
                            {node.data.product && (
                              <p className="truncate font-sans font-medium text-blue-900">
                                {node.data.product}
                              </p>
                            )}
                            {node.data.clientCenter && (
                              <p className="truncate font-sans text-slate-800">
                                {node.data.clientCenter}
                              </p>
                            )}
                            {node.data.quantityDispatched !== undefined && (
                              <p className="font-mono text-[10px] text-amber-800 font-semibold tabular-nums">
                                Salida: {node.data.quantityDispatched} pcs
                              </p>
                            )}
                            {node.data.quantityReturned !== undefined && (
                              <p className="font-mono text-[10px] text-emerald-800 font-semibold tabular-nums">
                                Retorno: +{node.data.quantityReturned} pcs
                              </p>
                            )}
                            {node.data.reason && (
                              <p className="text-[10px] text-slate-500 truncate italic">
                                &quot;{node.data.reason}&quot;
                              </p>
                            )}
                            {node.data.fumigationDate && (
                              <p className="text-[10px] text-purple-700 font-mono">
                                {formatDate(node.data.fumigationDate)}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Action / Pivot Trigger */}
                        {cfg.queryType && queryVal && (
                          <div className="mt-3 pt-2.5 border-t border-slate-200/60 flex items-center justify-between">
                            <span className="text-[10px] text-slate-400 font-mono">
                              ID: {queryVal}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (cfg.queryType && queryVal) {
                                  onDrillDown(cfg.queryType, queryVal);
                                }
                              }}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 hover:text-blue-900 hover:underline px-2 py-0.5 rounded hover:bg-blue-50 transition-colors"
                              title={`Rastrear ${queryVal}`}
                            >
                              <Search className="w-3 h-3" />
                              <span>Pivotar</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* SEMANTIC RELATIONSHIPS CONNECTIONS TABLE */}
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-slate-600" />
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                Aristas Relacionales Dirigidas ({connectedEdges.length})
              </h4>
            </div>
            {selectedNodeId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedNodeId(null)}
                className="text-xs text-blue-600 hover:text-blue-800 h-7 px-2"
              >
                Mostrar todas las aristas
              </Button>
            )}
          </div>

          <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto font-mono text-xs">
            {connectedEdges.map((edge) => {
              const relCfg = RELATIONSHIP_CONFIGS[edge.relationship] || {
                label: edge.relationship,
                stroke: '#64748B',
                badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
              };

              const sourceNode = nodes.find((n) => n.id === edge.source);
              const targetNode = nodes.find((n) => n.id === edge.target);

              const sourceCfg = sourceNode ? NODE_CONFIGS[sourceNode.type] : null;
              const targetCfg = targetNode ? NODE_CONFIGS[targetNode.type] : null;

              return (
                <div
                  key={edge.id}
                  className="px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50/80 transition-colors"
                >
                  {/* Directed Flow Representation */}
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {/* Source Node */}
                    <div className="flex items-center gap-1.5 truncate max-w-[40%]">
                      {sourceCfg && (
                        <span className={`w-2 h-2 rounded-full ${sourceCfg.badgeBg}`} />
                      )}
                      <span className="font-semibold text-slate-800 truncate" title={sourceNode?.label}>
                        {sourceNode?.label || edge.source}
                      </span>
                    </div>

                    {/* Arrow & Badge */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${relCfg.badgeClass}`}
                      >
                        {relCfg.label}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    </div>

                    {/* Target Node */}
                    <div className="flex items-center gap-1.5 truncate max-w-[40%]">
                      {targetCfg && (
                        <span className={`w-2 h-2 rounded-full ${targetCfg.badgeBg}`} />
                      )}
                      <span className="font-semibold text-slate-800 truncate" title={targetNode?.label}>
                        {targetNode?.label || edge.target}
                      </span>
                    </div>
                  </div>

                  {/* Actions / Drill-down shortcut */}
                  <div className="flex items-center gap-2 shrink-0">
                    {targetCfg?.queryType && (
                      <button
                        type="button"
                        onClick={() => {
                          if (targetNode) {
                            const val = targetCfg.extractQueryValue(targetNode);
                            if (targetCfg.queryType && val) {
                              onDrillDown(targetCfg.queryType, val);
                            }
                          }
                        }}
                        className="text-[11px] text-blue-600 hover:text-blue-800 font-sans hover:underline"
                      >
                        Ir a destino →
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* SELECTED NODE INSPECTOR PANEL */}
        {selectedNode && (
          <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-200">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 text-[#1D71CB]">
                <Info className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700">
                    Nodo Seleccionado
                  </span>
                  <Badge variant="default" size="sm">
                    {selectedNode.type}
                  </Badge>
                </div>
                <h5 className="font-mono font-black text-sm text-slate-900 mt-0.5">
                  {selectedNode.label}
                </h5>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {NODE_CONFIGS[selectedNode.type]?.queryType && (
                <Button
                  size="sm"
                  onClick={() => {
                    const cfg = NODE_CONFIGS[selectedNode.type];
                    const val = cfg.extractQueryValue(selectedNode);
                    if (cfg.queryType && val) {
                      onDrillDown(cfg.queryType, val);
                    }
                  }}
                  className="bg-[#1D71CB] hover:bg-[#165ba3] text-white flex items-center gap-1.5 text-xs font-semibold"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Rastrear este identificador</span>
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedNodeId(null)}
                className="text-xs text-slate-600"
              >
                Cerrar
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
