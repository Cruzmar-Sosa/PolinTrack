import React from 'react';
import { cn } from '@/lib/utils';
import { Card } from './card';

export interface KpiCardProps {
  title: string;
  value: string | number;
  unit?: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
  trend?: {
    value: string;
    isPositive?: boolean;
  };
  isLoading?: boolean;
  className?: string;
}

export function KpiCard({
  title,
  value,
  unit,
  icon: Icon,
  description,
  trend,
  isLoading = false,
  className,
}: KpiCardProps) {
  return (
    <Card className={cn('p-5 transition-shadow hover:shadow-md', className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider font-mono truncate">
          {title}
        </span>
        <div className="w-9 h-9 rounded-md bg-[#1D71CB]/10 text-[#1D71CB] flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5" />
        </div>
      </div>

      <div className="mt-3">
        {isLoading ? (
          <div className="space-y-2">
            <div className="h-8 w-24 bg-slate-200 animate-pulse rounded" />
            <div className="h-3 w-32 bg-slate-100 animate-pulse rounded" />
          </div>
        ) : (
          <>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-bold font-mono tracking-tight text-slate-900 tabular-nums">
                {value}
              </span>
              {unit && (
                <span className="text-xs font-semibold text-slate-500 font-mono">
                  {unit}
                </span>
              )}
            </div>

            {(description || trend) && (
              <div className="mt-2 flex items-center gap-2 text-xs">
                {trend && (
                  <span
                    className={cn(
                      'font-medium font-mono',
                      trend.isPositive ? 'text-emerald-600' : 'text-slate-500',
                    )}
                  >
                    {trend.value}
                  </span>
                )}
                {description && (
                  <span className="text-slate-500 truncate">{description}</span>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
