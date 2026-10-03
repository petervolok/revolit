'use client';

import { useCallback, useEffect, useState } from 'react';
import { History, Pencil, Play, Plus, Trash2, X } from 'lucide-react';
import Badge from '../../ui/Badge';
import Button from '../../ui/Button';
import Checkbox from '../../ui/Checkbox';
import Input from '../../ui/Input';
import RowMenu from '../../ui/RowMenu';
import Select from '../../ui/Select';
import SlideOver from '../../ui/SlideOver';
import { ACTION_LABELS, TRIGGER_LABELS } from '../../automations/types';
import type { Action, ActionType, AutomationDef, AutomationRunDef, TriggerType } from '../../automations/types';
import { FILTER_OP_LABELS, opsForType } from '../../entities/query';
import type { FilterOp, RecordFilter } from '../../entities/query';

interface TemplateRef {
  key: string;
  name: string;
  namePlural: string;
  fields: { key: string; label: string; type: string }[];
}

interface Draft {
  name: string;
  description: string;
  enabled: boolean;
  triggerType: TriggerType;
  templateKey: string;
  cron: string;
  conditions: { field: string; op: FilterOp; value: string }[];
  actions: Action[];
}

const EMPTY: Draft = {
  name: '', description: '', enabled: true, triggerType: 'record.created', templateKey: '', cron: '0 9 * * *', conditions: [], actions: [],
};

const dateTime = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });
const textareaClass =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25';

function newAction(type: ActionType, templateKey: string): Action {
  switch (type) {
    case 'set_fields': return { type, fields: {} };
    case 'create_record': return { type, templateKey, fields: {} };
    case 'create_task': return { type, title: '' };
    case 'send_email': return { type, to: '', subject: '', body: '' };
    case 'webhook': return { type, url: '' };
  }
}

/** Правила «событие → условие → действия» и журнал их срабатываний */
export default function AutomationsClient() {
  const [items, setItems] = useState<AutomationDef[]>([]);
  const [templates, setTemplates] = useState<TemplateRef[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [logFor, setLogFor] = useState<AutomationDef | null>(null);
  const [runs, setRuns] = useState<AutomationRunDef[]>([]);

  const load = useCallback(async () => {
    const res = await fetch('/api/automations');
    if (res.ok) {
      const data = await res.json();
      setItems(data.automations);
      setTemplates(data.templates);
      setUsers(data.users);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const notify = (tone: 'ok' | 'err', text: string) => {
    setBanner({ tone, text });
    setTimeout(() => setBanner(null), 5000);
  };

  const isRecordTrigger = draft.triggerType !== 'schedule';
  const template = templates.find((t) => t.key === draft.templateKey);
  const patch = (change: Partial<Draft>) => setDraft((d) => ({ ...d, ...change }));

  const openCreate = () => {
    setEditingId(null);
    setDraft({ ...EMPTY, templateKey: templates[0]?.key ?? '' });
    setFormError('');
    setOpen(true);
  };

  const openEdit = (a: AutomationDef) => {
    setEditingId(a.id);
    setDraft({
      name: a.name,
      description: a.description ?? '',
      enabled: a.enabled,
      triggerType: a.trigger.type,
      templateKey: a.trigger.templateKey ?? templates[0]?.key ?? '',
      cron: a.trigger.cron ?? '0 9 * * *',
      conditions: a.conditions.map((c) => ({ field: c.field, op: c.op, value: Array.isArray(c.value) ? c.value.join(', ') : String(c.value ?? '') })),
      actions: a.actions,
    });
    setFormError('');
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    setFormError('');
    try {
      const conditions: RecordFilter[] = isRecordTrigger && draft.triggerType !== 'record.deleted'
        ? draft.conditions.map((c) => ({ field: c.field, op: c.op, ...(c.op === 'empty' || c.op === 'notEmpty' ? {} : { value: c.op === 'in' ? c.value.split(',').map((x) => x.trim()).filter(Boolean) : c.value }) }))
        : [];
      const payload = {
        name: draft.name,
        description: draft.description,
        enabled: draft.enabled,
        trigger: isRecordTrigger ? { type: draft.triggerType, templateKey: draft.templateKey } : { type: 'schedule', cron: draft.cron },
        conditions,
        actions: draft.actions,
      };
      const res = await fetch(editingId ? `/api/automations/${editingId}` : '/api/automations', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(data.error || 'Не удалось сохранить');
        return;
      }
      setOpen(false);
      notify('ok', editingId ? 'Автоматизация сохранена' : 'Автоматизация создана');
      load();
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (a: AutomationDef) => {
    const res = await fetch(`/api/automations/${a.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !a.enabled }) });
    if (res.ok) load();
    else notify('err', (await res.json().catch(() => ({}))).error || 'Не удалось изменить');
  };

  const remove = async (a: AutomationDef) => {
    if (!confirm(`Удалить автоматизацию «${a.name}» вместе с журналом?`)) return;
    const res = await fetch(`/api/automations/${a.id}`, { method: 'DELETE' });
    if (res.ok) load();
    else notify('err', 'Не удалось удалить');
  };

  const testRun = async (a: AutomationDef) => {
    let recordId: string | undefined;
    if (a.trigger.type !== 'schedule') {
      const entered = prompt('Идентификатор записи, на которой проверить правило (действия будут выполнены по-настоящему)');
      if (!entered) return;
      recordId = entered.trim();
    } else if (!confirm('Выполнить действия правила сейчас по-настоящему?')) return;
    const res = await fetch(`/api/automations/${a.id}/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recordId }) });
    const data = await res.json().catch(() => ({}));
    notify(res.ok && data.status !== 'error' ? 'ok' : 'err', res.ok ? `${data.status === 'ok' ? 'Выполнено' : data.status === 'skipped' ? 'Пропущено' : 'Ошибка'}: ${data.message}` : data.error || 'Не удалось запустить');
    load();
  };

  const showLog = async (a: AutomationDef) => {
    setLogFor(a);
    setRuns([]);
    const res = await fetch(`/api/automations/${a.id}/runs`);
    setRuns(res.ok ? await res.json() : []);
  };

  const setAction = (i: number, next: Action) => patch({ actions: draft.actions.map((a, idx) => (idx === i ? next : a)) });
  const fieldRows = (fields: Record<string, unknown>, onChange: (next: Record<string, unknown>) => void, tpl: TemplateRef | undefined) => {
    const entries = Object.entries(fields);
    return (
      <div className="space-y-1.5">
        {entries.map(([key, value], idx) => (
          <div key={idx} className="flex items-center gap-2">
            <div className="w-40 shrink-0">
              <Select
                value={key}
                onChange={(e) => {
                  const next: Record<string, unknown> = {};
                  entries.forEach(([k, v], j) => (next[j === idx ? e.target.value : k] = v));
                  onChange(next);
                }}
              >
                {(tpl?.fields ?? []).map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </div>
            <Input placeholder="значение или {{record.поле}}" value={String(value ?? '')} onChange={(e) => onChange({ ...fields, [key]: e.target.value })} />
            <button type="button" aria-label="Убрать" className="rounded-md p-1.5 text-ink-muted hover:bg-surface-muted" onClick={() => { const next = { ...fields }; delete next[key]; onChange(next); }}>
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        <Button
          variant="secondary"
          onClick={() => {
            const free = (tpl?.fields ?? []).find((f) => !(f.key in fields));
            if (free) onChange({ ...fields, [free.key]: '' });
          }}
        >
          <Plus className="h-4 w-4" /> Поле
        </Button>
      </div>
    );
  };

  const describeTrigger = (a: AutomationDef) =>
    a.trigger.type === 'schedule'
      ? `По расписанию: ${a.trigger.cron}`
      : `${TRIGGER_LABELS[a.trigger.type]}: ${templates.find((t) => t.key === a.trigger.templateKey)?.namePlural ?? a.trigger.templateKey}`;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-ink">Автоматизации</h2>
          <p className="mt-1 text-sm text-ink-muted">Правила «когда случилось событие и выполнено условие — сделать действия». Работают сами, без участия человека.</p>
        </div>
        <Button variant="primary" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Новая
        </Button>
      </div>

      {banner && (
        <div className={'mb-4 rounded-lg border px-3 py-2.5 text-[13px] ' + (banner.tone === 'ok' ? 'border-success/25 bg-success/[0.07] text-success' : 'border-danger/25 bg-danger/[0.07] text-danger')}>
          {banner.text}
        </div>
      )}

      {loading ? (
        <div className="h-24 animate-pulse rounded-xl border border-line bg-surface-muted" />
      ) : items.length === 0 ? (
        <p className="text-sm text-ink-muted">Автоматизаций пока нет. Например: при создании заказа поставить статус «Новый» и завести задачу менеджеру.</p>
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <div key={a.id} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-ink">{a.name}</h3>
                    <Badge tone={a.enabled ? 'success' : 'neutral'}>{a.enabled ? 'включена' : 'выключена'}</Badge>
                    {a.lastStatus === 'error' && <Badge tone="danger">последний запуск — ошибка</Badge>}
                  </div>
                  <p className="mt-1 text-[13px] text-ink-muted">{describeTrigger(a)}</p>
                  <p className="mt-0.5 text-xs text-ink-faint">
                    Действий: {a.actions.map((x) => ACTION_LABELS[x.type]).join(' → ')} · срабатываний: {a.runCount}
                    {a.lastRunAt ? ` · последнее ${dateTime.format(new Date(a.lastRunAt))}` : ''}
                  </p>
                </div>
                <Checkbox label="Включена" checked={a.enabled} onChange={() => toggle(a)} />
                <RowMenu
                  items={[
                    { label: 'Изменить', icon: <Pencil className="h-4 w-4" />, onClick: () => openEdit(a) },
                    { label: 'Журнал', icon: <History className="h-4 w-4" />, onClick: () => showLog(a) },
                    { label: 'Проверить запуском', icon: <Play className="h-4 w-4" />, onClick: () => testRun(a) },
                    { label: 'Удалить', icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: () => remove(a) },
                  ]}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <SlideOver
        open={open}
        onClose={() => setOpen(false)}
        title={editingId ? 'Изменение автоматизации' : 'Новая автоматизация'}
        width="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Отмена</Button>
            <Button variant="primary" onClick={save} loading={saving}>Сохранить</Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && <div className="rounded-lg border border-danger/25 bg-danger/[0.07] px-3 py-2.5 text-[13px] text-danger">{formError}</div>}
          <Input label="Название" value={draft.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Например: новому заказу — статус и задача" />
          <Input label="Описание" value={draft.description} onChange={(e) => patch({ description: e.target.value })} />
          <Checkbox label="Включена" checked={draft.enabled} onChange={(v) => patch({ enabled: v })} />

          <div className="space-y-2 rounded-lg border border-line p-3">
            <p className="text-[13px] font-semibold text-ink">Когда</p>
            <Select value={draft.triggerType} onChange={(e) => patch({ triggerType: e.target.value as TriggerType })}>
              {(Object.keys(TRIGGER_LABELS) as TriggerType[]).map((t) => (
                <option key={t} value={t}>{TRIGGER_LABELS[t]}</option>
              ))}
            </Select>
            {isRecordTrigger ? (
              <Select label="Сущность" value={draft.templateKey} onChange={(e) => patch({ templateKey: e.target.value, conditions: [], actions: draft.actions.filter((a) => a.type !== 'set_fields') })}>
                {templates.map((t) => (
                  <option key={t.key} value={t.key}>{t.namePlural}</option>
                ))}
              </Select>
            ) : (
              <Input label="Расписание (cron)" hint="Минута час день месяц день-недели, например 0 9 * * 1 — по понедельникам в 9:00" value={draft.cron} onChange={(e) => patch({ cron: e.target.value })} />
            )}
          </div>

          {isRecordTrigger && draft.triggerType !== 'record.deleted' && (
            <div className="space-y-2 rounded-lg border border-line p-3">
              <p className="text-[13px] font-semibold text-ink">Если (необязательно)</p>
              {draft.conditions.map((c, i) => {
                const def = template?.fields.find((f) => f.key === c.field);
                const ops = opsForType((def?.type ?? 'system') as never);
                return (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <div className="w-40">
                      <Select value={c.field} onChange={(e) => patch({ conditions: draft.conditions.map((x, j) => (j === i ? { field: e.target.value, op: opsForType((template?.fields.find((f) => f.key === e.target.value)?.type ?? 'system') as never)[0], value: '' } : x)) })}>
                        {(template?.fields ?? []).map((f) => (
                          <option key={f.key} value={f.key}>{f.label}</option>
                        ))}
                      </Select>
                    </div>
                    <div className="w-36">
                      <Select value={c.op} onChange={(e) => patch({ conditions: draft.conditions.map((x, j) => (j === i ? { ...x, op: e.target.value as FilterOp } : x)) })}>
                        {ops.map((o) => (
                          <option key={o} value={o}>{FILTER_OP_LABELS[o]}</option>
                        ))}
                      </Select>
                    </div>
                    {c.op !== 'empty' && c.op !== 'notEmpty' && (
                      <div className="w-44">
                        <Input value={c.value} placeholder={c.op === 'in' ? 'через запятую' : 'значение'} onChange={(e) => patch({ conditions: draft.conditions.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} />
                      </div>
                    )}
                    <button type="button" aria-label="Убрать условие" className="rounded-md p-1.5 text-ink-muted hover:bg-surface-muted" onClick={() => patch({ conditions: draft.conditions.filter((_, j) => j !== i) })}>
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
              <Button
                variant="secondary"
                onClick={() => {
                  const first = template?.fields[0];
                  if (first) patch({ conditions: [...draft.conditions, { field: first.key, op: opsForType(first.type as never)[0], value: '' }] });
                }}
              >
                <Plus className="h-4 w-4" /> Условие
              </Button>
            </div>
          )}

          <div className="space-y-3 rounded-lg border border-line p-3">
            <p className="text-[13px] font-semibold text-ink">Что сделать</p>
            <p className="text-xs text-ink-muted">В значениях можно подставлять данные записи: {'{{record.название-поля}}'}, а также {'{{now}}'}, {'{{today}}'}.</p>
            {draft.actions.map((a, i) => (
              <div key={i} className="space-y-2 rounded-lg border border-line bg-surface-muted/40 p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium text-ink">{i + 1}. {ACTION_LABELS[a.type]}</span>
                  <button type="button" aria-label="Убрать действие" className="rounded-md p-1 text-ink-muted hover:bg-surface-muted" onClick={() => patch({ actions: draft.actions.filter((_, j) => j !== i) })}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {a.type === 'set_fields' && fieldRows(a.fields, (fields) => setAction(i, { ...a, fields }), template)}
                {a.type === 'create_record' && (
                  <>
                    <Select label="Сущность" value={a.templateKey} onChange={(e) => setAction(i, { ...a, templateKey: e.target.value, fields: {} })}>
                      {templates.map((t) => (
                        <option key={t.key} value={t.key}>{t.namePlural}</option>
                      ))}
                    </Select>
                    {fieldRows(a.fields, (fields) => setAction(i, { ...a, fields }), templates.find((t) => t.key === a.templateKey))}
                  </>
                )}
                {a.type === 'create_task' && (
                  <>
                    <Input label="Название задачи" value={a.title} onChange={(e) => setAction(i, { ...a, title: e.target.value })} />
                    <Input label="Описание" value={a.description ?? ''} onChange={(e) => setAction(i, { ...a, description: e.target.value })} />
                    <Select label="Исполнитель" value={a.assigneeId ?? ''} onChange={(e) => setAction(i, { ...a, assigneeId: e.target.value })}>
                      <option value="">Не назначен</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </Select>
                    <Input label="Срок, дней" type="number" min={0} value={a.dueInDays ?? ''} onChange={(e) => setAction(i, { ...a, dueInDays: e.target.value === '' ? undefined : Number(e.target.value) })} />
                  </>
                )}
                {a.type === 'send_email' && (
                  <>
                    <Input label="Кому" placeholder="адрес или {{record.email}}" value={a.to} onChange={(e) => setAction(i, { ...a, to: e.target.value })} />
                    <Input label="Тема" value={a.subject} onChange={(e) => setAction(i, { ...a, subject: e.target.value })} />
                    <div>
                      <label className="mb-1.5 block text-[13px] font-medium text-ink">Текст</label>
                      <textarea className={textareaClass} rows={4} value={a.body} onChange={(e) => setAction(i, { ...a, body: e.target.value })} />
                    </div>
                  </>
                )}
                {a.type === 'webhook' && (
                  <>
                    <Input label="Адрес" placeholder="https://…" value={a.url} onChange={(e) => setAction(i, { ...a, url: e.target.value })} />
                    <Input label="Секрет для подписи (необязательно)" hint="Подпись HMAC-SHA256 приходит в заголовке X-Revolit-Signature" value={a.secret ?? ''} onChange={(e) => setAction(i, { ...a, secret: e.target.value })} />
                    <div>
                      <label className="mb-1.5 block text-[13px] font-medium text-ink">Тело (необязательно)</label>
                      <textarea className={textareaClass} rows={3} placeholder="Пусто — уйдёт событие и данные записи в JSON" value={a.body ?? ''} onChange={(e) => setAction(i, { ...a, body: e.target.value })} />
                    </div>
                  </>
                )}
              </div>
            ))}
            <Select
              value=""
              onChange={(e) => {
                if (e.target.value) patch({ actions: [...draft.actions, newAction(e.target.value as ActionType, templates[0]?.key ?? '')] });
              }}
            >
              <option value="">+ Добавить действие…</option>
              {(Object.keys(ACTION_LABELS) as ActionType[])
                .filter((t) => t !== 'set_fields' || (isRecordTrigger && draft.triggerType !== 'record.deleted'))
                .map((t) => (
                  <option key={t} value={t}>{ACTION_LABELS[t]}</option>
                ))}
            </Select>
          </div>
        </div>
      </SlideOver>

      <SlideOver open={Boolean(logFor)} onClose={() => setLogFor(null)} title={`Журнал: ${logFor?.name ?? ''}`}>
        {runs.length === 0 ? (
          <p className="text-sm text-ink-muted">Срабатываний пока не было.</p>
        ) : (
          <div className="space-y-2">
            {runs.map((r) => (
              <div key={r.id} className="rounded-lg border border-line p-2.5 text-[13px]">
                <div className="flex items-center justify-between gap-2">
                  <Badge tone={r.status === 'ok' ? 'success' : r.status === 'error' ? 'danger' : 'neutral'}>{r.status === 'ok' ? 'выполнено' : r.status === 'error' ? 'ошибка' : 'пропущено'}</Badge>
                  <span className="text-xs text-ink-faint">{dateTime.format(new Date(r.startedAt))} · {r.durationMs} мс</span>
                </div>
                {r.steps.map((s, i) => (
                  <p key={i} className={s.ok ? 'mt-1 text-ink-muted' : 'mt-1 text-danger'}>{ACTION_LABELS[s.type as ActionType] ?? s.type}: {s.message}</p>
                ))}
                {r.steps.length === 0 && r.message && <p className="mt-1 text-ink-muted">{r.message}</p>}
              </div>
            ))}
          </div>
        )}
      </SlideOver>
    </div>
  );
}
