'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { NAVIGATION_CLUSTERS } from './nav-items';
import { cn } from '@/lib/utils';
import { ShieldAlert } from 'lucide-react';

interface SidebarProps {
  isCollapsed: boolean;
}

export function Sidebar({ isCollapsed }: SidebarProps) {
  const pathname = usePathname();
  const { user } = useAuth();

  return (
    <aside
      className={cn(
        'hidden lg:flex flex-col flex-shrink-0 bg-[#0D1B36] text-slate-200 border-r border-slate-800/80 transition-all duration-300 ease-in-out z-30 h-screen sticky top-0',
        isCollapsed ? 'w-[72px]' : 'w-[260px]',
      )}
    >
      {/* 1. Header de Marca PolinTrack */}
      <div className="h-16 flex items-center px-4 border-b border-slate-800/80 bg-[#0B162C]">
        <Link href="/dashboard" className="flex items-center gap-3 overflow-hidden group">
          <div className="relative w-8 h-8 flex-shrink-0 rounded-md overflow-hidden bg-white/10 p-1 flex items-center justify-center">
            <Image
              src="/images/polintrack_logo.png"
              alt="PolinTrack Logo"
              width={32}
              height={32}
              className="object-contain"
              priority
            />
          </div>
          {!isCollapsed && (
            <div className="flex flex-col leading-tight min-w-0">
              <span className="font-bold text-base text-white tracking-wide truncate group-hover:text-primary transition-colors">
                PolinTrack
              </span>
              <span className="text-[10px] text-slate-400 font-mono tracking-wider">
                v1.0.0 Core
              </span>
            </div>
          )}
        </Link>
      </div>

      {/* 2. Navegación en 5 Clusters con RBAC */}
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-6 scrollbar-thin scrollbar-thumb-slate-700">
        {NAVIGATION_CLUSTERS.map((cluster) => {
          // Filtrar elementos según el rol del usuario (exclusivo ADMIN para ajustes y usuarios)
          const visibleItems = cluster.items.filter((item) => {
            if (item.adminOnly) {
              return user?.role === 'ADMIN';
            }
            return true;
          });

          if (visibleItems.length === 0) {
            return null;
          }

          return (
            <div key={cluster.title} className="space-y-1">
              {!isCollapsed && (
                <h3 className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400/90 font-mono">
                  {cluster.title}
                </h3>
              )}
              <div className="space-y-1 pt-1">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    pathname === item.href ||
                    (item.href !== '/dashboard' && pathname.startsWith(item.href));

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={isCollapsed ? item.name : undefined}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all duration-150 group',
                        isActive
                          ? 'bg-[#1D71CB] text-white shadow-sm font-semibold'
                          : 'text-slate-300 hover:text-white hover:bg-slate-800/60',
                        isCollapsed && 'justify-center px-0 py-2.5',
                      )}
                    >
                      <Icon
                        className={cn(
                          'w-4 h-4 flex-shrink-0 transition-transform duration-150 group-hover:scale-105',
                          isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200',
                        )}
                      />
                      {!isCollapsed && (
                        <span className="truncate flex-1">{item.name}</span>
                      )}
                      {!isCollapsed && item.adminOnly && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono font-medium">
                          ADMIN
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. Footer Institucional (Dual Brand - Venta de Madera y Pallet) */}
      <div className="p-3 border-t border-slate-800/80 bg-[#0B162C]">
        {isCollapsed ? (
          <div
            title="Venta de Madera y Pallet — Planta Industrial"
            className="w-10 h-10 mx-auto rounded-md bg-white/10 p-1 flex items-center justify-center overflow-hidden"
          >
            <Image
              src="/images/empresa_logo.jpg"
              alt="Logo Institucional Empresa"
              width={32}
              height={32}
              className="object-contain"
            />
          </div>
        ) : (
          <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-md bg-slate-900/60 border border-slate-800/80">
            <div className="relative w-8 h-8 flex-shrink-0 rounded bg-white p-0.5 flex items-center justify-center overflow-hidden">
              <Image
                src="/images/empresa_logo.jpg"
                alt="Logo Institucional Empresa"
                width={30}
                height={30}
                className="object-contain"
              />
            </div>
            <div className="flex flex-col min-w-0 leading-tight">
              <span className="text-xs font-semibold text-white truncate">
                Venta de Madera y Pallet
              </span>
              <span className="text-[10px] text-slate-400 truncate">
                Planta Industrial
              </span>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
