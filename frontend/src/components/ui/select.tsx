import React, { useId } from 'react';
import { cn } from '@/lib/utils';
import { AlertCircle, ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  helperText?: string;
  error?: string;
  isRequired?: boolean;
  options?: SelectOption[];
  placeholder?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      className,
      id: explicitId,
      label,
      helperText,
      error,
      isRequired,
      options = [],
      placeholder,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();
    const selectId = explicitId || generatedId;
    const helperId = `${selectId}-helper`;
    const errorId = `${selectId}-error`;

    const describedBy = error ? errorId : helperText ? helperId : undefined;

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-xs font-semibold text-slate-700 tracking-wide"
          >
            {label}
            {isRequired && (
              <>
                <span className="text-red-500 ml-1" aria-hidden="true">*</span>
                <span className="sr-only">(obligatorio)</span>
              </>
            )}
          </label>
        )}

        <div className="relative flex items-center rounded-md">
          <select
            ref={ref}
            id={selectId}
            disabled={disabled}
            aria-required={isRequired}
            aria-invalid={Boolean(error)}
            aria-describedby={describedBy}
            className={cn(
              'w-full h-9 rounded-md border text-sm text-slate-900 appearance-none transition-colors duration-150 outline-none pl-3 pr-9',
              error
                ? 'border-red-500 focus:border-red-600 focus:ring-2 focus:ring-red-500/20 bg-red-50/20'
                : 'border-slate-300 hover:border-slate-400 focus:border-[#1D71CB] focus:ring-2 focus:ring-[#1D71CB]/20 bg-white',
              disabled && 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed select-none',
              className,
            )}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.length > 0
              ? options.map((opt) => (
                  <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                    {opt.label}
                  </option>
                ))
              : children}
          </select>

          <div className="absolute right-3 flex items-center pointer-events-none text-slate-400">
            <ChevronDown className="w-4 h-4" />
          </div>
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

Select.displayName = 'Select';
