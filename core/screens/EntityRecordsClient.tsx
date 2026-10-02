'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Link2, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import Button from '../ui/Button';
import Checkbox from '../ui/Checkbox';
import EmptyState from '../ui/EmptyState';
import Input from '../ui/Input';
import RowMenu from '../ui/RowMenu';
import Select from '../ui/Select';
import SlideOver from '../ui/SlideOver';
import AttachmentsSection from '../attachments/AttachmentsSection';
import { displayValue, recordLabel } from '../entities/types';
import type { EntityFieldDef, EntityRecordDef, EntityTemplateDef } from '../entities/types';
import type { LinkedInstanceDef } from '../processes/types';
import type { TaskDef } from '../tasks/types';

const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });

const textareaClass =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-60';

/** ISO-время → значение для поля datetime-local в местном часовом поясе */
function toLocalInput(iso: unknown): string {
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

/** Начальное значение поля в форме: из записи, а для новой — значение по умолчанию */
function formValueOf(f: EntityFieldDef, v: unknown): FormValue {
  if (f.type === 'multiselect') return Array.isArray(v) ? v.map(String) : [];
  if (f.type === 'boolean') return v === true;
  if (v === undefined || v === null) return '';
  if (f.type === 'date') return String(v).slice(0, 10);
  if (f.type === 'datetime') return toLocalInput(v);
  if (f.type === 'json') return JSON.stringify(v, null, 2);
  return String(v);
}

interface ProgramUser {
  id: string;
  name: string;
  email: string;
}

/** Значение поля в форме: текстовые поля — строка, список с несколькими значениями — массив */
type FormValue = string | string[] | boolean;

export default function EntityRecordsClient({ templateKey }: { templateKey: string }) {
  const [template, setTemplate] = useState<EntityTemplateDef | null>(null);
  const [records, setRecords] = useState<EntityRecordDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [query, setQuery] = useState('');

  // Для полей-связей: список записей целевой сущности, чтобы показать их не идентификатором, а именем
  const [relationOptions, setRelationOptions] = useState<Record<string, { id: string; label: string }[]>>({});
  // Для полей-сотрудников: список сотрудников программы
  const [programUsers, setProgramUsers] = useState<ProgramUser[]>([]);

  const [editing, setEditing] = useState<EntityRecordDef | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<Record<string, FormValue>>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // Дела процессов, заведённые по этой записи — только для чтения здесь (Р-36)
  const [linkedInstances, setLinkedInstances] = useState<LinkedInstanceDef[]>([]);
  // Задачи, заведённые по этой записи — тем же приёмом (Р-37)
  const [linkedTasks, setLinkedTasks] = useState<TaskDef[]>([]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/entities/${templateKey}/records`);
    if (!res.ok) {
      setTemplate(null);
      setLoading(false);
      return;
    }
    const body = await res.json();
    setTemplate(body.template);
    setRecords(body.records);
    setLoading(false);
  }, [templateKey]);

  useEffect(() => {
    load();
  }, [load]);

  // Подгружаем записи целевых сущностей для полей-связей — только когда они есть
  useEffect(() => {
    if (!template) return;
    const relationFields = template.fields.filter((f) => f.type === 'relation');
    if (relationFields.length === 0) return;

    (async () => {
      const allRes = await fetch('/api/entities');
      const all: EntityTemplateDef[] = allRes.ok ? await allRes.json() : [];
      const byId: Record<string, EntityTemplateDef> = {};
      for (const t of all) byId[t.id] = t;

      const options: Record<string, { id: string; label: string }[]> = {};
      for (const field of relationFields) {
        const targetId = (field.options as { targetTemplateId: string } | null)?.targetTemplateId;
        if (!targetId) continue;
        const target = byId[targetId];
        if (!target || options[targetId]) continue;

        const recRes = await fetch(`/api/entities/${target.key}/records`);
        const recBody = recRes.ok ? await recRes.json() : { records: [] };
        options[targetId] = (recBody.records as EntityRecordDef[]).map((r) => ({
          id: r.id,
          label: recordLabel(r, target.fields, target.displayField),
        }));
      }
      setRelationOptions(options);
    })();
  }, [template]);

  // Подгружаем сотрудников программы — только когда в сущности есть поле такого типа
  useEffect(() => {
    if (!template) return;
    if (!template.fields.some((f) => f.type === 'user')) return;

    fetch('/api/program-users')
      .then((res) => (res.ok ? res.json() : []))
      .then(setProgramUsers);
  }, [template]);

  const allFields = useMemo(() => template?.fields ?? [], [template]);
  // Колонки списка: поля, помеченные «не показывать в списке», скрыты (в форме они остаются)
  const columns = useMemo(() => allFields.filter((f) => !f.hidden), [allFields]);

  const visibleRecords = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return records;
    return records.filter((r) =>
      allFields.some((f) => String(r.data[f.key] ?? '').toLowerCase().includes(q))
    );
  }, [records, allFields, query]);

  if (loading) return null;
  if (!template) {
    return <EmptyState icon={Trash2} title="Раздел не найден" description="Возможно, сущность была удалена." />;
  }

  const openCreate = () => {
    setEditing(null);
    const defaults: Record<string, FormValue> = {};
    for (const f of template.fields) {
      if (f.hasDefault) defaults[f.key] = formValueOf(f, f.defaultValue);
    }
    setForm(defaults);
    setFormError('');
    setFormOpen(true);
    setLinkedInstances([]);
    setLinkedTasks([]);
  };

  const openEdit = (r: EntityRecordDef) => {
    setEditing(r);
    const values: Record<string, FormValue> = {};
    for (const f of template.fields) values[f.key] = formValueOf(f, r.data[f.key]);
    setForm(values);
    setFormError('');
    setFormOpen(true);
    setLinkedInstances([]);
    fetch(`/api/entity-records/${r.id}/instances`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setLinkedInstances);
    setLinkedTasks([]);
    fetch(`/api/tasks?entityRecordId=${r.id}&includeDone=1`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setLinkedTasks);
  };

  const save = async () => {
    setSaving(true);
    setFormError('');

    // Дата и время вводятся в местном поясе пользователя — на сервер уходят в абсолютном виде (ISO)
    const payload: Record<string, FormValue> = { ...form };
    for (const f of template.fields) {
      const v = payload[f.key];
      if (f.type === 'datetime' && typeof v === 'string' && v) {
        const d = new Date(v);
        if (!Number.isNaN(d.getTime())) payload[f.key] = d.toISOString();
      }
    }

    const url = editing ? `/api/entities/${templateKey}/records/${editing.id}` : `/api/entities/${templateKey}/records`;
    const res = await fetch(url, {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setFormError(body.error ?? 'Не удалось сохранить');
      return;
    }

    setFormOpen(false);
    setBanner({ tone: 'ok', text: 'Запись сохранена' });
    load();
  };

  const remove = async (r: EntityRecordDef) => {
    if (!confirm('Удалить запись?')) return;
    const res = await fetch(`/api/entities/${templateKey}/records/${r.id}`, { method: 'DELETE' });
    if (!res.ok) {
      setBanner({ tone: 'err', text: 'Не удалось удалить' });
      return;
    }
    setBanner({ tone: 'ok', text: 'Запись удалена' });
    load();
  };

  const formatCell = (field: EntityFieldDef, record: EntityRecordDef): string => {
    const value = record.data[field.key];
    if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
      return '—';
    }
    if (field.type === 'date') return dateFormat.format(new Date(String(value)));
    if (field.type === 'boolean' || field.type === 'datetime' || field.type === 'json') return displayValue(field, value);
    if (field.type === 'relation') {
      const targetId = (field.options as { targetTemplateId: string } | null)?.targetTemplateId;
      const found = targetId ? relationOptions[targetId]?.find((o) => o.id === value) : null;
      return found?.label ?? String(value);
    }
    if (field.type === 'user') {
      const found = programUsers.find((u) => u.id === value);
      return found?.name ?? String(value);
    }
    if (field.type === 'multiselect') {
      return (value as string[]).join(', ');
    }
    return String(value);
  };

  /** Ссылки, почта и телефон в списке — кликабельны; клик по ним не открывает форму записи */
  const renderCell = (field: EntityFieldDef, record: EntityRecordDef): React.ReactNode => {
    const text = formatCell(field, record);
    const raw = record.data[field.key];
    if (text === '—' || typeof raw !== 'string') return text;
    const href = field.type === 'url' ? raw : field.type === 'email' ? `mailto:${raw}` : field.type === 'phone' ? `tel:${raw.replace(/[^+\d]/g, '')}` : null;
    if (!href) return text;
    return (
      <a
        href={href}
        target={field.type === 'url' ? '_blank' : undefined}
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="text-brand hover:underline"
      >
        {text}
      </a>
    );
  };

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-ink">{template.namePlural}</h1>
          {template.description && <p className="mt-1 text-[13px] text-ink-muted">{template.description}</p>}
        </div>
        <div className="flex items-center gap-3">
          {records.length > 0 && (
            <div className="w-56">
              <Input
                placeholder="Поиск"
                leading={<Search className="h-4 w-4" />}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          )}
          <Button variant="primary" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Добавить
          </Button>
        </div>
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

      {records.length === 0 && (
        <EmptyState
          icon={Plus}
          title="Записей пока нет"
          description="Добавьте первую запись — форма собрана из полей, заданных в настройках сущности."
          action={
            <Button variant="primary" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Добавить
            </Button>
          }
        />
      )}

      {records.length > 0 && visibleRecords.length === 0 && (
        <EmptyState icon={Search} title="Ничего не найдено" description="Попробуйте изменить запрос поиска." />
      )}

      {visibleRecords.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-line bg-surface-muted/60 text-xs text-ink-muted">
                {columns.map((f) => (
                  <th key={f.id} className="px-4 py-2.5 font-medium">
                    {f.label}
                  </th>
                ))}
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {visibleRecords.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => openEdit(r)}
                  className="cursor-pointer border-b border-line last:border-b-0 hover:bg-surface-muted/40"
                >
                  {columns.map((f) => (
                    <td key={f.id} className="px-4 py-2.5 text-ink">
                      {renderCell(f, r)}
                    </td>
                  ))}
                  <td className="px-2 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                    <RowMenu
                      items={[
                        { label: 'Изменить', icon: <Pencil className="h-4 w-4" />, onClick: () => openEdit(r) },
                        { label: 'Удалить', icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: () => remove(r) },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SlideOver
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Изменение записи' : 'Новая запись'}
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
          {template.fields.map((f) => {
            const value = form[f.key];
            const setValue = (v: FormValue) => setForm((prev) => ({ ...prev, [f.key]: v }));
            const label = f.label + (f.required ? ' *' : '');
            // Поле «только чтение» нельзя менять в уже существующей записи
            const locked = f.readonly && Boolean(editing);

            if (f.type === 'boolean') {
              return (
                <Checkbox
                  key={f.id}
                  label={label}
                  hint={f.description ?? undefined}
                  disabled={locked}
                  checked={value === true}
                  onChange={(v) => setValue(v)}
                />
              );
            }

            if (f.type === 'longtext' || f.type === 'json') {
              return (
                <div key={f.id}>
                  <label className="mb-1.5 block text-[13px] font-medium text-ink">{label}</label>
                  <textarea
                    className={textareaClass + (f.type === 'json' ? ' font-mono text-xs' : '')}
                    rows={f.type === 'json' ? 6 : 4}
                    disabled={locked}
                    value={(value as string) ?? ''}
                    onChange={(e) => setValue(e.target.value)}
                  />
                  {f.description && <p className="mt-1.5 text-xs text-ink-muted">{f.description}</p>}
                </div>
              );
            }

            if (f.type === 'select') {
              const choices = (f.options as { choices: string[] } | null)?.choices ?? [];
              return (
                <Select
                  key={f.id}
                  label={label}
                  hint={f.description ?? undefined}
                  disabled={locked}
                  value={(value as string) ?? ''}
                  onChange={(e) => setValue(e.target.value)}
                >
                  <option value="">Не выбрано</option>
                  {choices.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              );
            }

            if (f.type === 'multiselect') {
              const choices = (f.options as { choices: string[] } | null)?.choices ?? [];
              const selected = Array.isArray(value) ? value : [];
              const toggle = (choice: string, checked: boolean) => {
                setValue(checked ? [...selected, choice] : selected.filter((c) => c !== choice));
              };
              return (
                <div key={f.id}>
                  <span className="mb-1.5 block text-[13px] font-medium text-ink">{label}</span>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-line px-2 py-2">
                    {choices.map((c) => (
                      <Checkbox key={c} label={c} disabled={locked} checked={selected.includes(c)} onChange={(v) => toggle(c, v)} />
                    ))}
                  </div>
                  {f.description && <p className="mt-1.5 text-xs text-ink-muted">{f.description}</p>}
                </div>
              );
            }

            if (f.type === 'relation') {
              const targetId = (f.options as { targetTemplateId: string } | null)?.targetTemplateId;
              const options = targetId ? relationOptions[targetId] ?? [] : [];
              return (
                <Select
                  key={f.id}
                  label={label}
                  hint={f.description ?? undefined}
                  disabled={locked}
                  value={(value as string) ?? ''}
                  onChange={(e) => setValue(e.target.value)}
                >
                  <option value="">Не выбрано</option>
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              );
            }

            if (f.type === 'user') {
              return (
                <Select
                  key={f.id}
                  label={label}
                  hint={f.description ?? undefined}
                  disabled={locked}
                  value={(value as string) ?? ''}
                  onChange={(e) => setValue(e.target.value)}
                >
                  <option value="">Не выбрано</option>
                  {programUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              );
            }

            const inputType =
              f.type === 'number' ? 'number'
              : f.type === 'date' ? 'date'
              : f.type === 'datetime' ? 'datetime-local'
              : f.type === 'email' ? 'email'
              : f.type === 'url' ? 'url'
              : f.type === 'phone' ? 'tel'
              : 'text';
            const v = f.validation;
            return (
              <Input
                key={f.id}
                label={label}
                hint={f.description ?? undefined}
                type={inputType}
                disabled={locked}
                {...(f.type === 'number'
                  ? { min: v.min as number | undefined, max: v.max as number | undefined, step: v.integer ? 1 : 'any' }
                  : {})}
                {...(v.maxLength !== undefined ? { maxLength: v.maxLength } : {})}
                value={(value as string) ?? ''}
                onChange={(e) => setValue(e.target.value)}
              />
            );
          })}
          {formError && <p className="text-xs text-danger">{formError}</p>}

          {editing && linkedInstances.length > 0 && (
            <div>
              <h3 className="mb-1.5 text-[13px] font-semibold text-ink">Дела процессов</h3>
              <div className="flex flex-col gap-1.5">
                {linkedInstances.map((li) => (
                  <Link
                    key={li.id}
                    href={`/processes/${li.templateKey}`}
                    className="flex items-center gap-1.5 text-[13px] text-brand hover:underline"
                  >
                    <Link2 className="h-3.5 w-3.5 shrink-0" />
                    {li.title} — {li.templateName} · {li.stageName}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {editing && <AttachmentsSection parent={{ entityRecordId: editing.id }} />}

          {editing && linkedTasks.length > 0 && (
            <div>
              <h3 className="mb-1.5 text-[13px] font-semibold text-ink">Задачи</h3>
              <div className="flex flex-col gap-1">
                {linkedTasks.map((t) => (
                  <p key={t.id} className={'text-[13px] ' + (t.status === 'done' ? 'text-ink-faint line-through' : 'text-ink')}>
                    {t.title}
                    {t.assignee ? ` · ${t.assignee.name}` : ''}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      </SlideOver>
    </div>
  );
}
