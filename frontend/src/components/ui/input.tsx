import React, { useId } from 'react';
import { cn } from '@/lib/utils';
import { AlertCircle, Lock } from 'lucide-react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  isRequired?: boolean;
  leftAddon?: React.ReactNode;
  rightAddon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      id: explicitId,
      label,
      helperText,
      error,
      isRequired,
      leftAddon,
      rightAddon,
      disabled,
      readOnly,
      type = 'text',
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();
    const inputId = explicitId || generatedId;
    const helperId = `${inputId}-helper`;
    const errorId = `${inputId}-error`;

    const describedBy = error ? errorId : helperText ? helperId : undefined;

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-semibold text-slate-700 tracking-wide"
          >
            {label}
            {isRequired && (
              <>
                <span className="text-red-500 ml-1" aria-hidden="true">*</span>
                <span className="sr-only">(obligatorio)</span>
              </>
            )}
            {readOnly && (
              <span className="inline-flex items-center gap-1 text-[10px] font-normal text-slate-400 ml-2">
                <Lock className="w-3 h-3 text-slate-400" />
                Solo lectura
              </span>
            )}
          </label>
        )}

        <div className="relative flex items-center rounded-md">
          {leftAddon && (
            <div className="absolute left-3 flex items-center pointer-events-none text-slate-400 text-sm">
              {leftAddon}
            </div>
          )}

          <input
            ref={ref}
            id={inputId}
            type={type}
            disabled={disabled}
            readOnly={readOnly}
            aria-required={isRequired}
            aria-invalid={Boolean(error)}
            aria-readonly={readOnly}
            aria-describedby={describedBy}
            className={cn(
              'w-full h-9 rounded-md border text-sm text-slate-900 transition-colors duration-150 outline-none px-3',
              'placeholder:text-slate-400',
              leftAddon ? 'pl-9' : 'pl-3',
              rightAddon ? 'pr-9' : 'pr-3',
              // Estado Normal vs Error
              error
                ? 'border-red-500 focus:border-red-600 focus:ring-2 focus:ring-red-500/20 bg-red-50/20'
                : 'border-slate-300 hover:border-slate-400 focus:border-[#1D71CB] focus:ring-2 focus:ring-[#1D71CB]/20 bg-white',
              // Estado Deshabilitado
              disabled && 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed select-none',
              // Estado Solo Lectura (RN industrial de lotes generados por sistema)
              readOnly && 'bg-slate-100/80 text-slate-700 border-slate-200 cursor-default font-mono',
              className,
            )}
            {...props}
          />

          {rightAddon && (
            <div className="absolute right-3 flex items-center pointer-events-none text-slate-400 text-xs font-mono">
              {rightAddon}
            </div>
          )}
        </div>

        {error && (
          <p
            id={errorId}
            role="alert"
            className="text-xs font-medium text-red-600 flex items-center gap-1 mt-1 animate-in fade-in-50 duration-150"
          >
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{error}</span>
          </p>
        )}

        {!error && helperText && (
          <p id={helperId} className="text-xs text-slate-500 mt-1">
            {helperText}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';
