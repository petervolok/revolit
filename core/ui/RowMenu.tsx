'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '../utils/cn';

export interface RowMenuItem {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  danger?: boolean;
  hidden?: boolean;
}

const GAP = 4;
const EDGE = 8;

export default function RowMenu({ items }: { items: RowMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  // Меню рисуется поверх страницы, поэтому его положение считаем от кнопки.
  // Если снизу не помещается — разворачиваем вверх.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current || !menuRef.current) return;

    const button = buttonRef.current.getBoundingClientRect();
    const menu = menuRef.current.getBoundingClientRect();

    let top = button.bottom + GAP;
    if (top + menu.height > window.innerHeight - EDGE) {
      top = Math.max(EDGE, button.top - menu.height - GAP);
    }

    const left = Math.max(EDGE, Math.min(button.right - menu.width, window.innerWidth - menu.width - EDGE));

    setPos({ top, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    // При прокрутке или изменении размера окна привязка к кнопке теряется — закрываем
    const close = () => setOpen(false);

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const visible = items.filter((i) => !i.hidden);
  if (visible.length === 0) return null;

  const toggle = () => {
    setPos(null);
    setOpen((v) => !v);
  };

  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggle}
        aria-label="Действия"
        aria-expanded={open}
        className={cn(
          'rounded-md p-1.5 text-ink-faint transition-colors hover:bg-surface-muted hover:text-ink',
          open && 'bg-surface-muted text-ink'
        )}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {mounted &&
        open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: pos?.top ?? 0, left: pos?.left ?? 0 }}
            className={cn(
              'fixed z-[60] w-52 overflow-hidden rounded-lg border border-line bg-surface-raised py-1 shadow-popover',
              // до вычисления положения меню не показываем, чтобы не мигало в углу
              pos ? 'opacity-100' : 'pointer-events-none opacity-0'
            )}
          >
            {visible.map((item) => (
              <button
                key={item.label}
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors',
                  item.danger
                    ? 'text-danger hover:bg-danger/10'
                    : 'text-ink-muted hover:bg-surface-muted hover:text-ink'
                )}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
