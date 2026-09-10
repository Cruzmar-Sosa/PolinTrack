import React, { useId } from 'react';
import { cn } from '@/lib/utils';
import { AlertCircle } from 'lucide-react';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helperText?: string;
  error?: string;
  isRequired?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      className,
      id: explicitId,
      label,
      helperText,
      error,
      isRequired,
      disabled,
      readOnly,
      rows = 3,
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();
    const textareaId = explicitId || generatedId;
    const helperId = `${textareaId}-helper`;
    const errorId = `${textareaId}-error`;

    const describedBy = error ? errorId : helperText ? helperId : undefined;

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label
            htmlFor={textareaId}
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

        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
          disabled={disabled}
          readOnly={readOnly}
          aria-required={isRequired}
          aria-invalid={Boolean(error)}
          aria-readonly={readOnly}
          aria-describedby={describedBy}
          className={cn(
            'w-full rounded-md border text-sm text-slate-900 transition-colors duration-150 outline-none p-3',
            'placeholder:text-slate-400 resize-y',
            error
              ? 'border-red-500 focus:border-red-600 focus:ring-2 focus:ring-red-500/20 bg-red-50/20'
              : 'border-slate-300 hover:border-slate-400 focus:border-[#1D71CB] focus:ring-2 focus:ring-[#1D71CB]/20 bg-white',
            disabled && 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed select-none',
            readOnly && 'bg-slate-100/80 text-slate-700 border-slate-200 cursor-default',
            className,
          )}
          {...props}
        />

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

Textarea.displayName = 'Textarea';
