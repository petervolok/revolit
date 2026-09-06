'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface WorkflowSummary {
  id: string;
  name: string;
  slug: string;
  updatedAt: string;
}

export default function BuildListPage() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const load = () => fetch('/api/workflows').then((r) => r.json()).then(setWorkflows);

  useEffect(() => {
    load();
  }, []);

  const createWorkflow = async () => {
    if (!name.trim()) return;
    setCreating(true);
    const res = await fetch('/api/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const workflow = await res.json();
    setCreating(false);
    router.push(`/build/${workflow.id}`);
  };

  return (
    <main style={{ maxWidth: 640, margin: '60px auto', fontFamily: 'system-ui, sans-serif', padding: '0 16px' }}>
      <h1 style={{ fontSize: 22 }}>Revolit — конструктор бизнес-процессов</h1>

      <div style={{ display: 'flex', gap: 8, margin: '20px 0' }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Название нового процесса"
          style={{ flex: 1, padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6 }}
        />
        <button onClick={createWorkflow} disabled={creating} style={{ padding: '8px 16px' }}>
          Создать
        </button>
      </div>

      <h3 style={{ fontSize: 14, color: '#6b7280' }}>Существующие процессы</h3>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {workflows.map((w) => (
          <li key={w.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 8 }}>
            <a href={`/build/${w.id}`} style={{ fontWeight: 600, textDecoration: 'none', color: '#111827' }}>
              {w.name}
            </a>
            <div style={{ fontSize: 12, color: '#6b7280' }}>
              /{w.slug} · <a href={`/app/${w.slug}`} target="_blank" rel="noreferrer">открыть приложение</a>
            </div>
          </li>
        ))}
        {workflows.length === 0 && <p style={{ color: '#9ca3af' }}>Пока нет ни одного процесса.</p>}
      </ul>
    </main>
  );
}
