'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Laptop, Lock, LogOut } from 'lucide-react';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Input from '../ui/Input';

interface SessionRow {
  id: string;
  ip: string | null;
  userAgent: string | null;
  lastSeenAt: string;
  createdAt: string;
  isCurrent: boolean;
}

const dateFormat = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/** Короткое человекопонятное описание браузера из строки user-agent */
function describeDevice(ua: string | null): string {
  if (!ua) return 'Неизвестное устройство';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Браузер';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Mac OS/.test(ua)
      ? 'macOS'
      : /Android/.test(ua)
        ? 'Android'
        : /iPhone|iPad/.test(ua)
          ? 'iOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return os ? `${browser} · ${os}` : browser;
}

export default function ProfilePage() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const loadSessions = useCallback(async () => {
    const res = await fetch('/api/profile/sessions');
    setSessions(res.ok ? await res.json() : []);
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setDone(false);

    if (next !== confirm) {
      setError('Новые пароли не совпадают');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/profile/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Не удалось изменить пароль');
        return;
      }
      setCurrent('');
      setNext('');
      setConfirm('');
      setDone(true);
    } finally {
      setSaving(false);
    }
  };

  const revokeOthers = async () => {
    await fetch('/api/profile/sessions', { method: 'DELETE' });
    loadSessions();
  };

  const otherCount = sessions.filter((s) => !s.isCurrent).length;

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-7">
        <h2 className="text-xl font-semibold tracking-tight text-ink">Мой профиль</h2>
        <p className="mt-1 text-sm text-ink-muted">Пароль и безопасность учётной записи</p>
      </div>

      <section className="mb-6 rounded-xl border border-line bg-surface p-5">
        <div className="mb-4 flex items-center gap-2.5">
          <Lock className="h-4 w-4 text-ink-muted" />
          <h3 className="text-sm font-semibold text-ink">Смена пароля</h3>
        </div>

        <form onSubmit={changePassword} className="max-w-sm space-y-4">
          {error && (
            <div className="rounded-lg border border-danger/25 bg-danger/[0.07] px-3 py-2.5 text-[13px] text-danger">
              {error}
            </div>
          )}
          {done && (
            <div className="flex items-center gap-2 rounded-lg border border-success/25 bg-success/[0.07] px-3 py-2.5 text-[13px] text-success">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Пароль изменён
            </div>
          )}

          <Input
            label="Текущий пароль"
            type="password"
            autoComplete="current-password"
            required
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
          <Input
            label="Новый пароль"
            type="password"
            autoComplete="new-password"
            required
            value={next}
            onChange={(e) => setNext(e.target.value)}
            hint="Не короче 10 символов, буквы и цифры"
          />
          <Input
            label="Повторите новый пароль"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />

          <Button type="submit" variant="primary" loading={saving}>
            Изменить пароль
          </Button>
        </form>
      </section>

      <section className="rounded-xl border border-line bg-surface p-5">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Laptop className="h-4 w-4 text-ink-muted" />
            <h3 className="text-sm font-semibold text-ink">Активные сессии</h3>
          </div>
          {otherCount > 0 && (
            <Button variant="secondary" size="sm" onClick={revokeOthers}>
              <LogOut className="h-3.5 w-3.5" />
              Завершить остальные
            </Button>
          )}
        </div>

        <div className="divide-y divide-line">
          {sessions.map((session) => (
            <div key={session.id} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-[13px] font-medium text-ink">
                    {describeDevice(session.userAgent)}
                  </p>
                  {session.isCurrent && <Badge tone="success">текущая</Badge>}
                </div>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {session.ip ?? 'адрес неизвестен'} · вход {dateFormat.format(new Date(session.createdAt))}
                </p>
              </div>
              <span className="shrink-0 text-xs text-ink-faint">
                активна {dateFormat.format(new Date(session.lastSeenAt))}
              </span>
            </div>
          ))}
          {sessions.length === 0 && (
            <p className="py-3 text-[13px] text-ink-faint">Активных сессий не найдено</p>
          )}
        </div>
      </section>
    </div>
  );
}
