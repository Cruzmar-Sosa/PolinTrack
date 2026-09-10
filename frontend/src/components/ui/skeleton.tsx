import React from 'react';
import { cn } from '@/lib/utils';

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded bg-slate-200/80', className)}
      {...props}
    />
  );
}

/** Componente esquelético para filas de tabla */
export function SkeletonRow({ columns = 5 }: { columns?: number }) {
  return (
    <tr className="border-b border-slate-100 animate-pulse">
      {Array.from({ length: columns }).map((_, idx) => (
        <td key={idx} className="p-4">
          <div className="h-4 bg-slate-200/70 rounded w-full" />
        </td>
      ))}
    </tr>
  );
}
