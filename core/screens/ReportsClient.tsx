'use client';

import { useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import EmptyState from '../ui/EmptyState';
import Select from '../ui/Select';
import type { FieldReport, ReportableTemplate } from '../reports/types';

export default function ReportsClient() {
  const [templates, setTemplates] = useState<ReportableTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [templateKey, setTemplateKey] = useState('');
  const [fieldKey, setFieldKey] = useState('');
  const [report, setReport] = useState<FieldReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/reports');
      if (res.ok) {
        const body: ReportableTemplate[] = await res.json();
        setTemplates(body);
        if (body.length > 0) {
          setTemplateKey(body[0].key);
          setFieldKey(body[0].groupableFields[0].key);
        }
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Не удалось загрузить отчёты');
      }
      setLoading(false);
    })();
  }, []);

  const template = templates.find((t) => t.key === templateKey);

  useEffect(() => {
    if (!templateKey || !fieldKey) return;
    setReportLoading(true);
    fetch(`/api/reports/${templateKey}?field=${encodeURIComponent(fieldKey)}`)
      .then((res) => res.json())
      .then((body) => setReport(body))
      .finally(() => setReportLoading(false));
  }, [templateKey, fieldKey]);

  if (loading) return null;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-lg font-semibold text-ink">Отчёты</h1>
      <p className="mb-6 text-[13px] text-ink-muted">
        Распределение записей сущности по значению одного поля. Сводных таблиц и срезов
        по нескольким полям здесь нет — это базовый отчёт, не полноценная аналитика.
      </p>

      {error && <p className="mb-4 text-xs text-danger">{error}</p>}

      {templates.length === 0 && !error && (
        <EmptyState
          icon={BarChart3}
          title="Пока не по чему строить отчёты"
          description="Добавьте в конструкторе сущностей поле типа «список значений» и заполните записи."
        />
      )}

      {templates.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1.5 block text-[13px] font-medium text-ink">Сущность</label>
              <Select
                value={templateKey}
                onChange={(e) => {
                  const t = templates.find((x) => x.key === e.target.value)!;
                  setTemplateKey(t.key);
                  setFieldKey(t.groupableFields[0].key);
                }}
              >
                {templates.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.namePlural} ({t.recordCount})
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex-1">
              <label className="mb-1.5 block text-[13px] font-medium text-ink">Поле</label>
              <Select value={fieldKey} onChange={(e) => setFieldKey(e.target.value)}>
                {template?.groupableFields.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="rounded-xl border border-line p-4">
            {reportLoading && <p className="text-[13px] text-ink-muted">Считаю…</p>}
            {!reportLoading && report && report.total === 0 && (
              <p className="text-[13px] text-ink-muted">В сущности пока нет записей.</p>
            )}
            {!reportLoading && report && report.total > 0 && (
              <div className="flex flex-col gap-2.5">
                {report.buckets.map((b) => (
                  <div key={b.label} className="flex items-center gap-3">
                    <span className="w-32 shrink-0 truncate text-[13px] text-ink">{b.label}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted">
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{ width: `${Math.max((b.count / report.total) * 100, 3)}%` }}
                      />
                    </div>
                    <span className="w-10 shrink-0 text-right text-xs text-ink-muted">{b.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
