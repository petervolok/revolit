'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '../utils/cn';

interface SlideOverProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  width?: 'sm' | 'md' | 'lg';
  footer?: React.ReactNode;
  children: React.ReactNode;
}

const widths = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
};

export default function SlideOver({
  open,
  onClose,
  title,
  subtitle,
  width = 'md',
  footer,
  children,
}: SlideOverProps) {
  // Esc закрывает панель; пока панель открыта — фон не прокручивается
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  return (
    <div className={cn('fixed inset-0 z-50', !open && 'pointer-events-none')} aria-hidden={!open}>
      <div
        onClick={onClose}
        className={cn(
          'absolute inset-0 bg-black/20 backdrop-blur-[2px] transition-opacity duration-300',
          open ? 'opacity-100' : 'opacity-0'
        )}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'absolute right-0 top-0 flex h-full w-full flex-col border-l border-line bg-surface shadow-panel',
          'transition-transform duration-300 ease-smooth',
          widths[width],
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 truncate text-[13px] text-ink-muted">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="-mr-1 rounded-md p-1.5 text-ink-faint transition-colors hover:bg-surface-muted hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-5">{children}</div>

        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-line bg-surface-muted/60 px-5 py-3.5">
            {footer}
          </footer>
        )}
      </aside>
    </div>
  );
}
