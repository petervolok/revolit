'use client';

import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';

interface BusHealth {
  reachable: boolean;
  consumers: number;
  activePriority?: number;
  queueDepth: number;
  error?: string;
}

const POLL_MS = 10_000;

export default function BusClient() {
  const [health, setHealth] = useState<BusHealth | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const res = await fetch('/api/bus-health').catch(() => null);
      if (cancelled) return;
      if (res?.ok) {
        setHealth(await res.json());
        setCheckedAt(new Date());
      }
    };
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-lg font-semibold text-ink">Шина</h1>
      <p className="mb-6 text-[13px] text-ink-muted">
        Состояние очереди операций между приложением и обработчиками данных. Обновляется каждые {POLL_MS / 1000} с.
      </p>

      {!health ? (
        <div className="rounded-xl border border-line p-4 text-sm text-ink-muted">Проверяю…</div>
      ) : (
        <div className="space-y-4">
          <div
            className={
              'flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-[13px] ' +
              (health.reachable ? 'border-line bg-surface-muted text-ink' : 'border-danger/30 bg-danger/5 text-danger')
            }
          >
            <Activity className="h-4 w-4 shrink-0" />
            {health.reachable ? 'Шина отвечает' : `Шина не отвечает${health.error ? `: ${health.error}` : ''}`}
          </div>

          <div className="grid grid-cols-2 gap-4 rounded-xl border border-line p-4 sm:grid-cols-3">
            <Metric label="Потребителей подключено" value={health.consumers} />
            <Metric label="Активный приоритет" value={health.activePriority ?? '—'} />
            <Metric label="В очереди сообщений" value={health.queueDepth} />
          </div>

          {checkedAt && <p className="text-[13px] text-ink-faint">Проверено: {checkedAt.toLocaleTimeString('ru-RU')}</p>}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-[13px] text-ink-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold text-ink">{value}</div>
    </div>
  );
}
