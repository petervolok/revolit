import { cn } from '../utils/cn';

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

const tones: Record<Tone, string> = {
  neutral: 'bg-surface-muted text-ink-muted border-line',
  brand: 'bg-brand-soft text-brand border-brand/20',
  success: 'bg-success/10 text-success border-success/20',
  warning: 'bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400',
  danger: 'bg-danger/10 text-danger border-danger/20',
};

export default function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-1.5 py-0.5 text-2xs font-medium',
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
