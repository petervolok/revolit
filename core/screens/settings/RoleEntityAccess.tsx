'use client';

import { useEffect, useState } from 'react';
import Button from '../../ui/Button';
import Checkbox from '../../ui/Checkbox';
import Select from '../../ui/Select';

interface TemplateDto {
  id: string;
  key: string;
  name: string;
  namePlural: string;
  fields: { key: string; label: string; required: boolean; hasDefault: boolean }[];
}

interface RuleDto {
  templateId: string;
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  rowScope: 'all' | 'own';
  hiddenFields: string[];
  readonlyFields: string[];
}

const emptyRule = (templateId: string): RuleDto => ({
  templateId, canRead: false, canCreate: false, canUpdate: false, canDelete: false, rowScope: 'all', hiddenFields: [], readonlyFields: [],
});

/** Доступ роли к сущностям: что можно делать с записями, чьи записи видны, какие поля скрыты или только для чтения */
export default function RoleEntityAccess({ roleId }: { roleId: string }) {
  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  const [rules, setRules] = useState<Record<string, RuleDto>>({});
  const [fullAccess, setFullAccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/roles/${roleId}/entity-access`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setTemplates(data.templates);
        setFullAccess(data.fullAccess);
        const map: Record<string, RuleDto> = {};
        for (const r of data.rules as RuleDto[]) map[r.templateId] = r;
        setRules(map);
      })
      .finally(() => setLoading(false));
  }, [roleId]);

  const get = (id: string): RuleDto => rules[id] ?? emptyRule(id);
  const patch = (id: string, change: Partial<RuleDto>) => {
    setMessage(null);
    setRules((prev) => {
      const next = { ...get(id), ...change };
      // Создавать, менять и удалять можно только то, что видишь
      if (next.canCreate || next.canUpdate || next.canDelete) next.canRead = true;
      return { ...prev, [id]: next };
    });
  };
  const toggleField = (id: string, list: 'hiddenFields' | 'readonlyFields', key: string, on: boolean) => {
    const current = get(id)[list];
    const other = list === 'hiddenFields' ? 'readonlyFields' : 'hiddenFields';
    const change: Partial<RuleDto> = { [list]: on ? [...current, key] : current.filter((k) => k !== key) };
    if (on && list === 'hiddenFields') change[other] = get(id)[other].filter((k) => k !== key);
    patch(id, change);
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/roles/${roleId}/entity-access`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules: Object.values(rules) }),
      });
      const data = await res.json().catch(() => ({}));
      setMessage(res.ok ? { tone: 'ok', text: 'Доступ к сущностям сохранён' } : { tone: 'err', text: data.error || 'Не удалось сохранить' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-xs text-ink-faint">Загрузка…</p>;
  if (fullAccess) return <p className="text-xs text-ink-muted">У этой роли полный доступ ко всем сущностям — отдельно настраивать нечего.</p>;
  if (templates.length === 0) return <p className="text-xs text-ink-faint">Сущностей пока нет.</p>;

  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-muted">
        Без отметок у роли нет доступа к сущности. Создание, изменение и удаление включают просмотр.
      </p>
      {templates.map((t) => {
        const rule = get(t.id);
        const expanded = open === t.id;
        return (
          <div key={t.id} className="rounded-lg border border-line p-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px] font-medium text-ink">{t.namePlural}</span>
              <button type="button" className="text-xs text-brand hover:underline" onClick={() => setOpen(expanded ? null : t.id)}>
                {expanded ? 'Свернуть' : 'Поля и записи'}
              </button>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
              <Checkbox label="Просмотр" checked={rule.canRead} onChange={(v) => patch(t.id, v ? { canRead: true } : { canRead: false, canCreate: false, canUpdate: false, canDelete: false })} />
              <Checkbox label="Создание" checked={rule.canCreate} onChange={(v) => patch(t.id, { canCreate: v })} />
              <Checkbox label="Изменение" checked={rule.canUpdate} onChange={(v) => patch(t.id, { canUpdate: v })} />
              <Checkbox label="Удаление" checked={rule.canDelete} onChange={(v) => patch(t.id, { canDelete: v })} />
            </div>
            {expanded && (
              <div className="mt-2 space-y-2 border-t border-line pt-2">
                <Select label="Какие записи видны" value={rule.rowScope} onChange={(e) => patch(t.id, { rowScope: e.target.value as 'all' | 'own' })}>
                  <option value="all">Все записи</option>
                  <option value="own">Только созданные самим сотрудником</option>
                </Select>
                <div>
                  <p className="mb-1 text-xs font-medium text-ink">Поля</p>
                  <div className="space-y-0.5">
                    {t.fields.map((f) => (
                      <div key={f.key} className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[13px] text-ink">{f.label}</span>
                        <span className="flex gap-3">
                          <Checkbox label="скрыто" checked={rule.hiddenFields.includes(f.key)} onChange={(v) => toggleField(t.id, 'hiddenFields', f.key, v)} />
                          <Checkbox label="только чтение" checked={rule.readonlyFields.includes(f.key)} onChange={(v) => toggleField(t.id, 'readonlyFields', f.key, v)} />
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {message && <p className={message.tone === 'ok' ? 'text-xs text-success' : 'text-xs text-danger'}>{message.text}</p>}
      <Button variant="secondary" onClick={save} loading={saving}>
        Сохранить доступ к сущностям
      </Button>
    </div>
  );
}
