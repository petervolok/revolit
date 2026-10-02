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
import {
  FIELD_TYPE_LABELS,
  STRING_TYPES,
  UNIQUE_TYPES,
  type EntityFieldDef,
  type EntityTemplateDef,
  type FieldType,
  type FieldValidation,
} from '../../entities/types';

interface FieldForm {
  label: string;
  type: FieldType;
  required: boolean;
  choicesText: string;
  targetTemplateId: string;
  onDelete: 'clear' | 'restrict';
  description: string;
  hasDefault: boolean;
  defaultText: string;
  unique: boolean;
  readonly: boolean;
  hidden: boolean;
  min: string;
  max: string;
  minLength: string;
  maxLength: string;
  integer: boolean;
  pattern: string;
  message: string;
}

const EMPTY_FORM: FieldForm = {
  label: '', type: 'text', required: false, choicesText: '', targetTemplateId: '', onDelete: 'clear', description: '', hasDefault: false,
  defaultText: '', unique: false, readonly: false, hidden: false, min: '', max: '', minLength: '', maxLength: '',
  integer: false, pattern: '', message: '',
};

const textareaClass =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25';

/** Для каких типов значение по умолчанию задаётся в интерфейсе */
const DEFAULT_TYPES: FieldType[] = ['text', 'longtext', 'number', 'boolean', 'date', 'datetime', 'select', 'json', 'email', 'url', 'phone'];

function defaultToText(f: EntityFieldDef): string {
  if (!f.hasDefault || f.defaultValue === undefined || f.defaultValue === null) return '';
  if (f.type === 'json') return JSON.stringify(f.defaultValue);
  if (f.type === 'date') return String(f.defaultValue).slice(0, 10);
  if (f.type === 'datetime') return String(f.defaultValue).slice(0, 16);
  return String(f.defaultValue);
}

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

  const [meta, setMeta] = useState({ description: '', icon: '', displayField: '' });
  const [savingMeta, setSavingMeta] = useState(false);

  const load = useCallback(async () => {
    const [tRes, allRes] = await Promise.all([fetch(`/api/entities/${templateKey}`), fetch('/api/entities')]);
    const t: EntityTemplateDef | null = tRes.ok ? await tRes.json() : null;
    setTemplate(t);
    if (t) setMeta({ description: t.description ?? '', icon: t.icon ?? '', displayField: t.displayField ?? '' });
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

  const hasRecords = template.hasRecords;
  const set = <K extends keyof FieldForm>(key: K, value: FieldForm[K]) => setForm((f) => ({ ...f, [key]: value }));

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
      targetTemplateId: (f.type === 'relation' || f.type === 'relations') && f.options ? (f.options as { targetTemplateId: string }).targetTemplateId : '',
      onDelete: (f.options as { onDelete?: 'clear' | 'restrict' } | null)?.onDelete === 'restrict' ? 'restrict' : 'clear',
      description: f.description ?? '',
      hasDefault: f.hasDefault,
      defaultText: defaultToText(f),
      unique: f.unique,
      readonly: f.readonly,
      hidden: f.hidden,
      min: f.validation.min !== undefined ? String(f.validation.min).slice(0, f.type === 'date' ? 10 : 16) : '',
      max: f.validation.max !== undefined ? String(f.validation.max).slice(0, f.type === 'date' ? 10 : 16) : '',
      minLength: f.validation.minLength !== undefined ? String(f.validation.minLength) : '',
      maxLength: f.validation.maxLength !== undefined ? String(f.validation.maxLength) : '',
      integer: Boolean(f.validation.integer),
      pattern: f.validation.pattern ?? '',
      message: f.validation.message ?? '',
    });
    setFormError('');
    setFieldFormOpen(true);
  };

  /** Типы, на которые можно сменить тип поля: при наличии записей — только внутри текстовых */
  const typeChoices = (): FieldType[] => {
    const all = Object.keys(FIELD_TYPE_LABELS) as FieldType[];
    if (!editingField || !hasRecords) return all;
    if (editingField.type === 'relation' || editingField.type === 'relations') return ['relation', 'relations'];
    return STRING_TYPES.includes(editingField.type) ? STRING_TYPES : [editingField.type];
  };

  const defaultValueFor = (): unknown => {
    if (form.type === 'boolean') return form.defaultText === 'true';
    if (form.type === 'number') return Number(form.defaultText);
    return form.defaultText;
  };

  const saveField = async () => {
    setSaving(true);
    setFormError('');

    const options =
      form.type === 'select' || form.type === 'multiselect'
        ? { choices: form.choicesText.split('\n').map((s) => s.trim()).filter(Boolean) }
        : form.type === 'relation' || form.type === 'relations'
          ? { targetTemplateId: form.targetTemplateId, onDelete: form.onDelete }
          : null;

    const validation: FieldValidation = {};
    if (['number', 'date', 'datetime'].includes(form.type)) {
      if (form.min) validation.min = form.type === 'number' ? Number(form.min) : form.min;
      if (form.max) validation.max = form.type === 'number' ? Number(form.max) : form.max;
    }
    if (form.type === 'number' && form.integer) validation.integer = true;
    if (STRING_TYPES.includes(form.type)) {
      if (form.minLength) validation.minLength = Number(form.minLength);
      if (form.maxLength) validation.maxLength = Number(form.maxLength);
      if (form.pattern.trim()) validation.pattern = form.pattern.trim();
    }
    if (form.message.trim()) validation.message = form.message.trim();

    const canDefault = DEFAULT_TYPES.includes(form.type);
    const url = editingField
      ? `/api/entities/${templateKey}/fields/${editingField.id}`
      : `/api/entities/${templateKey}/fields`;
    const res = await fetch(url, {
      method: editingField ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: form.label,
        type: form.type,
        required: form.required,
        options,
        description: form.description,
        hasDefault: canDefault && form.hasDefault,
        defaultValue: canDefault && form.hasDefault ? defaultValueFor() : undefined,
        unique: UNIQUE_TYPES.includes(form.type) && form.unique,
        readonly: form.readonly,
        hidden: form.hidden,
        validation,
      }),
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
    const warning = hasRecords
      ? `Удалить поле «${f.label}»? Его значения будут стёрты во всех записях сущности, это нельзя отменить.`
      : `Удалить поле «${f.label}»?`;
    if (!confirm(warning)) return;
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

  const saveMeta = async () => {
    setSavingMeta(true);
    const res = await fetch(`/api/entities/${templateKey}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: template.name, namePlural: template.namePlural, ...meta }),
    });
    setSavingMeta(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setBanner({ tone: 'err', text: body.error ?? 'Не удалось сохранить' });
      return;
    }
    setBanner({ tone: 'ok', text: 'Настройки сущности сохранены' });
    load();
  };

  const badges = (f: EntityFieldDef) =>
    [
      FIELD_TYPE_LABELS[f.type],
      f.required ? 'обязательное' : '',
      f.unique ? 'уникальное' : '',
      f.readonly ? 'только чтение' : '',
      f.hidden ? 'скрыто в списке' : '',
      f.hasDefault ? 'есть значение по умолчанию' : '',
    ]
      .filter(Boolean)
      .join(' · ');

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/settings/entities" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-ink-muted hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> К списку сущностей
      </Link>

      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink">{template.namePlural}</h1>
          <p className="mt-1 text-[13px] text-ink-muted">
            {hasRecords
              ? 'Поля можно менять и при наличии записей: тип — только между текстовыми, удаление поля стирает его значения.'
              : 'Поля можно менять свободно, пока в сущности нет записей.'}
          </p>
        </div>
        <Button variant="primary" onClick={openAdd}>
          <Plus className="h-4 w-4" /> Добавить поле
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

      <section className="mb-6 rounded-xl border border-line p-4">
        <h2 className="mb-3 text-[13px] font-semibold text-ink">Настройки сущности</h2>
        <div className="flex flex-col gap-3">
          <Input
            label="Описание"
            hint="Одна-две фразы о том, что здесь хранится"
            value={meta.description}
            onChange={(e) => setMeta((m) => ({ ...m, description: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Значок"
              hint="Имя значка lucide, например Users"
              value={meta.icon}
              onChange={(e) => setMeta((m) => ({ ...m, icon: e.target.value }))}
            />
            <Select
              label="Поле-заголовок записи"
              value={meta.displayField}
              onChange={(e) => setMeta((m) => ({ ...m, displayField: e.target.value }))}
            >
              <option value="">Первое текстовое поле</option>
              {template.fields.map((f) => (
                <option key={f.id} value={f.key}>
                  {f.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Button variant="secondary" loading={savingMeta} onClick={saveMeta}>
              Сохранить настройки
            </Button>
          </div>
        </div>
      </section>

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
                <span className="ml-2 text-xs text-ink-muted">{badges(f)}</span>
                {f.description && <div className="mt-0.5 text-xs text-ink-faint">{f.description}</div>}
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
          <Input label="Название поля" placeholder="Наименование" value={form.label} onChange={(e) => set('label', e.target.value)} />
          <Select label="Тип поля" value={form.type} onChange={(e) => set('type', e.target.value as FieldType)}>
            {typeChoices().map((value) => (
              <option key={value} value={value}>
                {FIELD_TYPE_LABELS[value]}
              </option>
            ))}
          </Select>

          {(form.type === 'select' || form.type === 'multiselect') && (
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-ink">Варианты списка</label>
              <textarea
                className={textareaClass}
                rows={4}
                placeholder={'Каждый вариант с новой строки'}
                value={form.choicesText}
                onChange={(e) => set('choicesText', e.target.value)}
              />
            </div>
          )}

          {(form.type === 'relation' || form.type === 'relations') && (
            <>
              <Select
                label="Связь с сущностью"
                value={form.targetTemplateId}
                disabled={Boolean(editingField) && hasRecords}
                onChange={(e) => set('targetTemplateId', e.target.value)}
              >
                <option value="">Выберите сущность</option>
                {others.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.namePlural}
                  </option>
                ))}
              </Select>
              <Select
                label="Если связанную запись удаляют"
                hint="В связанной записи появится обратный список — кто на неё ссылается"
                value={form.onDelete}
                onChange={(e) => set('onDelete', e.target.value as 'clear' | 'restrict')}
              >
                <option value="clear">Убрать ссылку из записей</option>
                <option value="restrict">Не давать удалять, пока на запись ссылаются</option>
              </Select>
            </>
          )}

          <Input
            label="Подсказка под полем"
            hint="Показывается в форме записи"
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
          />

          {DEFAULT_TYPES.includes(form.type) && (
            <div className="flex flex-col gap-2">
              <Checkbox checked={form.hasDefault} onChange={(v) => set('hasDefault', v)} label="Значение по умолчанию" />
              {form.hasDefault &&
                (form.type === 'boolean' ? (
                  <Select value={form.defaultText || 'false'} onChange={(e) => set('defaultText', e.target.value)}>
                    <option value="true">да</option>
                    <option value="false">нет</option>
                  </Select>
                ) : form.type === 'select' ? (
                  <Select value={form.defaultText} onChange={(e) => set('defaultText', e.target.value)}>
                    <option value="">Выберите вариант</option>
                    {form.choicesText
                      .split('\n')
                      .map((s) => s.trim())
                      .filter(Boolean)
                      .map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                  </Select>
                ) : form.type === 'json' || form.type === 'longtext' ? (
                  <textarea className={textareaClass} rows={3} value={form.defaultText} onChange={(e) => set('defaultText', e.target.value)} />
                ) : (
                  <Input
                    type={form.type === 'number' ? 'number' : form.type === 'date' ? 'date' : form.type === 'datetime' ? 'datetime-local' : 'text'}
                    value={form.defaultText}
                    onChange={(e) => set('defaultText', e.target.value)}
                  />
                ))}
            </div>
          )}

          {['number', 'date', 'datetime'].includes(form.type) && (
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Не меньше"
                type={form.type === 'number' ? 'number' : form.type === 'date' ? 'date' : 'datetime-local'}
                value={form.min}
                onChange={(e) => set('min', e.target.value)}
              />
              <Input
                label="Не больше"
                type={form.type === 'number' ? 'number' : form.type === 'date' ? 'date' : 'datetime-local'}
                value={form.max}
                onChange={(e) => set('max', e.target.value)}
              />
            </div>
          )}
          {form.type === 'number' && <Checkbox checked={form.integer} onChange={(v) => set('integer', v)} label="Только целые числа" />}

          {STRING_TYPES.includes(form.type) && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Длина не меньше" type="number" value={form.minLength} onChange={(e) => set('minLength', e.target.value)} />
                <Input label="Длина не больше" type="number" value={form.maxLength} onChange={(e) => set('maxLength', e.target.value)} />
              </div>
              <Input
                label="Формат (регулярное выражение)"
                hint="Например ^[A-Z]{2}-[0-9]{4}$"
                value={form.pattern}
                onChange={(e) => set('pattern', e.target.value)}
              />
            </>
          )}
          <Input
            label="Сообщение при нарушении правил"
            hint="Необязательно — иначе показывается стандартное"
            value={form.message}
            onChange={(e) => set('message', e.target.value)}
          />

          <div className="flex flex-col gap-2">
            <Checkbox checked={form.required} onChange={(v) => set('required', v)} label="Обязательное поле" />
            {UNIQUE_TYPES.includes(form.type) && (
              <Checkbox checked={form.unique} onChange={(v) => set('unique', v)} label="Значение не должно повторяться" />
            )}
            <Checkbox checked={form.readonly} onChange={(v) => set('readonly', v)} label="Нельзя менять после создания записи" />
            <Checkbox checked={form.hidden} onChange={(v) => set('hidden', v)} label="Не показывать колонкой в списке" />
          </div>

          {hasRecords && editingField && (form.required || form.unique) && (
            <p className="text-xs text-ink-muted">
              Записи уже есть: если у части из них поле пусто или значения повторяются, сервер скажет об этом при сохранении.
            </p>
          )}
          {formError && <p className="text-xs text-danger">{formError}</p>}
        </div>
      </SlideOver>
    </div>
  );
}
