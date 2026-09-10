import React from 'react';
import { cn } from '@/lib/utils';
import { AlertOctagon, RefreshCw } from 'lucide-react';
import { Button } from './button';

export interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = 'Ocurrió un error al cargar la información',
  description = 'No se pudo comunicar con el servidor de la planta. Verifique su conexión o intente nuevamente.',
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'w-full py-12 px-6 flex flex-col items-center justify-center text-center bg-white rounded-lg border border-red-200 shadow-sm',
        className,
      )}
    >
      <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center text-red-600 mb-3">
        <AlertOctagon className="w-6 h-6" />
      </div>
      <h4 className="text-base font-semibold text-slate-900">{title}</h4>
      <p className="text-xs text-slate-500 max-w-sm mt-1 mb-5 leading-relaxed">
        {description}
      </p>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
        >
          Reintentar operación
        </Button>
      )}
    </div>
  );
}
