'use client';

import { forwardRef, useId } from 'react';
import { cn } from '../utils/cn';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, label, hint, error, leading, trailing, id, ...props },
  ref
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-[13px] font-medium text-ink">
          {label}
        </label>
      )}
      <div className="relative">
        {leading && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">
            {leading}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'h-10 w-full rounded-lg border bg-surface px-3 text-sm text-ink transition-colors',
            'placeholder:text-ink-faint',
            'hover:border-ink-faint/60',
            'focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 focus:ring-offset-0',
            'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-60',
            error ? 'border-danger focus:border-danger focus:ring-danger/25' : 'border-line',
            leading && 'pl-9',
            trailing && 'pr-9',
            className
          )}
          aria-invalid={error ? true : undefined}
          {...props}
        />
        {trailing && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint">{trailing}</span>
        )}
      </div>
      {(error || hint) && (
        <p className={cn('mt-1.5 text-xs', error ? 'text-danger' : 'text-ink-muted')}>{error || hint}</p>
      )}
    </div>
  );
});

export default Input;
