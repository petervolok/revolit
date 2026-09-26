'use client';

import { useMemo, useState } from 'react';
import { LabProvider, useLab } from './context';
import './cubes';
import { MANIFESTS } from './manifests';
import { PROJECT } from './project';
import { RenderNode } from './registry';
import { validateCatalog, validateProject } from './validate';

function Diagnostics() {
  const issues = useMemo(() => [...validateProject(PROJECT), ...validateCatalog()], []);
  const errors = issues.filter((i) => i.level === 'error');
  const implemented = Object.values(MANIFESTS).filter((m) => m.implemented).length;
  return (
    <details className="rounded-xl border border-line bg-surface p-3 text-sm" open={errors.length > 0}>
      <summary className="cursor-pointer font-medium text-ink">
        Проверка сцепления: {errors.length} ошибок, {issues.length - errors.length} замечаний · кубиков реализовано {implemented} из {Object.keys(MANIFESTS).length}
      </summary>
      <ul className="mt-2 space-y-1">
        {issues.map((i, n) => (
          <li key={n} className={i.level === 'error' ? 'text-danger' : 'text-ink-muted'}>
            <span className="font-medium">{i.level === 'error' ? 'ОШИБКА' : 'замечание'}</span> · {i.where} — {i.message}
          </li>
        ))}
        {issues.length === 0 && <li className="text-success">Всё сцеплено по правилам манифестов</li>}
      </ul>
    </details>
  );
}

function Toasts() {
  const { toasts } = useLab();
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-4 right-4 z-40 max-w-xs space-y-1 rounded-xl border border-line bg-surface p-3 text-xs text-ink-muted shadow-lg">
      {toasts.map((t, i) => <div key={i} className={i === 0 ? 'text-ink' : ''}>{t}</div>)}
    </div>
  );
}

function Screens() {
  const [key, setKey] = useState(PROJECT.screens[0].key);
  const screen = PROJECT.screens.find((s) => s.key === key) ?? PROJECT.screens[0];
  return (
    <>
      <nav className="flex flex-wrap gap-1 border-b border-line">
        {PROJECT.screens.map((s) => (
          <button
            key={s.key}
            onClick={() => setKey(s.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${s.key === key ? 'border-brand text-brand' : 'border-transparent text-ink-muted hover:text-ink'}`}
          >
            {s.name}
          </button>
        ))}
      </nav>
      <div className="space-y-4">
        {screen.layout.map((node, i) => <RenderNode key={`${screen.key}-${i}`} node={node} />)}
      </div>
    </>
  );
}

export default function LabApp() {
  return (
    <LabProvider>
      <div className="min-h-screen bg-surface-muted">
        <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
          <header>
            <div className="text-xs uppercase tracking-wide text-ink-faint">Тестовая сборка из кубиков (лаборатория)</div>
            <h1 className="text-xl font-semibold text-ink">{PROJECT.name}</h1>
            <p className="mt-1 max-w-3xl text-sm text-ink-muted">{PROJECT.domain}</p>
          </header>
          <Diagnostics />
          <Screens />
        </div>
      </div>
      <Toasts />
    </LabProvider>
  );
}
