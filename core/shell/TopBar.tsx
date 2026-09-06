'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, LogOut, Moon, Search, Settings, Sun, UserRound } from 'lucide-react';
import { cn } from '../utils/cn';

interface TopBarProps {
  title: string;
  user: { name: string; email: string; role: string };
}

export default function TopBar({ title, user }: TopBarProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const logout = async () => {
    setLoggingOut(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
  };

  const initials = user.name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line bg-surface px-5">
      <h1 className="text-[15px] font-semibold text-ink">{title}</h1>

      <div className="relative ml-auto hidden w-full max-w-xs md:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <input
          placeholder="Поиск"
          className={cn(
            'h-9 w-full rounded-lg border border-line bg-surface-muted pl-9 pr-3 text-sm text-ink',
            'placeholder:text-ink-faint',
            'transition-colors hover:border-ink-faint/50',
            'focus:border-brand focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand/25'
          )}
        />
      </div>

      <div className="flex items-center gap-1 md:ml-0 ml-auto">
        <button
          onClick={toggleTheme}
          title={dark ? 'Светлая тема' : 'Тёмная тема'}
          className="rounded-md p-2 text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
        >
          {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
        </button>

        <Link
          href="/settings"
          title="Настройки программы"
          className="rounded-md p-2 text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
        >
          <Settings className="h-[18px] w-[18px]" />
        </Link>

        <div className="mx-1 h-5 w-px bg-line" />

        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 transition-colors hover:bg-surface-muted"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-soft text-[11px] font-semibold text-brand">
              {initials}
            </span>
            <span className="hidden text-left sm:block">
              <span className="block text-[13px] font-medium leading-tight text-ink">{user.name}</span>
              <span className="block text-2xs leading-tight text-ink-muted">{user.role}</span>
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-ink-faint" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full z-50 mt-1.5 w-56 overflow-hidden rounded-xl border border-line bg-surface-raised py-1 shadow-popover">
              <div className="border-b border-line px-3 py-2.5">
                <p className="truncate text-[13px] font-medium text-ink">{user.name}</p>
                <p className="truncate text-xs text-ink-muted">{user.email}</p>
                <p className="mt-1 truncate text-2xs text-ink-faint">{user.role}</p>
              </div>
              <Link
                href="/profile"
                className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
              >
                <UserRound className="h-4 w-4" />
                Мой профиль
              </Link>
              <Link
                href="/settings"
                className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
              >
                <Settings className="h-4 w-4" />
                Настройки
              </Link>
              <div className="my-1 h-px bg-line" />
              <button
                onClick={logout}
                disabled={loggingOut}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-danger transition-colors hover:bg-danger/10 disabled:opacity-60"
              >
                <LogOut className="h-4 w-4" />
                {loggingOut ? 'Выходим…' : 'Выйти'}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
