'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Pencil, Plus, Trash2, Workflow } from 'lucide-react';
import Button from '../../ui/Button';
import EmptyState from '../../ui/EmptyState';
import Input from '../../ui/Input';
import RowMenu from '../../ui/RowMenu';
import SlideOver from '../../ui/SlideOver';
import type { ProcessTemplateDef } from '../../processes/types';

export default function ProcessesClient() {
  const [templates, setTemplates] = useState<ProcessTemplateDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const [editing, setEditing] = useState<ProcessTemplateDef | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    const res = await fetch('/api/processes');
    setTemplates(res.ok ? await res.json() : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = (t: ProcessTemplateDef) => {
    setEditing(t);
    setName(t.name);
    setFormError('');
    setFormOpen(true);
  };

  const save = async () => {
    setSaving(true);
    setFormError('');
    const url = editing ? `/api/processes/${editing.key}` : '/api/processes';
    const res = await fetch(url, {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setFormError(body.error ?? 'Не удалось сохранить');
      return;
    }

    setFormOpen(false);
    setBanner({ tone: 'ok', text: editing ? 'Процесс переименован' : 'Процесс создан' });
    load();
  };

  const remove = async (t: ProcessTemplateDef) => {
    if (!confirm(`Удалить процесс «${t.name}»?`)) return;
    const res = await fetch(`/api/processes/${t.key}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setBanner({ tone: 'err', text: body.error ?? 'Не удалось удалить' });
      return;
    }
    setBanner({ tone: 'ok', text: 'Процесс удалён' });
    load();
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink">Процессы</h1>
          <p className="mt-1 text-[13px] text-ink-muted">
            Этапы по порядку, ответственные и чек-листы. Дела по процессу — на доске.
          </p>
        </div>
        <Button variant="primary" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Добавить процесс
        </Button>
      </div>

      {banner && (
        <div
          className={
            'mb-4 rounded-lg border px-3.5 py-2.5 text-[13px] ' +
            (banner.tone === 'ok' ? 'border-line bg-surface-muted text-ink' : 'border-danger/30 bg-danger/5 text-danger')
          }
        >
          {banner.text}
        </div>
      )}

      {!loading && templates.length === 0 && (
        <EmptyState
          icon={Workflow}
          title="Процессов пока нет"
          description="Добавьте процесс, затем этапы — и в меню слева появится доска с делами."
          action={
            <Button variant="primary" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Добавить процесс
            </Button>
          }
        />
      )}

      {templates.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-line">
          {templates.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0">
              <div className="min-w-0">
                <Link href={`/settings/processes/${t.key}`} className="text-[13px] font-medium text-ink hover:underline">
                  {t.name}
                </Link>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {t.stages.length} {t.stages.length === 1 ? 'этап' : 'этапов'}
                  {t.hasInstances ? ' · есть дела' : ' · пока пусто'}
                </p>
              </div>
              <RowMenu
                items={[
                  { label: 'Переименовать', icon: <Pencil className="h-4 w-4" />, onClick: () => openEdit(t) },
                  {
                    label: 'Удалить',
                    icon: <Trash2 className="h-4 w-4" />,
                    danger: true,
                    hidden: t.hasInstances,
                    onClick: () => remove(t),
                  },
                ]}
              />
            </div>
          ))}
        </div>
      )}

      <SlideOver
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Переименование процесса' : 'Новый процесс'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Отмена
            </Button>
            <Button variant="primary" loading={saving} onClick={save}>
              Сохранить
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input label="Название" placeholder="Согласование банкета" value={name} onChange={(e) => setName(e.target.value)} />
          {formError && <p className="text-xs text-danger">{formError}</p>}
        </div>
      </SlideOver>
    </div>
  );
}
