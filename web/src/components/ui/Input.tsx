import { type InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/cn';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, prefix, suffix, className, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-text-secondary">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {(icon || prefix) && (
            <span className="absolute left-3 text-text-muted">{icon || prefix}</span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              'w-full rounded-lg border bg-surface px-3 py-2 text-sm text-text',
              'placeholder:text-text-muted',
              'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary',
              'transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              error ? 'border-error' : 'border-border',
              (icon || prefix) && 'pl-10',
              suffix && 'pr-10',
              className,
            )}
            {...props}
          />
          {suffix && (
            <span className="absolute right-3 text-text-muted">{suffix}</span>
          )}
        </div>
        {error && <p className="text-xs text-error">{error}</p>}
      </div>
    );
  },
);

Input.displayName = 'Input';
