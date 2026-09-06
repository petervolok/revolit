'use client';

import { Check } from 'lucide-react';
import { cn } from '../utils/cn';

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}

export default function Checkbox({ checked, onChange, label, hint, disabled }: CheckboxProps) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-2 transition-colors',
        disabled ? 'cursor-not-allowed opacity-60' : 'hover:bg-surface-muted'
      )}
    >
      <span className="relative mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span
          className={cn(
            'flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border transition-colors',
            'peer-focus-visible:ring-2 peer-focus-visible:ring-brand/50 peer-focus-visible:ring-offset-1',
            checked ? 'border-brand bg-brand text-white' : 'border-line bg-surface'
          )}
        >
          {checked && <Check className="h-3 w-3" strokeWidth={3} />}
        </span>
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] leading-tight text-ink">{label}</span>
        {hint && <span className="mt-0.5 block text-xs leading-snug text-ink-muted">{hint}</span>}
      </span>
    </label>
  );
}
