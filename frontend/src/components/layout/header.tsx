'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Breadcrumbs } from './breadcrumbs';
import {
  ChevronDown,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Shield,
  User as UserIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { Dialog } from '@/components/ui/dialog';

interface HeaderProps {
  onToggleMobileDrawer: () => void;
  isSidebarCollapsed: boolean;
  onToggleSidebarCollapse: () => void;
}

export function Header({
  onToggleMobileDrawer,
  isSidebarCollapsed,
  onToggleSidebarCollapse,
}: HeaderProps) {
  const { user, logout } = useAuth();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Cerrar menú al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Iniciales del usuario
  const initials = user?.fullName
    ? user.fullName
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'U';

  // Configuración del badge de rol
  const getRoleBadge = (role?: string) => {
    switch (role) {
      case 'ADMIN':
        return {
          label: 'ADMINISTRADOR',
          classes: 'bg-indigo-50 text-indigo-700 border-indigo-200',
        };
      case 'CONTABILIDAD':
        return {
          label: 'CONTABILIDAD',
          classes: 'bg-blue-50 text-blue-700 border-blue-200',
        };
      case 'CONSULTA':
      default:
        return {
          label: 'MODO CONSULTA',
          classes: 'bg-slate-100 text-slate-700 border-slate-200',
        };
    }
  };

  const roleConfig = getRoleBadge(user?.role);

  return (
    <>
      <header className="h-16 bg-white border-b border-slate-200/80 sticky top-0 z-20 flex items-center justify-between px-4 lg:px-6 shadow-sm">
        {/* Lado Izquierdo: Botones de Alternancia + Breadcrumbs */}
        <div className="flex items-center gap-3 md:gap-4 min-w-0">
          {/* Botón móvil (abre Drawer en <1024px) */}
          <button
            onClick={onToggleMobileDrawer}
            aria-label="Abrir menú de navegación"
            className="lg:hidden p-2 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Botón desktop (colapsa Sidebar en >=1024px) */}
          <button
            onClick={onToggleSidebarCollapse}
            aria-label={isSidebarCollapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
            className="hidden lg:flex p-2 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            title={isSidebarCollapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
          >
            {isSidebarCollapsed ? (
              <PanelLeftOpen className="w-5 h-5" />
            ) : (
              <PanelLeftClose className="w-5 h-5" />
            )}
          </button>

          {/* Separador vertical sutil */}
          <div className="hidden sm:block w-[1px] h-6 bg-slate-200" />

          {/* Migas de Pan Dinámicas */}
          <Breadcrumbs />
        </div>

        {/* Lado Derecho: Badge de Rol + Badge Institucional + Menú de Usuario */}
        <div className="flex items-center gap-3 md:gap-4 flex-shrink-0">
          {/* 1. Badge del Rol Activo */}
          <div
            className={cn(
              'hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold font-mono border tracking-wide',
              roleConfig.classes,
            )}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>[{roleConfig.label}]</span>
          </div>

          {/* 2. Badge Institucional (Venta de Madera y Pallet) */}
          <div className="hidden xl:flex items-center gap-2 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-md">
            <div className="w-5 h-5 rounded overflow-hidden bg-white flex items-center justify-center">
              <Image
                src="/images/empresa_logo.jpg"
                alt="Empresa"
                width={20}
                height={20}
                className="object-contain"
              />
            </div>
            <span className="text-xs font-medium text-slate-600">
              Planta Principal
            </span>
          </div>

          <div className="w-[1px] h-6 bg-slate-200 hidden sm:block" />

          {/* 3. Menú Desplegable de Usuario */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              aria-expanded={isUserMenuOpen}
              aria-haspopup="true"
              className="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-slate-100 transition-colors group"
            >
              {/* Avatar con Iniciales */}
              <div className="w-8 h-8 rounded-full bg-[#0D1B36] text-white flex items-center justify-center font-semibold text-xs shadow-inner">
                {initials}
              </div>

              {/* Nombre y flecha (oculto en pantallas muy pequeñas) */}
              <div className="hidden md:flex flex-col text-left leading-tight">
                <span className="text-xs font-semibold text-slate-800 truncate max-w-[130px]">
                  {user?.fullName || 'Usuario'}
                </span>
                <span className="text-[10px] text-slate-500 font-mono capitalize">
                  {user?.role?.toLowerCase() || 'consulta'}
                </span>
              </div>

              <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700 transition-transform duration-150" />
            </button>

            {/* Menú Flotante */}
            {isUserMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-lg bg-white shadow-xl border border-slate-200 py-1 text-sm text-slate-700 z-50 animate-in fade-in-50 slide-in-from-top-2 duration-150">
                <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/50">
                  <p className="text-xs font-semibold text-slate-900 truncate">
                    {user?.fullName || 'Usuario PolinTrack'}
                  </p>
                  <p className="text-[11px] text-slate-500 truncate">{user?.email}</p>
                  <div className="mt-1.5 sm:hidden">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium border',
                        roleConfig.classes,
                      )}
                    >
                      [{roleConfig.label}]
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    setIsProfileModalOpen(true);
                  }}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-xs hover:bg-slate-50 text-slate-700 transition-colors text-left"
                >
                  <UserIcon className="w-4 h-4 text-slate-400" />
                  <span>Mi Perfil de Usuario</span>
                </button>

                <div className="border-t border-slate-100 my-1" />

                <button
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-rose-600 hover:bg-rose-50 transition-colors text-left font-medium"
                >
                  <LogOut className="w-4 h-4 text-rose-500" />
                  <span>Cerrar Sesión</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Modal de Perfil de Usuario */}
      <Dialog
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        size="sm"
        headerVariant="default"
        title="Perfil de Usuario"
        footer={
          <div className="flex justify-end w-full">
            <button
              onClick={() => setIsProfileModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
            >
              Entendido
            </button>
          </div>
        }
      >
        <div className="p-6 space-y-4 text-sm">
          <div>
            <span className="text-xs font-medium text-slate-500 block">Nombre Completo</span>
            <span className="font-semibold text-slate-800">{user?.fullName || 'N/A'}</span>
          </div>
          <div>
            <span className="text-xs font-medium text-slate-500 block">Correo Electrónico</span>
            <span className="font-mono text-slate-800 text-xs">{user?.email || 'N/A'}</span>
          </div>
          <div>
            <span className="text-xs font-medium text-slate-500 block">Rol en el Sistema</span>
            <span className={cn('inline-flex px-2 py-0.5 mt-1 rounded text-xs font-mono font-semibold border', roleConfig.classes)}>
              {roleConfig.label}
            </span>
          </div>
          <div className="pt-2 border-t border-slate-100">
            <span className="text-[11px] text-slate-400">
              Identificador Único: <span className="font-mono text-slate-600">{user?.id}</span>
            </span>
          </div>
        </div>
      </Dialog>
    </>
  );
}
