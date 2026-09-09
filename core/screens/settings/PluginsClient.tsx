'use client';

import { useEffect, useState } from 'react';
import { Puzzle } from 'lucide-react';
import Badge from '../../ui/Badge';
import Button from '../../ui/Button';

interface Plugin {
  key: string;
  name: string;
  description: string;
  version: string;
  installed: boolean;
  enabled: boolean;
}

export default function PluginsClient() {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    const res = await fetch('/api/plugins');
    setPlugins(res.ok ? await res.json() : []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const toggle = async (p: Plugin) => {
    setBusyKey(p.key);
    setError('');
    const res = await fetch('/api/plugins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moduleKey: p.key, enabled: !p.enabled }),
    });
    setBusyKey(null);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'Не удалось изменить состояние плагина');
      return;
    }
    load();
  };

  if (loading) return null;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-lg font-semibold text-ink">Плагины</h1>
      <p className="mb-6 text-[13px] text-ink-muted">
        Витрина модулей платформы. Отдельного сайта-магазина ещё нет — перечисленные плагины уже
        входят в эту сборку, кнопка включает или выключает уже установленное, а не скачивает новый код.
      </p>

      {error && <p className="mb-4 text-xs text-danger">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-line">
        {plugins.map((p) => (
          <div key={p.key} className="flex items-center justify-between gap-4 border-b border-line px-4 py-3.5 last:border-b-0">
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-ink-faint">
                <Puzzle className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-[13px] font-medium text-ink">{p.name}</p>
                  <Badge tone={p.enabled ? 'success' : 'neutral'}>{p.enabled ? 'включён' : 'выключен'}</Badge>
                  {!p.installed && <Badge tone="warning">не установлен</Badge>}
                </div>
                <p className="mt-0.5 text-xs text-ink-muted">{p.description}</p>
                <p className="mt-0.5 text-2xs text-ink-faint">версия {p.version}</p>
              </div>
            </div>
            <Button
              variant={p.enabled ? 'secondary' : 'primary'}
              size="sm"
              loading={busyKey === p.key}
              disabled={!p.installed}
              onClick={() => toggle(p)}
            >
              {p.enabled ? 'Выключить' : 'Включить'}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
