'use client';

import { useEffect, useState } from 'react';

type MenuItem =
  | { kind: 'card'; nodeId: string; label: string; cardType: string; fields: string[] }
  | { kind: 'report'; nodeId: string; label: string; cardType: string; displayFields: string[] }
  | { kind: 'run'; label: string };

interface AppInfo {
  id: string;
  name: string;
  slug: string;
  menu: MenuItem[];
}

interface CardRow {
  id: string;
  cardType: string;
  data: Record<string, unknown>;
  createdAt: string;
}

export default function PublicAppPage({ params }: { params: { slug: string } }) {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/public/${params.slug}`).then(async (r) => {
      if (!r.ok) {
        setNotFound(true);
        return;
      }
      setInfo(await r.json());
    });
  }, [params.slug]);

  if (notFound) return <p style={{ padding: 24 }}>Процесс не найден.</p>;
  if (!info) return <p style={{ padding: 24 }}>Загрузка…</p>;

  const active = info.menu[activeIndex];

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <aside style={{ width: 240, borderRight: '1px solid #e5e7eb', background: '#f9fafb', padding: 16 }}>
        <h2 style={{ fontSize: 16, marginBottom: 16 }}>{info.name}</h2>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {info.menu.map((item, i) => (
            <button
              key={i}
              onClick={() => setActiveIndex(i)}
              style={{
                textAlign: 'left',
                padding: '8px 10px',
                borderRadius: 6,
                border: 'none',
                background: i === activeIndex ? '#e0e7ff' : 'transparent',
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              {item.kind === 'run' ? '▶ ' : item.kind === 'report' ? '📊 ' : '📇 '}
              {item.label}
            </button>
          ))}
          {info.menu.length === 0 && <p style={{ fontSize: 13, color: '#9ca3af' }}>В процессе пока нет пунктов меню.</p>}
        </nav>
      </aside>

      <main style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        {active?.kind === 'card' && <CardSection slug={params.slug} item={active} />}
        {active?.kind === 'report' && <ReportSection slug={params.slug} item={active} />}
        {active?.kind === 'run' && <RunSection workflowId={info.id} label={active.label} />}
      </main>
    </div>
  );
}

function CardSection({ slug, item }: { slug: string; item: Extract<MenuItem, { kind: 'card' }> }) {
  const [rows, setRows] = useState<CardRow[]>([]);
  const [form, setForm] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const load = () =>
    fetch(`/api/public/${slug}/cards?type=${encodeURIComponent(item.cardType)}`)
      .then((r) => r.json())
      .then(setRows);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.cardType]);

  const submit = async () => {
    setSubmitting(true);
    await fetch(`/api/public/${slug}/cards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardType: item.cardType, data: form }),
    });
    setForm({});
    setSubmitting(false);
    load();
  };

  return (
    <div>
      <h3>{item.label}</h3>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0', alignItems: 'flex-end' }}>
        {(item.fields.length > 0 ? item.fields : ['значение']).map((f) => (
          <label key={f} style={{ fontSize: 12 }}>
            {f}
            <input
              value={form[f] || ''}
              onChange={(e) => setForm({ ...form, [f]: e.target.value })}
              style={{ display: 'block', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 4 }}
            />
          </label>
        ))}
        <button onClick={submit} disabled={submitting} style={{ padding: '8px 14px' }}>
          Создать
        </button>
      </div>

      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            {(item.fields.length > 0 ? item.fields : ['значение']).map((f) => (
              <th key={f} style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: 6, fontSize: 12 }}>
                {f}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {(item.fields.length > 0 ? item.fields : ['значение']).map((f) => (
                <td key={f} style={{ borderBottom: '1px solid #f3f4f6', padding: 6, fontSize: 13 }}>
                  {String(row.data[f] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReportSection({ slug, item }: { slug: string; item: Extract<MenuItem, { kind: 'report' }> }) {
  const [rows, setRows] = useState<CardRow[]>([]);

  useEffect(() => {
    fetch(`/api/public/${slug}/cards?type=${encodeURIComponent(item.cardType)}`)
      .then((r) => r.json())
      .then(setRows);
  }, [item.cardType]);

  const columns = item.displayFields.length > 0 ? item.displayFields : Array.from(new Set(rows.flatMap((r) => Object.keys(r.data))));

  return (
    <div>
      <h3>{item.label}</h3>
      <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 12 }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: 6, fontSize: 12 }}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((c) => (
                <td key={c} style={{ borderBottom: '1px solid #f3f4f6', padding: 6, fontSize: 13 }}>
                  {String(row.data[c] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p style={{ color: '#9ca3af', marginTop: 12 }}>Данных пока нет.</p>}
    </div>
  );
}

function RunSection({ workflowId, label }: { workflowId: string; label: string }) {
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');

  const run = async () => {
    setStatus('running');
    const res = await fetch(`/api/workflows/${workflowId}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: {} }),
    });
    setStatus(res.ok ? 'success' : 'error');
  };

  return (
    <div>
      <button onClick={run} disabled={status === 'running'} style={{ padding: '10px 20px', fontSize: 14 }}>
        {label}
      </button>
      {status === 'success' && <p style={{ color: '#16a34a', marginTop: 12 }}>Процесс выполнен успешно.</p>}
      {status === 'error' && <p style={{ color: '#dc2626', marginTop: 12 }}>Произошла ошибка при выполнении.</p>}
    </div>
  );
}
