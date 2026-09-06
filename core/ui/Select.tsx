'use client';

import { forwardRef, useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../utils/cn';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, label, hint, error, id, children, ...props },
  ref
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={selectId} className="mb-1.5 block text-[13px] font-medium text-ink">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          className={cn(
            'h-10 w-full appearance-none rounded-lg border bg-surface px-3 pr-9 text-sm text-ink transition-colors',
            'hover:border-ink-faint/60',
            'focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 focus:ring-offset-0',
            'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-60',
            error ? 'border-danger focus:border-danger focus:ring-danger/25' : 'border-line',
            className
          )}
          aria-invalid={error ? true : undefined}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
      </div>
      {(error || hint) && (
        <p className={cn('mt-1.5 text-xs', error ? 'text-danger' : 'text-ink-muted')}>{error || hint}</p>
      )}
    </div>
  );
});

export default Select;
