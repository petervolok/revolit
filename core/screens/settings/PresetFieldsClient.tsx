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
import { FIELD_TYPE_LABELS, slugify } from '../../entities/types';
import type { EntityPresetDef, FieldType, PresetFieldDef } from '../../entities/types';

interface FieldForm {
  label: string;
  type: FieldType;
  required: boolean;
  choicesText: string;
  targetPresetKey: string;
}

const EMPTY_FORM: FieldForm = { label: '', type: 'text', required: false, choicesText: '', targetPresetKey: '' };

export default function PresetFieldsClient({ presetKey }: { presetKey: string }) {
  const [preset, setPreset] = useState<EntityPresetDef | null>(null);
  const [others, setOthers] = useState<EntityPresetDef[]>([]);
  const [nameForm, setNameForm] = useState({ name: '', namePlural: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [fieldFormOpen, setFieldFormOpen] = useState(false);
  const [form, setForm] = useState<FieldForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    const res = await fetch('/api/entity-presets');
    const all: EntityPresetDef[] = res.ok ? await res.json() : [];
    const mine = all.find((p) => p.key === presetKey) ?? null;
    setPreset(mine);
    setOthers(all.filter((p) => p.key !== presetKey));
    if (mine) setNameForm({ name: mine.name, namePlural: mine.namePlural });
    setLoading(false);
  }, [presetKey]);

  useEffect(() => {
    load();
  }, [load]);

  const persist = async (fields: PresetFieldDef[], names?: { name: string; namePlural: string }) => {
    setSaving(true);
    setBanner(null);
    const res = await fetch(`/api/entity-presets/${presetKey}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(names ?? nameForm), fields }),
    });
    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setBanner({ tone: 'err', text: body.error ?? 'Не удалось сохранить' });
      return false;
    }
    await load();
    return true;
  };

  if (loading) return null;
  if (!preset) {
    return <EmptyState icon={Trash2} title="Шаблон не найден" description="Возможно, он был удалён." />;
  }

  const openAdd = () => {
    setEditingIndex(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setFieldFormOpen(true);
  };

  const openEdit = (index: number, f: PresetFieldDef) => {
    setEditingIndex(index);
    setForm({
      label: f.label,
      type: f.type,
      required: f.required,
      choicesText: (f.type === 'select' || f.type === 'multiselect') && f.options ? (f.options as { choices: string[] }).choices.join('\n') : '',
      targetPresetKey: f.type === 'relation' && f.options ? (f.options as { targetPresetKey: string }).targetPresetKey : '',
    });
    setFormError('');
    setFieldFormOpen(true);
  };

  const saveField = async () => {
    if (!form.label.trim()) {
      setFormError('Укажите название поля');
      return;
    }

    const options =
      form.type === 'select' || form.type === 'multiselect'
        ? { choices: form.choicesText.split('\n').map((s) => s.trim()).filter(Boolean) }
        : form.type === 'relation'
          ? { targetPresetKey: form.targetPresetKey }
          : undefined;

    const key = editingIndex !== null ? preset.fields[editingIndex].key : slugify(form.label) || `pole-${preset.fields.length + 1}`;
    const newField: PresetFieldDef = { key, label: form.label.trim(), type: form.type, required: form.required, options };

    const fields = [...preset.fields];
    if (editingIndex !== null) fields[editingIndex] = newField;
    else fields.push(newField);

    const ok = await persist(fields);
    if (ok) setFieldFormOpen(false);
  };

  const removeField = async (index: number) => {
    if (!confirm(`Удалить поле «${preset.fields[index].label}»?`)) return;
    const fields = preset.fields.filter((_, i) => i !== index);
    await persist(fields);
  };

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= preset.fields.length) return;
    const fields = [...preset.fields];
    [fields[index], fields[target]] = [fields[target], fields[index]];
    await persist(fields);
  };

  const saveNames = async () => {
    await persist(preset.fields, nameForm);
    setBanner({ tone: 'ok', text: 'Название сохранено' });
  };

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/settings/entity-presets" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-ink-muted hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> К списку шаблонов
      </Link>

      <h1 className="mb-5 text-lg font-semibold text-ink">{preset.namePlural}</h1>

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

      <div className="mb-6 flex flex-col gap-4 rounded-xl border border-line p-4">
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Название в единственном числе"
            value={nameForm.name}
            onChange={(e) => setNameForm((f) => ({ ...f, name: e.target.value }))}
          />
          <Input
            label="Название во множественном числе"
            value={nameForm.namePlural}
            onChange={(e) => setNameForm((f) => ({ ...f, namePlural: e.target.value }))}
          />
        </div>
        <div>
          <Button variant="secondary" size="sm" loading={saving} onClick={saveNames}>
            Сохранить название
          </Button>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[13px] font-semibold text-ink">Поля шаблона</h2>
        <Button variant="primary" size="sm" onClick={openAdd}>
          <Plus className="h-4 w-4" /> Добавить поле
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-line">
        {preset.fields.map((f, i) => (
          <div key={f.key} className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0">
            <div className="min-w-0">
              <span className="text-[13px] font-medium text-ink">{f.label}</span>
              <span className="ml-2 text-xs text-ink-muted">
                {FIELD_TYPE_LABELS[f.type]}
                {f.required ? ' · обязательное' : ''}
              </span>
            </div>
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
                disabled={i === preset.fields.length - 1}
                className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-surface-muted hover:text-ink disabled:pointer-events-none disabled:opacity-30"
                aria-label="Ниже"
              >
                <ArrowDown className="h-4 w-4" />
              </button>
              <RowMenu
                items={[
                  { label: 'Изменить', icon: <Pencil className="h-4 w-4" />, onClick: () => openEdit(i, f) },
                  { label: 'Удалить', icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: () => removeField(i) },
                ]}
              />
            </div>
          </div>
        ))}
      </div>

      <SlideOver
        open={fieldFormOpen}
        onClose={() => setFieldFormOpen(false)}
        title={editingIndex !== null ? 'Изменение поля' : 'Новое поле'}
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
                placeholder="Каждый вариант с новой строки"
                value={form.choicesText}
                onChange={(e) => setForm((f) => ({ ...f, choicesText: e.target.value }))}
              />
            </div>
          )}

          {form.type === 'relation' && (
            <Select
              label="Связь с шаблоном"
              hint="При создании сущности свяжется с сущностью, уже созданной из этого шаблона — если такой ещё нет, поле будет пропущено"
              value={form.targetPresetKey}
              onChange={(e) => setForm((f) => ({ ...f, targetPresetKey: e.target.value }))}
            >
              <option value="">Выберите шаблон</option>
              {others.map((o) => (
                <option key={o.key} value={o.key}>
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
