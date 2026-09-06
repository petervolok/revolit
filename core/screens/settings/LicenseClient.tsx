'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, XCircle } from 'lucide-react';
import Button from '../../ui/Button';
import type { LicenseStatus } from '../../licensing/types';

const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

export default function LicenseClient() {
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    const res = await fetch('/api/license');
    setStatus(res.ok ? await res.json() : null);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const activate = async () => {
    if (!key.trim()) return;
    setSaving(true);
    setError('');
    setNotice('');
    const res = await fetch('/api/license', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });
    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'Не удалось активировать ключ');
      return;
    }

    setKey('');
    setNotice('Лицензия активирована');
    load();
  };

  const deactivate = async () => {
    if (!confirm('Убрать лицензионный ключ? Платные модули станут недоступны.')) return;
    setSaving(true);
    await fetch('/api/license', { method: 'DELETE' });
    setSaving(false);
    setNotice('Ключ убран');
    load();
  };

  if (loading) return null;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-lg font-semibold text-ink">Лицензия</h1>
      <p className="mb-6 text-[13px] text-ink-muted">
        Ключ открывает платные модули. Без него ядро и бесплатные разделы работают полностью.
      </p>

      {notice && (
        <div className="mb-4 rounded-lg border border-line bg-surface-muted px-3.5 py-2.5 text-[13px] text-ink">{notice}</div>
      )}

      <div className="mb-6 rounded-xl border border-line p-4">
        {status?.active ? (
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
              <CheckCircle2 className="h-4.5 w-4.5" />
            </span>
            <div>
              <p className="text-[13px] font-medium text-ink">Лицензия активна</p>
              <p className="mt-1 text-xs text-ink-muted">
                Выдана: {status.payload?.issuedTo} ·{' '}
                {status.payload?.expiresAt
                  ? `действует до ${dateFormat.format(new Date(status.payload.expiresAt))}`
                  : 'бессрочно'}
              </p>
              {status.payload && status.payload.features.length > 0 && (
                <p className="mt-1 text-xs text-ink-muted">Открытые модули: {status.payload.features.join(', ')}</p>
              )}
              <Button variant="ghost" size="sm" className="mt-3" loading={saving} onClick={deactivate}>
                Убрать ключ
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-ink-faint">
              {status?.reason === 'invalid' || status?.reason === 'expired' ? (
                <XCircle className="h-4.5 w-4.5" />
              ) : (
                <KeyRound className="h-4.5 w-4.5" />
              )}
            </span>
            <div>
              <p className="text-[13px] font-medium text-ink">
                {status?.reason === 'expired'
                  ? 'Срок действия ключа истёк'
                  : status?.reason === 'invalid'
                    ? 'Ключ повреждён или не подходит'
                    : 'Лицензия не активирована'}
              </p>
              <p className="mt-1 text-xs text-ink-muted">Платные модули недоступны. Ядро работает полностью.</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-line p-4">
        <label className="text-[13px] font-medium text-ink">Активировать ключ</label>
        <textarea
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
          rows={3}
          placeholder="Вставьте лицензионный ключ целиком"
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        {error && <p className="text-xs text-danger">{error}</p>}
        <div>
          <Button variant="primary" loading={saving} onClick={activate}>
            Активировать
          </Button>
        </div>
      </div>
    </div>
  );
}
