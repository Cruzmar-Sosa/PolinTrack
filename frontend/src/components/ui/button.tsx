import React from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'destructive' | 'ghost' | 'institutional';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'default',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    const variantStyles = {
      default:
        'bg-[#1D71CB] text-white hover:bg-[#165EA8] active:bg-[#144B84] shadow-sm focus-visible:ring-[#1D71CB]',
      secondary:
        'bg-slate-100 text-slate-800 hover:bg-slate-200 active:bg-slate-300 border border-slate-200 focus-visible:ring-slate-400',
      outline:
        'border border-slate-300 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 focus-visible:ring-[#1D71CB]',
      destructive:
        'bg-[#DC2626] text-white hover:bg-[#B91C1C] active:bg-[#991B1B] shadow-sm focus-visible:ring-[#DC2626]',
      ghost:
        'hover:bg-slate-100 text-slate-600 hover:text-slate-900 active:bg-slate-200 focus-visible:ring-slate-400',
      institutional:
        'bg-[#3A6A44] text-white hover:bg-[#2E5436] active:bg-[#24422B] shadow-sm focus-visible:ring-[#3A6A44]',
    };

    const sizeStyles = {
      sm: 'h-8 px-3 text-xs gap-1.5 rounded-md',
      md: 'h-9 px-4 text-sm gap-2 rounded-md',
      lg: 'h-10 px-6 text-base gap-2.5 rounded-md',
      icon: 'h-9 w-9 p-0 rounded-md justify-center',
    };

    const isEffectivelyDisabled = disabled || isLoading;

    return (
      <button
        ref={ref}
        disabled={isEffectivelyDisabled}
        aria-busy={isLoading}
        className={cn(
          'inline-flex items-center justify-center font-medium transition-all duration-150 select-none outline-none',
          'focus-visible:ring-2 focus-visible:ring-offset-2',
          'active:scale-[0.98]',
          'disabled:opacity-50 disabled:pointer-events-none disabled:shadow-none',
          variantStyles[variant],
          sizeStyles[size],
          className,
        )}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
        ) : (
          leftIcon && <span className="flex-shrink-0">{leftIcon}</span>
        )}
        {children && <span>{children}</span>}
        {!isLoading && rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
      </button>
    );
  },
);

Button.displayName = 'Button';
