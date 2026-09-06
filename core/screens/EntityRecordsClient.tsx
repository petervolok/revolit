'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import Button from '../ui/Button';
import Checkbox from '../ui/Checkbox';
import EmptyState from '../ui/EmptyState';
import Input from '../ui/Input';
import RowMenu from '../ui/RowMenu';
import Select from '../ui/Select';
import SlideOver from '../ui/SlideOver';
import type { EntityFieldDef, EntityRecordDef, EntityTemplateDef } from '../entities/types';

const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });

interface ProgramUser {
  id: string;
  name: string;
  email: string;
}

/** Запись показывается по первому текстовому полю, иначе — по первому непустому значению */
function recordLabel(record: EntityRecordDef, fields: EntityFieldDef[]): string {
  const textField = fields.find((f) => f.type === 'text');
  if (textField && record.data[textField.key]) return String(record.data[textField.key]);
  const firstValue = fields.map((f) => record.data[f.key]).find((v) => v !== undefined && v !== null && v !== '');
  return firstValue !== undefined ? String(firstValue) : `Запись ${record.id.slice(0, 6)}`;
}

/** Значение поля в форме: текстовые поля — строка, список с несколькими значениями — массив */
type FormValue = string | string[];

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
          label: recordLabel(r, target.fields),
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

  const columns = useMemo(() => template?.fields ?? [], [template]);

  const visibleRecords = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return records;
    return records.filter((r) =>
      columns.some((f) => String(r.data[f.key] ?? '').toLowerCase().includes(q))
    );
  }, [records, columns, query]);

  if (loading) return null;
  if (!template) {
    return <EmptyState icon={Trash2} title="Раздел не найден" description="Возможно, сущность была удалена." />;
  }

  const openCreate = () => {
    setEditing(null);
    setForm({});
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = (r: EntityRecordDef) => {
    setEditing(r);
    const values: Record<string, FormValue> = {};
    for (const f of template.fields) {
      const v = r.data[f.key];
      if (f.type === 'multiselect') {
        values[f.key] = Array.isArray(v) ? v.map(String) : [];
      } else if (f.type === 'date' && typeof v === 'string') {
        values[f.key] = v.slice(0, 10);
      } else {
        values[f.key] = v !== undefined ? String(v) : '';
      }
    }
    setForm(values);
    setFormError('');
    setFormOpen(true);
  };

  const save = async () => {
    setSaving(true);
    setFormError('');

    const url = editing ? `/api/entities/${templateKey}/records/${editing.id}` : `/api/entities/${templateKey}/records`;
    const res = await fetch(url, {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
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

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold text-ink">{template.namePlural}</h1>
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
                      {formatCell(f, r)}
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

            if (f.type === 'select') {
              const choices = (f.options as { choices: string[] } | null)?.choices ?? [];
              return (
                <Select
                  key={f.id}
                  label={label}
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
                      <Checkbox key={c} label={c} checked={selected.includes(c)} onChange={(v) => toggle(c, v)} />
                    ))}
                  </div>
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

            return (
              <Input
                key={f.id}
                label={label}
                type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                value={(value as string) ?? ''}
                onChange={(e) => setValue(e.target.value)}
              />
            );
          })}
          {formError && <p className="text-xs text-danger">{formError}</p>}
        </div>
      </SlideOver>
    </div>
  );
}
