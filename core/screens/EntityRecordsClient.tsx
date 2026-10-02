'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Filter, Link2, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import Button from '../ui/Button';
import Checkbox from '../ui/Checkbox';
import EmptyState from '../ui/EmptyState';
import Input from '../ui/Input';
import RowMenu from '../ui/RowMenu';
import Select from '../ui/Select';
import SlideOver from '../ui/SlideOver';
import AttachmentsSection from '../attachments/AttachmentsSection';
import { displayValue, recordLabel } from '../entities/types';
import type { EntityFieldDef, EntityRecordDef, EntityTemplateDef, ReverseRelationGroup } from '../entities/types';
import { FILTER_OP_LABELS, opsForType } from '../entities/query';
import type { FilterOp } from '../entities/query';
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
  if (f.type === 'multiselect' || f.type === 'relations') return Array.isArray(v) ? v.map(String) : [];
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

/** Условие фильтра в экране: значение вводится строкой, на сервер уходит приведённым */
interface FilterDraft {
  field: string;
  op: FilterOp;
  value: string;
}

const PAGE_SIZE = 25;
const SYSTEM_COLUMNS = [
  { key: 'createdAt', label: 'Создано' },
  { key: 'updatedAt', label: 'Изменено' },
];

export default function EntityRecordsClient({ templateKey }: { templateKey: string }) {
  const [template, setTemplate] = useState<EntityTemplateDef | null>(null);
  const [records, setRecords] = useState<EntityRecordDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [query, setQuery] = useState('');
  const [searchApplied, setSearchApplied] = useState('');
  const [sort, setSort] = useState<{ field: string; dir: 'asc' | 'desc' } | null>(null);
  const [filters, setFilters] = useState<FilterDraft[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [anyRecords, setAnyRecords] = useState(true);

  // Для полей-связей: список записей целевой сущности, чтобы показать их не идентификатором, а именем
  const [relationOptions, setRelationOptions] = useState<Record<string, { id: string; label: string }[]>>({});
  // Для полей-сотрудников: список сотрудников программы
  const [programUsers, setProgramUsers] = useState<ProgramUser[]>([]);

  const [editing, setEditing] = useState<EntityRecordDef | null>(null);
  const [reverse, setReverse] = useState<ReverseRelationGroup[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<Record<string, FormValue>>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // Дела процессов, заведённые по этой записи — только для чтения здесь (Р-36)
  const [linkedInstances, setLinkedInstances] = useState<LinkedInstanceDef[]>([]);
  // Задачи, заведённые по этой записи — тем же приёмом (Р-37)
  const [linkedTasks, setLinkedTasks] = useState<TaskDef[]>([]);

  // Поиск уходит на сервер не на каждую букву, а когда пользователь на секунду остановился
  useEffect(() => {
    const t = setTimeout(() => {
      setSearchApplied(query.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (searchApplied) params.set('q', searchApplied);
    if (sort) {
      params.set('sort', sort.field);
      params.set('dir', sort.dir);
    }
    const ready = filters
      .filter((f) => f.field && (f.op === 'empty' || f.op === 'notEmpty' || f.value.trim() !== ''))
      .map((f) => ({ field: f.field, op: f.op, value: f.op === 'in' ? f.value.split(',').map((x) => x.trim()).filter(Boolean) : f.value }));
    if (ready.length > 0) params.set('filter', JSON.stringify(ready));
    return params.toString();
  }, [page, searchApplied, sort, filters]);

  const filtersActive = Boolean(searchApplied) || queryString.includes('filter=');

  const load = useCallback(async () => {
    const res = await fetch(`/api/entities/${templateKey}/records?${queryString}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      if (res.status === 404) setTemplate(null);
      else setBanner({ tone: 'err', text: typeof body.error === 'string' ? body.error : 'Не удалось загрузить записи' });
      setLoading(false);
      return;
    }
    const body = await res.json();
    setTemplate(body.template);
    setRecords(body.records);
    setTotal(body.total);
    setPages(body.pages);
    if (body.page !== page) setPage(body.page);
    // «Записей нет совсем» и «под фильтр ничего не подошло» — разные состояния экрана
    if (body.total > 0) setAnyRecords(true);
    else if (!queryString.includes('q=') && !queryString.includes('filter=')) setAnyRecords(false);
    setLoading(false);
  }, [templateKey, queryString, page]);

  useEffect(() => {
    load();
  }, [load]);

  // Подгружаем записи целевых сущностей для полей-связей — только когда они есть
  useEffect(() => {
    if (!template) return;
    const relationFields = template.fields.filter((f) => f.type === 'relation' || f.type === 'relations');
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

  const toggleSort = (field: string) => {
    setPage(1);
    setSort((prev) => (prev?.field !== field ? { field, dir: 'asc' } : prev.dir === 'asc' ? { field, dir: 'desc' } : null));
  };

  const updateFilter = (i: number, patch: Partial<FilterDraft>) => {
    setPage(1);
    setFilters((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  };

  if (loading) return null;
  if (!template) {
    return <EmptyState icon={Trash2} title="Раздел не найден" description="Возможно, сущность была удалена." />;
  }

  const canCreate = !template.access || template.access.create;
  const canUpdate = !template.access || template.access.update;
  const canDelete = !template.access || template.access.delete;

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
    setReverse([]);
    fetch(`/api/entities/${templateKey}/records/${r.id}/related`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setReverse);
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
      const body = await res.json().catch(() => ({}));
      setBanner({ tone: 'err', text: typeof body.error === 'string' ? body.error : 'Не удалось удалить' });
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
    if (field.type === 'relations') {
      const targetId = (field.options as { targetTemplateId: string } | null)?.targetTemplateId;
      return (value as string[]).map((id) => (targetId ? relationOptions[targetId]?.find((o) => o.id === id)?.label : undefined) ?? id).join(', ');
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
          {(anyRecords || filtersActive) && (
            <>
              <div className="w-56">
                <Input
                  placeholder="Поиск"
                  leading={<Search className="h-4 w-4" />}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <Button variant="secondary" onClick={() => setFiltersOpen((v) => !v)}>
                <Filter className="h-4 w-4" /> Фильтры{filters.length > 0 ? ` (${filters.length})` : ''}
              </Button>
            </>
          )}
          {canCreate && (
            <Button variant="primary" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Добавить
            </Button>
          )}
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

      {filtersOpen && (
        <div className="mb-4 flex flex-col gap-2 rounded-xl border border-line p-3">
          {filters.map((f, i) => {
            const def = allFields.find((x) => x.key === f.field);
            const ops = opsForType(def ? def.type : 'system');
            const needsValue = f.op !== 'empty' && f.op !== 'notEmpty';
            const choices = def && (def.type === 'select' || def.type === 'multiselect') ? (def.options as { choices: string[] }).choices : null;
            const inputType = def?.type === 'number' ? 'number' : def?.type === 'date' || !def ? 'date' : def.type === 'datetime' ? 'datetime-local' : 'text';
            return (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <div className="w-44">
                  <Select
                    value={f.field}
                    onChange={(e) => {
                      const next = allFields.find((x) => x.key === e.target.value);
                      updateFilter(i, { field: e.target.value, op: opsForType(next ? next.type : 'system')[0], value: '' });
                    }}
                  >
                    {allFields.map((x) => (
                      <option key={x.key} value={x.key}>
                        {x.label}
                      </option>
                    ))}
                    {SYSTEM_COLUMNS.map((x) => (
                      <option key={x.key} value={x.key}>
                        {x.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="w-40">
                  <Select value={f.op} onChange={(e) => updateFilter(i, { op: e.target.value as FilterOp })}>
                    {ops.map((o) => (
                      <option key={o} value={o}>
                        {FILTER_OP_LABELS[o]}
                      </option>
                    ))}
                  </Select>
                </div>
                {needsValue && (
                  <div className="w-52">
                    {def?.type === 'boolean' ? (
                      <Select value={f.value} onChange={(e) => updateFilter(i, { value: e.target.value })}>
                        <option value="">—</option>
                        <option value="true">да</option>
                        <option value="false">нет</option>
                      </Select>
                    ) : choices && f.op !== 'in' ? (
                      <Select value={f.value} onChange={(e) => updateFilter(i, { value: e.target.value })}>
                        <option value="">—</option>
                        {choices.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <Input
                        type={f.op === 'in' || f.op === 'contains' ? 'text' : inputType}
                        placeholder={f.op === 'in' ? 'значения через запятую' : 'значение'}
                        value={f.value}
                        onChange={(e) => updateFilter(i, { value: e.target.value })}
                      />
                    )}
                  </div>
                )}
                <button
                  type="button"
                  aria-label="Убрать условие"
                  className="rounded-md p-1.5 text-ink-muted hover:bg-surface-muted"
                  onClick={() => {
                    setPage(1);
                    setFilters((prev) => prev.filter((_, idx) => idx !== i));
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
          <div>
            <Button
              variant="secondary"
              onClick={() => {
                const first = allFields[0];
                setFilters((prev) => [...prev, { field: first?.key ?? 'createdAt', op: opsForType(first ? first.type : 'system')[0], value: '' }]);
              }}
            >
              <Plus className="h-4 w-4" /> Условие
            </Button>
          </div>
        </div>
      )}

      {!anyRecords && !filtersActive && (
        <EmptyState
          icon={Plus}
          title="Записей пока нет"
          description={canCreate ? 'Добавьте первую запись — форма собрана из полей, заданных в настройках сущности.' : 'Записей, доступных вам, пока нет.'}
          action={
            canCreate ? (
              <Button variant="primary" onClick={openCreate}>
                <Plus className="h-4 w-4" /> Добавить
              </Button>
            ) : undefined
          }
        />
      )}

      {filtersActive && records.length === 0 && (
        <EmptyState icon={Search} title="Ничего не найдено" description="Попробуйте изменить поиск или условия фильтра." />
      )}

      {records.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-line bg-surface-muted/60 text-xs text-ink-muted">
                {columns.map((f) => (
                  <th key={f.id} className="px-4 py-2.5 font-medium">
                    <button type="button" className="inline-flex items-center gap-1 hover:text-ink" onClick={() => toggleSort(f.key)}>
                      {f.label}
                      {sort?.field === f.key && (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                    </button>
                  </th>
                ))}
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
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
                        { label: canUpdate ? 'Изменить' : 'Открыть', icon: <Pencil className="h-4 w-4" />, onClick: () => openEdit(r) },
                        { label: 'Удалить', icon: <Trash2 className="h-4 w-4" />, danger: true, hidden: !canDelete, onClick: () => remove(r) },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {records.length > 0 && (
        <div className="mt-3 flex items-center justify-between text-[13px] text-ink-muted">
          <span>
            Всего: {total}
            {filtersActive ? ' (по условиям)' : ''}
          </span>
          {pages > 1 && (
            <div className="flex items-center gap-2">
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span>
                {page} из {pages}
              </span>
              <Button variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
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
            <Button variant="primary" loading={saving} onClick={save} disabled={Boolean(editing) && !canUpdate}>
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
            const locked = (f.readonly && Boolean(editing)) || (Boolean(editing) && !canUpdate);

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

            if (f.type === 'relations') {
              const targetId = (f.options as { targetTemplateId: string } | null)?.targetTemplateId;
              const options = targetId ? relationOptions[targetId] ?? [] : [];
              const selected = Array.isArray(value) ? value : [];
              const toggle = (id: string, checked: boolean) => {
                setValue(checked ? [...selected, id] : selected.filter((c) => c !== id));
              };
              return (
                <div key={f.id}>
                  <span className="mb-1.5 block text-[13px] font-medium text-ink">{label}</span>
                  <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-lg border border-line px-2 py-2">
                    {options.length === 0 && <span className="text-xs text-ink-muted">Нет записей для связи</span>}
                    {options.map((o) => (
                      <Checkbox key={o.id} label={o.label} disabled={locked} checked={selected.includes(o.id)} onChange={(v) => toggle(o.id, v)} />
                    ))}
                  </div>
                  {f.description && <p className="mt-1.5 text-xs text-ink-muted">{f.description}</p>}
                </div>
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

          {editing && reverse.length > 0 && (
            <div>
              <h3 className="mb-1.5 text-[13px] font-semibold text-ink">Связанные записи (ссылаются на эту)</h3>
              <div className="flex flex-col gap-2">
                {reverse.map((g) => (
                  <div key={`${g.template.key}.${g.field.key}`}>
                    <p className="text-xs text-ink-muted">
                      {g.template.namePlural} — поле «{g.field.label}» ({g.total})
                    </p>
                    <ul className="mt-0.5 list-inside list-disc text-[13px] text-ink">
                      {g.records.map((r) => (
                        <li key={r.id}>{r.label}</li>
                      ))}
                      {g.total > g.records.length && <li className="list-none text-xs text-ink-muted">и ещё {g.total - g.records.length}…</li>}
                    </ul>
                  </div>
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
