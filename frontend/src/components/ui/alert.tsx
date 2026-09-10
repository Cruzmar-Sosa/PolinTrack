import React from 'react';
import { cn } from '@/lib/utils';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'info' | 'success' | 'warning' | 'destructive';
  title?: string;
}

export function Alert({
  className,
  variant = 'info',
  title,
  children,
  ...props
}: AlertProps) {
  const configs = {
    info: {
      icon: Info,
      classes: 'bg-blue-50/80 border-blue-200 text-blue-900',
      iconClass: 'text-blue-600',
    },
    success: {
      icon: CheckCircle2,
      classes: 'bg-emerald-50/80 border-emerald-200 text-emerald-900',
      iconClass: 'text-emerald-600',
    },
    warning: {
      icon: AlertTriangle,
      classes: 'bg-amber-50/80 border-amber-200 text-amber-900',
      iconClass: 'text-amber-600',
    },
    destructive: {
      icon: AlertCircle,
      classes: 'bg-red-50/80 border-red-200 text-red-900',
      iconClass: 'text-red-600',
    },
  };

  const config = configs[variant];
  const Icon = config.icon;

  return (
    <div
      role="alert"
      className={cn(
        'w-full p-4 rounded-lg border flex gap-3 text-sm transition-colors',
        config.classes,
        className,
      )}
      {...props}
    >
      <Icon className={cn('w-5 h-5 flex-shrink-0 mt-0.5', config.iconClass)} />
      <div className="space-y-0.5 flex-1 min-w-0">
        {title && <p className="font-semibold text-sm leading-tight">{title}</p>}
        <div className="text-xs leading-relaxed opacity-90">{children}</div>
      </div>
    </div>
  );
}
