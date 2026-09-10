import {
  Boxes,
  Building2,
  FileSpreadsheet,
  GitMerge,
  Hammer,
  LayoutDashboard,
  RotateCcw,
  Send,
  ShieldCheck,
  Sliders,
  Tags,
  Truck,
  Users,
} from 'lucide-react';

export interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

export interface NavCluster {
  title: string;
  items: NavItem[];
}

export const NAVIGATION_CLUSTERS: NavCluster[] = [
  {
    title: 'Principal',
    items: [
      {
        name: 'Dashboard',
        href: '/dashboard',
        icon: LayoutDashboard,
      },
    ],
  },
  {
    title: 'Operaciones de Planta',
    items: [
      {
        name: 'Ingreso de Madera',
        href: '/operations/wood-receipts',
        icon: Truck,
      },
      {
        name: 'Producción Diaria',
        href: '/operations/daily-production',
        icon: Hammer,
      },
      {
        name: 'Fumigación OIRSA',
        href: '/operations/fumigation',
        icon: ShieldCheck,
      },
      {
        name: 'Despachos',
        href: '/operations/dispatches',
        icon: Send,
      },
      {
        name: 'Devoluciones',
        href: '/operations/returns',
        icon: RotateCcw,
      },
    ],
  },
  {
    title: 'Control de Existencias',
    items: [
      {
        name: 'Inventario & Kardex',
        href: '/inventory',
        icon: Boxes,
      },
      {
        name: 'Ajustes de Stock',
        href: '/inventory/adjustments',
        icon: Sliders,
        adminOnly: true, // Visible exclusivamente para rol ADMIN (D-028)
      },
      {
        name: 'Trazabilidad',
        href: '/traceability',
        icon: GitMerge,
      },
    ],
  },
  {
    title: 'Reportes',
    items: [
      {
        name: 'Reportes de Planta',
        href: '/reports',
        icon: FileSpreadsheet,
      },
    ],
  },
  {
    title: 'Configuración',
    items: [
      {
        name: 'Proveedores',
        href: '/settings/suppliers',
        icon: Building2,
      },
      {
        name: 'Catálogos Fijos',
        href: '/settings/catalogs',
        icon: Tags,
      },
      {
        name: 'Usuarios & Roles',
        href: '/settings/users',
        icon: Users,
        adminOnly: true, // Visible exclusivamente para rol ADMIN (D-003)
      },
    ],
  },
];
