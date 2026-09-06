'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowLeft, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import Button from '../../ui/Button';
import Checkbox from '../../ui/Checkbox';
import EmptyState from '../../ui/EmptyState';
import Input from '../../ui/Input';
import RowMenu from '../../ui/RowMenu';
import Select from '../../ui/Select';
import SlideOver from '../../ui/SlideOver';
import { FIELD_TYPE_LABELS, type EntityFieldDef, type EntityTemplateDef, type FieldType } from '../../entities/types';

interface FieldForm {
  label: string;
  type: FieldType;
  required: boolean;
  choicesText: string;
  targetTemplateId: string;
}

const EMPTY_FORM: FieldForm = { label: '', type: 'text', required: false, choicesText: '', targetTemplateId: '' };

export default function EntityFieldsClient({ templateKey }: { templateKey: string }) {
  const [template, setTemplate] = useState<EntityTemplateDef | null>(null);
  const [others, setOthers] = useState<EntityTemplateDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const [editingField, setEditingField] = useState<EntityFieldDef | null>(null);
  const [fieldFormOpen, setFieldFormOpen] = useState(false);
  const [form, setForm] = useState<FieldForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [tRes, allRes] = await Promise.all([fetch(`/api/entities/${templateKey}`), fetch('/api/entities')]);
    setTemplate(tRes.ok ? await tRes.json() : null);
    setOthers(allRes.ok ? await allRes.json() : []);
    setLoading(false);
  }, [templateKey]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return null;
  if (!template) {
    return <EmptyState icon={Trash2} title="Сущность не найдена" description="Возможно, она была удалена." />;
  }

  const locked = template.hasRecords;

  const openAdd = () => {
    setEditingField(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setFieldFormOpen(true);
  };

  const openEdit = (f: EntityFieldDef) => {
    setEditingField(f);
    setForm({
      label: f.label,
      type: f.type,
      required: f.required,
      choicesText:
        (f.type === 'select' || f.type === 'multiselect') && f.options
          ? (f.options as { choices: string[] }).choices.join('\n')
          : '',
      targetTemplateId: f.type === 'relation' && f.options ? (f.options as { targetTemplateId: string }).targetTemplateId : '',
    });
    setFormError('');
    setFieldFormOpen(true);
  };

  const saveField = async () => {
    setSaving(true);
    setFormError('');

    const options =
      form.type === 'select' || form.type === 'multiselect'
        ? { choices: form.choicesText.split('\n').map((s) => s.trim()).filter(Boolean) }
        : form.type === 'relation'
          ? { targetTemplateId: form.targetTemplateId }
          : null;

    const url = editingField
      ? `/api/entities/${templateKey}/fields/${editingField.id}`
      : `/api/entities/${templateKey}/fields`;
    const res = await fetch(url, {
      method: editingField ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: form.label, type: form.type, required: form.required, options }),
    });
    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setFormError(body.error ?? 'Не удалось сохранить');
      return;
    }

    setFieldFormOpen(false);
    setBanner({ tone: 'ok', text: 'Поле сохранено' });
    load();
  };

  const removeField = async (f: EntityFieldDef) => {
    if (!confirm(`Удалить поле «${f.label}»?`)) return;
    const res = await fetch(`/api/entities/${templateKey}/fields/${f.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setBanner({ tone: 'err', text: body.error ?? 'Не удалось удалить' });
      return;
    }
    load();
  };

  const move = async (index: number, dir: -1 | 1) => {
    const ids = template.fields.map((f) => f.id);
    const target = index + dir;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];

    const res = await fetch(`/api/entities/${templateKey}/fields/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fieldIds: ids }),
    });
    if (res.ok) load();
  };

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/settings/entities" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-ink-muted hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> К списку сущностей
      </Link>

      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink">{template.namePlural}</h1>
          <p className="mt-1 text-[13px] text-ink-muted">
            {locked
              ? 'В сущности уже есть записи — поля больше нельзя менять.'
              : 'Поля можно менять свободно, пока в сущности нет ни одной записи.'}
          </p>
        </div>
        {!locked && (
          <Button variant="primary" onClick={openAdd}>
            <Plus className="h-4 w-4" /> Добавить поле
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

      {template.fields.length === 0 && (
        <EmptyState
          icon={Plus}
          title="Полей пока нет"
          description="Добавьте хотя бы одно поле, чтобы в сущности можно было заводить записи."
          action={
            <Button variant="primary" onClick={openAdd}>
              <Plus className="h-4 w-4" /> Добавить поле
            </Button>
          }
        />
      )}

      {template.fields.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-line">
          {template.fields.map((f, i) => (
            <div key={f.id} className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0">
              <div className="min-w-0">
                <span className="text-[13px] font-medium text-ink">{f.label}</span>
                <span className="ml-2 text-xs text-ink-muted">
                  {FIELD_TYPE_LABELS[f.type]}
                  {f.required ? ' · обязательное' : ''}
                </span>
              </div>
              {!locked && (
                <div className="flex items-center gap-1">
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
                    disabled={i === template.fields.length - 1}
                    className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-surface-muted hover:text-ink disabled:pointer-events-none disabled:opacity-30"
                    aria-label="Ниже"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <RowMenu
                    items={[
                      { label: 'Изменить', icon: <Pencil className="h-4 w-4" />, onClick: () => openEdit(f) },
                      { label: 'Удалить', icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: () => removeField(f) },
                    ]}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <SlideOver
        open={fieldFormOpen}
        onClose={() => setFieldFormOpen(false)}
        title={editingField ? 'Изменение поля' : 'Новое поле'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFieldFormOpen(false)}>
              Отмена
            </Button>
            <Button variant="primary" loading={saving} onClick={saveField}>
              Сохранить
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Название поля"
            placeholder="Наименование"
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
          />
          <Select
            label="Тип поля"
            value={form.type}
            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as FieldType }))}
          >
            {Object.entries(FIELD_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>

          {(form.type === 'select' || form.type === 'multiselect') && (
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-ink">Варианты списка</label>
              <textarea
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
                rows={4}
                placeholder={'Каждый вариант с новой строки'}
                value={form.choicesText}
                onChange={(e) => setForm((f) => ({ ...f, choicesText: e.target.value }))}
              />
            </div>
          )}

          {form.type === 'relation' && (
            <Select
              label="Связь с сущностью"
              value={form.targetTemplateId}
              onChange={(e) => setForm((f) => ({ ...f, targetTemplateId: e.target.value }))}
            >
              <option value="">Выберите сущность</option>
              {others.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.namePlural}
                </option>
              ))}
            </Select>
          )}

          <Checkbox
            checked={form.required}
            onChange={(v) => setForm((f) => ({ ...f, required: v }))}
            label="Обязательное поле"
          />

          {formError && <p className="text-xs text-danger">{formError}</p>}
        </div>
      </SlideOver>
    </div>
  );
}
