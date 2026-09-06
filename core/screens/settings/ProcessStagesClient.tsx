'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowLeft, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import Button from '../../ui/Button';
import EmptyState from '../../ui/EmptyState';
import Input from '../../ui/Input';
import RowMenu from '../../ui/RowMenu';
import SlideOver from '../../ui/SlideOver';
import type { ProcessStageDef, ProcessTemplateDef } from '../../processes/types';

interface StageForm {
  name: string;
  responsible: string;
  regulation: string;
  checklistText: string;
}

const EMPTY_FORM: StageForm = { name: '', responsible: '', regulation: '', checklistText: '' };

export default function ProcessStagesClient({ templateKey }: { templateKey: string }) {
  const [template, setTemplate] = useState<ProcessTemplateDef | null>(null);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const [editingStage, setEditingStage] = useState<ProcessStageDef | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<StageForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/processes/${templateKey}`);
    setTemplate(res.ok ? await res.json() : null);
    setLoading(false);
  }, [templateKey]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return null;
  if (!template) {
    return <EmptyState icon={Trash2} title="Процесс не найден" description="Возможно, он был удалён." />;
  }

  const locked = template.hasInstances;

  const openAdd = () => {
    setEditingStage(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = (s: ProcessStageDef) => {
    setEditingStage(s);
    setForm({
      name: s.name,
      responsible: s.responsible ?? '',
      regulation: s.regulation ?? '',
      checklistText: s.checklist.map((c) => c.label).join('\n'),
    });
    setFormError('');
    setFormOpen(true);
  };

  const saveStage = async () => {
    if (!form.name.trim()) {
      setFormError('Укажите название этапа');
      return;
    }
    setSaving(true);
    setFormError('');

    const checklist = form.checklistText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((label) => ({ label }));

    const url = editingStage
      ? `/api/processes/${templateKey}/stages/${editingStage.id}`
      : `/api/processes/${templateKey}/stages`;
    const res = await fetch(url, {
      method: editingStage ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: form.name, responsible: form.responsible, regulation: form.regulation, checklist }),
    });
    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setFormError(body.error ?? 'Не удалось сохранить');
      return;
    }

    setFormOpen(false);
    load();
  };

  const removeStage = async (s: ProcessStageDef) => {
    if (!confirm(`Удалить этап «${s.name}»?`)) return;
    const res = await fetch(`/api/processes/${templateKey}/stages/${s.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setBanner({ tone: 'err', text: body.error ?? 'Не удалось удалить' });
      return;
    }
    load();
  };

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= template.stages.length) return;
    const ids = template.stages.map((s) => s.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    const res = await fetch(`/api/processes/${templateKey}/stages/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stageIds: ids }),
    });
    if (res.ok) load();
  };

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/settings/processes" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-ink-muted hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> К списку процессов
      </Link>

      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink">{template.name}</h1>
          <p className="mt-1 text-[13px] text-ink-muted">
            {locked
              ? 'По процессу уже есть дела — добавлять, удалять и переставлять этапы больше нельзя. Название, ответственного и чек-лист менять можно.'
              : 'Порядок этапов можно менять свободно, пока по процессу нет ни одного дела.'}
          </p>
        </div>
        {!locked && (
          <Button variant="primary" onClick={openAdd}>
            <Plus className="h-4 w-4" /> Добавить этап
          </Button>
        )}
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

      {template.stages.length === 0 && (
        <EmptyState
          icon={Plus}
          title="Этапов пока нет"
          description="Добавьте хотя бы один этап, чтобы можно было заводить дела."
          action={
            <Button variant="primary" onClick={openAdd}>
              <Plus className="h-4 w-4" /> Добавить этап
            </Button>
          }
        />
      )}

      {template.stages.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-line">
          {template.stages.map((s, i) => (
            <div key={s.id} className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0">
              <div className="min-w-0">
                <span className="text-[13px] font-medium text-ink">
                  {i + 1}. {s.name}
                </span>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {s.responsible ? `Ответственный: ${s.responsible} · ` : ''}
                  {s.checklist.length} {s.checklist.length === 1 ? 'пункт' : 'пунктов'} чек-листа
                </p>
              </div>
              <div className="flex items-center gap-1">
                {!locked && (
                  <>
                    <button
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-surface-muted hover:text-ink disabled:pointer-events-none disabled:opacity-30"
                      aria-label="Выше"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => move(i, 1)}
                      disabled={i === template.stages.length - 1}
                      className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-surface-muted hover:text-ink disabled:pointer-events-none disabled:opacity-30"
                      aria-label="Ниже"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                  </>
                )}
                <RowMenu
                  items={[
                    { label: 'Изменить', icon: <Pencil className="h-4 w-4" />, onClick: () => openEdit(s) },
                    { label: 'Удалить', icon: <Trash2 className="h-4 w-4" />, danger: true, hidden: locked, onClick: () => removeStage(s) },
                  ]}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <SlideOver
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingStage ? 'Изменение этапа' : 'Новый этап'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Отмена
            </Button>
            <Button variant="primary" loading={saving} onClick={saveStage}>
              Сохранить
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Название этапа"
            placeholder="Согласование меню"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <Input
            label="Ответственный"
            hint="Кто отвечает за этот этап — текстом, необязательно"
            placeholder="Менеджер по банкетам"
            value={form.responsible}
            onChange={(e) => setForm((f) => ({ ...f, responsible: e.target.value }))}
          />
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-ink">Регламент</label>
            <textarea
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
              rows={3}
              placeholder="Что нужно сделать на этом этапе"
              value={form.regulation}
              onChange={(e) => setForm((f) => ({ ...f, regulation: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-ink">Чек-лист</label>
            <textarea
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
              rows={4}
              placeholder={'Каждый пункт с новой строки'}
              value={form.checklistText}
              onChange={(e) => setForm((f) => ({ ...f, checklistText: e.target.value }))}
            />
          </div>
          {formError && <p className="text-xs text-danger">{formError}</p>}
        </div>
      </SlideOver>
    </div>
  );
}
