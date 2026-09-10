import React from 'react';
import { cn } from '@/lib/utils';

export interface HeadingProps extends React.HTMLAttributes<HTMLHeadingElement> {
  children: React.ReactNode;
  className?: string;
}

/** PageTitle (H1): Encabezado principal de pantalla (24px/32px semibold) */
export function PageTitle({ children, className, ...props }: HeadingProps) {
  return (
    <h1
      className={cn('text-2xl font-semibold tracking-tight text-slate-900', className)}
      {...props}
    >
      {children}
    </h1>
  );
}

/** SectionTitle (H2): Título de bloque, formulario o tabla (18px/28px medium) */
export function SectionTitle({ children, className, ...props }: HeadingProps) {
  return (
    <h2
      className={cn('text-lg font-medium text-slate-900', className)}
      {...props}
    >
      {children}
    </h2>
  );
}

/** Subheading (H3): Encabezado auxiliar o subtítulo de bloque (14px/20px semibold uppercase mono) */
export function Subheading({ children, className, ...props }: HeadingProps) {
  return (
    <h3
      className={cn('text-sm font-semibold uppercase tracking-wider text-slate-500 font-mono', className)}
      {...props}
    >
      {children}
    </h3>
  );
}

/** MutedText: Texto auxiliar o leyenda bajo inputs/fechas (12px regular) */
export function MutedText({ children, className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn('text-xs text-slate-500 leading-relaxed', className)}
      {...props}
    >
      {children}
    </p>
  );
}

/** DataMono: Representación numérica tabular para Lotes, Facturas y Cantidades */
export function DataMono({ children, className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn('font-mono text-sm tabular-nums font-medium', className)}
      {...props}
    >
      {children}
    </span>
  );
}
