'use client';

import React, { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

// ============================================================================
// GESTOR CENTRALIZADO DE BLOQUEO DE SCROLL EN BODY
// Soporta múltiples modales y drawers anidados sin desbloqueos prematuros
// ============================================================================
let openOverlaysCount = 0;

export function lockBodyScroll() {
  if (typeof document === 'undefined') return;
  if (openOverlaysCount === 0) {
    document.body.style.overflow = 'hidden';
  }
  openOverlaysCount++;
}

export function unlockBodyScroll() {
  if (typeof document === 'undefined') return;
  openOverlaysCount = Math.max(0, openOverlaysCount - 1);
  if (openOverlaysCount === 0) {
    document.body.style.overflow = '';
  }
}

// ============================================================================
// TIPOS Y PROPIEDADES DE DIALOG (MODAL CENTRADO)
// ============================================================================
export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  description?: string;
  badge?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  layer?: 'modal' | 'nested'; // 'modal' -> z-50 (Capa 4), 'nested' -> z-[60] (Capa 5)
  headerVariant?: 'default' | 'industrial' | 'clean';
  headerClassName?: string;
  children: React.ReactNode;
  contentClassName?: string;
  footer?: React.ReactNode;
  showCloseButton?: boolean;
  closeOnBackdropClick?: boolean;
  closeOnEscape?: boolean;
}

export function Dialog({
  isOpen,
  onClose,
  title,
  subtitle,
  description,
  badge,
  size = 'md',
  layer = 'modal',
  headerVariant = 'default',
  headerClassName,
  children,
  contentClassName,
  footer,
  showCloseButton = true,
  closeOnBackdropClick = true,
  closeOnEscape = true,
}: DialogProps) {
  const [mounted, setMounted] = useState(false);
  const generatedId = useId();
  const titleId = `${generatedId}-title`;
  const descId = `${generatedId}-desc`;

  // Asegurar montaje en cliente para SSR de Next.js
  useEffect(() => {
    setMounted(true);
  }, []);

  // Manejo de tecla Escape y bloqueo coordinado de scroll
  useEffect(() => {
    if (!isOpen) return;

    lockBodyScroll();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (closeOnEscape && e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      unlockBodyScroll();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, closeOnEscape]);

  if (!mounted || !isOpen) return null;

  const sizeStyles: Record<string, string> = {
    // Compacto / Confirmación (480px–512px)
    sm: 'max-w-md sm:max-w-lg w-[95vw]',
    // Formulario Estándar (576px–672px)
    md: 'max-w-xl sm:max-w-2xl w-[95vw]',
    lg: 'max-w-xl sm:max-w-2xl w-[95vw]',
    // Formulario Complejo / Multi-Lote (768px–1024px)
    xl: 'max-w-3xl sm:max-w-4xl lg:max-w-5xl w-[95vw]',
    '2xl': 'max-w-4xl lg:max-w-5xl w-[95vw]',
    full: 'max-w-[95vw] w-[95vw]',
  };

  const layerZIndex = layer === 'nested' ? 'z-[60]' : 'z-50';

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={description ? descId : undefined}
      className={cn(
        'fixed inset-0 flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-hidden',
        layerZIndex,
      )}
    >
      {/* 1. Backdrop Overlay (cubre el 100% de la pantalla, incluido Header y Sidebar) */}
      <div
        className={cn(
          'fixed inset-0 transition-opacity duration-200',
          layer === 'nested'
            ? 'bg-slate-950/70 backdrop-blur-xs'
            : 'bg-slate-900/60 backdrop-blur-sm',
          'animate-in fade-in',
        )}
        onClick={closeOnBackdropClick ? onClose : undefined}
        aria-hidden="true"
      />

      {/* 2. Dialog Box Container: limitado a max-h-[90vh] para garantizar que el Header nunca se corte */}
      <div
        className={cn(
          'relative w-full bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]',
          'animate-in fade-in-50 zoom-in-95 duration-200',
          sizeStyles[size] || sizeStyles.md,
        )}
      >
        {/* Cabecera del Modal (Zona 1: Padding holgado y separación perimetral) */}
        {(title || subtitle || description || badge || showCloseButton) && (
          <div
            className={cn(
              'px-6 sm:px-8 pt-6 pb-4 flex items-start justify-between flex-shrink-0 border-b border-slate-100 gap-4',
              headerVariant === 'industrial'
                ? 'bg-slate-900 text-white border-slate-800'
                : headerVariant === 'clean'
                  ? 'bg-white border-slate-100'
                  : 'bg-slate-50/70 border-slate-100',
              headerClassName,
            )}
          >
            <div className="space-y-1 pr-2 min-w-0 flex-1">
              {(badge || subtitle) && (
                <div className="flex items-center gap-2 mb-1">
                  {subtitle && (
                    <span
                      className={cn(
                        'text-xs tracking-wider uppercase font-bold',
                        headerVariant === 'industrial' ? 'text-blue-400' : 'text-slate-500',
                      )}
                    >
                      {subtitle}
                    </span>
                  )}
                  {badge}
                </div>
              )}

              {title && (
                <h2
                  id={titleId}
                  className={cn(
                    'text-xl font-bold tracking-tight truncate leading-tight',
                    headerVariant === 'industrial' ? 'text-white' : 'text-slate-900',
                  )}
                >
                  {title}
                </h2>
              )}

              {description && (
                <p
                  id={descId}
                  className={cn(
                    'text-sm mt-1.5 leading-relaxed',
                    headerVariant === 'industrial' ? 'text-slate-400' : 'text-slate-500',
                  )}
                >
                  {description}
                </p>
              )}
            </div>

            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar ventana modal"
                className={cn(
                  'p-2 rounded-lg transition-colors flex-shrink-0 ml-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer min-h-[40px] min-w-[40px] flex items-center justify-center',
                  headerVariant === 'industrial'
                    ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                    : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100',
                )}
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        {/* Cuerpo del Modal con scroll interno independiente (Zona 2: max-h-[75vh]) */}
        <div className={cn('overflow-y-auto flex-1 min-h-0 max-h-[75vh]', contentClassName)}>
          {children}
        </div>

        {/* Pie de Acciones (Zona 3: Fondo contrastado y márgenes cómodos) */}
        {footer && (
          <div className="px-6 sm:px-8 py-4 bg-slate-50/80 border-t border-slate-100 flex flex-col-reverse sm:flex-row justify-end items-center gap-3 flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

// ============================================================================
// DIALOG FOOTER (ACCIONES / BOTONES DEL MODAL)
// ============================================================================
export function DialogFooter({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'px-6 sm:px-8 py-4 bg-slate-50/80 border-t border-slate-100 flex flex-col-reverse sm:flex-row items-center justify-end gap-3 flex-shrink-0',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// ============================================================================
// TIPOS Y COMPONENTE DRAWER (FICHA TÉCNICA / PANEL LATERAL)
// Deslizamiento lateral desde la derecha, con portal a document.body
// ============================================================================
export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  layer?: 'modal' | 'nested';
  children: React.ReactNode;
  footer?: React.ReactNode;
  closeOnEscape?: boolean;
}

export function Drawer({
  isOpen,
  onClose,
  title,
  subtitle,
  badge,
  size = 'md',
  layer = 'modal',
  children,
  footer,
  closeOnEscape = true,
}: DrawerProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    lockBodyScroll();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (closeOnEscape && e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      unlockBodyScroll();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, closeOnEscape]);

  if (!mounted || !isOpen) return null;

  const sizeStyles: Record<string, string> = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-2xl',
  };

  const layerZIndex = layer === 'nested' ? 'z-[60]' : 'z-50';

  const drawerContent = (
    <div
      role="dialog"
      aria-modal="true"
      className={cn('fixed inset-0 overflow-hidden', layerZIndex)}
    >
      {/* 1. Backdrop Overlay */}
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity duration-300 animate-in fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* 2. Slide-in Drawer Container */}
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-6 sm:pl-10">
        <div
          className={cn(
            'w-screen bg-white shadow-2xl border-l border-slate-200 flex flex-col h-full',
            'animate-in slide-in-from-right duration-300',
            sizeStyles[size] || sizeStyles.md,
          )}
        >
          {/* Cabecera del Drawer */}
          <div className="p-6 bg-slate-900 text-white flex items-center justify-between flex-shrink-0">
            <div className="min-w-0 pr-4">
              {(subtitle || badge) && (
                <div className="flex items-center gap-2 mb-1">
                  {subtitle && (
                    <span className="text-[10px] tracking-wider uppercase text-blue-400 font-bold">
                      {subtitle}
                    </span>
                  )}
                  {badge}
                </div>
              )}
              {title && (
                <h3 className="text-xl font-bold font-mono text-white truncate">
                  {title}
                </h3>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar ficha"
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Cuerpo del Drawer con scroll interno */}
          <div className="p-6 space-y-6 flex-1 overflow-y-auto">{children}</div>

          {/* Pie del Drawer */}
          {footer ? (
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex-shrink-0">
              {footer}
            </div>
          ) : (
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex-shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="w-full bg-slate-800 hover:bg-slate-700 text-white font-semibold py-2 rounded-lg text-sm transition"
              >
                Cerrar Ficha
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(drawerContent, document.body);
}
