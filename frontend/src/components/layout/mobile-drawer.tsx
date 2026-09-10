'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { NAVIGATION_CLUSTERS } from './nav-items';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import { lockBodyScroll, unlockBodyScroll } from '@/components/ui/dialog';

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MobileDrawer({ isOpen, onClose }: MobileDrawerProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Cerrar al pulsar Escape y coordinar scroll lock
  useEffect(() => {
    if (!isOpen) return;

    lockBodyScroll();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      unlockBodyScroll();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 lg:hidden flex">
      {/* 1. Backdrop Overlay */}
      <div
        className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm transition-opacity duration-300 animate-in fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* 2. Drawer Panel */}
      <div className="relative w-[85%] max-w-[320px] bg-[#0D1B36] text-slate-200 h-full flex flex-col shadow-2xl z-10 border-r border-slate-800 animate-in slide-in-from-left duration-300">
        {/* Cabecera del Drawer */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800 bg-[#0B162C]">
          <Link
            href="/dashboard"
            onClick={onClose}
            className="flex items-center gap-3 overflow-hidden"
          >
            <div className="relative w-8 h-8 rounded-md overflow-hidden bg-white/10 p-1 flex items-center justify-center">
              <Image
                src="/images/polintrack.png"
                alt="PolinTrack Logo"
                width={32}
                height={32}
                className="object-contain"
              />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="font-bold text-base text-white">PolinTrack</span>
              <span className="text-[10px] text-slate-400 font-mono">v1.0.0 Core</span>
            </div>
          </Link>
          <button
            onClick={onClose}
            aria-label="Cerrar menú de navegación"
            className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Lista de Navegación */}
        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
          {NAVIGATION_CLUSTERS.map((cluster) => {
            const visibleItems = cluster.items.filter((item) => {
              if (item.adminOnly) {
                return user?.role === 'ADMIN';
              }
              return true;
            });

            if (visibleItems.length === 0) return null;

            return (
              <div key={cluster.title} className="space-y-1">
                <h3 className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400/90 font-mono">
                  {cluster.title}
                </h3>
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
                        onClick={onClose}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-150',
                          isActive
                            ? 'bg-[#1D71CB] text-white shadow-sm font-semibold'
                            : 'text-slate-300 hover:text-white hover:bg-slate-800/60',
                        )}
                      >
                        <Icon className="w-4 h-4 flex-shrink-0" />
                        <span className="truncate flex-1">{item.name}</span>
                        {item.adminOnly && (
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

        {/* Footer Institucional (Venta de Madera y Pallet) */}
        <div className="p-3 border-t border-slate-800 bg-[#0B162C]">
          <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-md bg-slate-900/60 border border-slate-800">
            <div className="relative w-8 h-8 rounded bg-white p-0.5 flex items-center justify-center overflow-hidden">
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
        </div>
      </div>
    </div>,
    document.body
  );
}
