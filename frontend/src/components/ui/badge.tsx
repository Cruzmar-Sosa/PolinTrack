import React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?:
    | 'default'
    | 'success'
    | 'warning'
    | 'destructive'
    | 'neutral'
    | 'institutional'
    | 'purple';
  size?: 'sm' | 'md';
}

export function Badge({
  className,
  variant = 'default',
  size = 'md',
  children,
  ...props
}: BadgeProps) {
  const variantStyles = {
    default: 'bg-blue-50 text-blue-700 border-blue-200',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    destructive: 'bg-rose-50 text-rose-700 border-rose-200',
    neutral: 'bg-slate-100 text-slate-700 border-slate-200',
    institutional: 'bg-emerald-900/10 text-[#3A6A44] border-emerald-900/20',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
  };

  const sizeStyles = {
    sm: 'text-[10px] px-1.5 py-0.5 font-medium',
    md: 'text-xs px-2.5 py-1 font-semibold',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border font-mono tracking-wide leading-none select-none',
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

/** Componente auxiliar para estados operativos tipificados de PolinTrack */
export function StatusBadge({ status }: { status: string }) {
  switch (status?.toUpperCase()) {
    case 'COMPLETED':
      return <Badge variant="success">COMPLETADO</Badge>;
    case 'RETURNED_PARTIAL':
      return <Badge variant="warning">DEV. PARCIAL</Badge>;
    case 'RETURNED_TOTAL':
      return <Badge variant="destructive">DEV. TOTAL</Badge>;
    case 'ACTIVE':
      return <Badge variant="success">ACTIVO</Badge>;
    case 'INACTIVE':
      return <Badge variant="neutral">INACTIVO</Badge>;
    case 'PENDING':
      return <Badge variant="warning">PENDIENTE</Badge>;
    default:
      return <Badge variant="neutral">{status}</Badge>;
  }
}
