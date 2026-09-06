'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw, Sparkles, XCircle } from 'lucide-react';
import Button from '../../ui/Button';
import type { UpdateCheckResult } from '../../updates/types';

const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

export default function UpdatesClient() {
  const [currentVersion, setCurrentVersion] = useState('');
  const [manifest, setManifest] = useState('');
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/updates')
      .then((res) => (res.ok ? res.json() : { currentVersion: '' }))
      .then((body) => {
        setCurrentVersion(body.currentVersion);
        setLoading(false);
      });
  }, []);

  const check = async () => {
    if (!manifest.trim()) return;
    setChecking(true);
    setError('');
    setResult(null);

    const res = await fetch('/api/updates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manifest }),
    });
    setChecking(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'Не удалось проверить');
      return;
    }

    setResult(await res.json());
  };

  if (loading) return null;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-lg font-semibold text-ink">Обновления</h1>
      <p className="mb-6 text-[13px] text-ink-muted">Текущая версия: {currentVersion}</p>

      <div className="flex flex-col gap-3 rounded-xl border border-line p-4">
        <label className="text-[13px] font-medium text-ink">Проверить релиз</label>
        <p className="text-xs text-ink-muted">
          Вставьте релиз, который прислали вам, — система проверит подпись и подскажет, новее ли он
          установленной версии. Само обновление выполняется отдельным инструментом на сервере.
        </p>
        <textarea
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
          rows={3}
          placeholder="Вставьте присланный релиз целиком"
          value={manifest}
          onChange={(e) => setManifest(e.target.value)}
        />
        {error && <p className="text-xs text-danger">{error}</p>}
        <div>
          <Button variant="primary" loading={checking} onClick={check}>
            <RefreshCw className="h-4 w-4" /> Проверить
          </Button>
        </div>
      </div>

      {result && (
        <div className="mt-4 rounded-xl border border-line p-4">
          {result.reason === 'invalid' && (
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-ink-faint">
                <XCircle className="h-4.5 w-4.5" />
              </span>
              <p className="text-[13px] font-medium text-ink">Релиз повреждён или подписан не тем ключом</p>
            </div>
          )}

          {result.reason === 'not-newer' && (
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-ink-faint">
                <CheckCircle2 className="h-4.5 w-4.5" />
              </span>
              <p className="text-[13px] font-medium text-ink">У вас уже установлена эта версия или новее</p>
            </div>
          )}

          {result.reason === 'valid' && result.manifest && (
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                <Sparkles className="h-4.5 w-4.5" />
              </span>
              <div>
                <p className="text-[13px] font-medium text-ink">Доступна версия {result.manifest.version}</p>
                <p className="mt-1 text-xs text-ink-muted">
                  Опубликована {dateFormat.format(new Date(result.manifest.publishedAt))}
                </p>
                <p className="mt-2 whitespace-pre-line text-[13px] text-ink">{result.manifest.notes}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
