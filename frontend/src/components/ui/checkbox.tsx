import React, { useId } from 'react';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  description?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, id: explicitId, label, description, disabled, checked, ...props }, ref) => {
    const generatedId = useId();
    const checkboxId = explicitId || generatedId;

    return (
      <div className="flex items-start space-x-2.5 select-none">
        <div className="relative flex items-center h-5">
          <input
            ref={ref}
            id={checkboxId}
            type="checkbox"
            checked={checked}
            disabled={disabled}
            className="peer sr-only"
            {...props}
          />
          <label
            htmlFor={checkboxId}
            className={cn(
              'w-4 h-4 rounded border flex items-center justify-center transition-colors duration-150 cursor-pointer',
              'border-slate-300 bg-white hover:border-slate-400',
              'peer-checked:bg-[#1D71CB] peer-checked:border-[#1D71CB] text-white',
              'peer-focus-visible:ring-2 peer-focus-visible:ring-[#1D71CB] peer-focus-visible:ring-offset-2',
              disabled && 'bg-slate-100 border-slate-200 cursor-not-allowed peer-checked:bg-slate-300 peer-checked:border-slate-300',
              className,
            )}
          >
            <Check className="w-3 h-3 stroke-[2.5] opacity-0 peer-checked:opacity-100 transition-opacity" />
          </label>
        </div>

        {(label || description) && (
          <div className="text-xs leading-tight">
            {label && (
              <label
                htmlFor={checkboxId}
                className={cn(
                  'font-medium text-slate-700 cursor-pointer',
                  disabled && 'text-slate-400 cursor-not-allowed',
                )}
              >
                {label}
              </label>
            )}
            {description && (
              <p className="text-[11px] text-slate-500 mt-0.5">{description}</p>
            )}
          </div>
        )}
      </div>
    );
  },
);

Checkbox.displayName = 'Checkbox';
