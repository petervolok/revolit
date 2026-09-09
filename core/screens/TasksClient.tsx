'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Circle, Link2, ListTodo, Plus, Trash2 } from 'lucide-react';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import Input from '../ui/Input';
import RowMenu from '../ui/RowMenu';
import Select from '../ui/Select';
import SlideOver from '../ui/SlideOver';
import AttachmentsSection from '../attachments/AttachmentsSection';
import { recordLabel } from '../entities/types';
import type { EntityRecordDef, EntityTemplateDef } from '../entities/types';
import type { TaskDef } from '../tasks/types';

type TaskDefLocal = TaskDef;

const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });

interface ProgramUser {
  id: string;
  name: string;
}

function dueTone(task: TaskDefLocal): 'overdue' | 'today' | 'normal' | null {
  if (!task.dueAt || task.status === 'done') return null;
  const due = new Date(task.dueAt);
  const now = new Date();
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (dueDay < today) return 'overdue';
  if (dueDay.getTime() === today.getTime()) return 'today';
  return 'normal';
}

export default function TasksClient({ currentUserId }: { currentUserId: string }) {
  const [tasks, setTasks] = useState<TaskDefLocal[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [includeDone, setIncludeDone] = useState(false);
  const [users, setUsers] = useState<ProgramUser[]>([]);
  const [banner, setBanner] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [saving, setSaving] = useState(false);

  const [detailTask, setDetailTask] = useState<TaskDefLocal | null>(null);

  const [entityTemplates, setEntityTemplates] = useState<EntityTemplateDef[] | null>(null);
  const [linkTemplateKey, setLinkTemplateKey] = useState('');
  const [linkRecords, setLinkRecords] = useState<EntityRecordDef[]>([]);
  const [linkRecordId, setLinkRecordId] = useState('');

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (scope === 'mine') params.set('assignee', 'me');
    if (includeDone) params.set('includeDone', '1');
    const res = await fetch(`/api/tasks?${params.toString()}`);
    setTasks(res.ok ? await res.json() : []);
    setLoading(false);
  }, [scope, includeDone]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch('/api/tasks/users')
      .then((res) => (res.ok ? res.json() : []))
      .then(setUsers);
  }, []);

  const openCreate = () => {
    setTitle('');
    setDescription('');
    setAssigneeId(currentUserId);
    setDueAt('');
    setLinkTemplateKey('');
    setLinkRecords([]);
    setLinkRecordId('');
    setCreating(true);
    if (!entityTemplates) {
      fetch('/api/entities')
        .then((res) => (res.ok ? res.json() : []))
        .then(setEntityTemplates);
    }
  };

  const onLinkTemplateChange = async (key: string) => {
    setLinkTemplateKey(key);
    setLinkRecordId('');
    if (!key) {
      setLinkRecords([]);
      return;
    }
    const res = await fetch(`/api/entities/${key}/records`);
    const body = res.ok ? await res.json() : { records: [] };
    setLinkRecords(body.records ?? []);
  };

  const create = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        description: description || undefined,
        assigneeId: assigneeId || undefined,
        dueAt: dueAt || undefined,
        entityRecordId: linkRecordId || undefined,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setBanner({ tone: 'err', text: body.error ?? 'Не удалось создать задачу' });
      return;
    }
    setCreating(false);
    load();
  };

  const toggleDone = async (task: TaskDefLocal) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: t.status === 'done' ? 'open' : 'done' } : t))
    );
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: task.status === 'done' ? 'open' : 'done' }),
    });
    if (!res.ok) load();
    else if (!includeDone && task.status !== 'done') {
      // Задачу только что отметили выполненной, а завершённые скрыты — убираем из списка
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
    }
  };

  const remove = async (task: TaskDefLocal) => {
    if (!confirm(`Удалить задачу «${task.title}»?`)) return;
    const res = await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
    if (res.ok) {
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
    }
  };

  if (loading) return null;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-ink">Задачи</h1>
        <Button variant="primary" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Добавить задачу
        </Button>
      </div>

      <p className="mb-4 text-[13px] text-ink-muted">
        Срок подсвечивается, когда вы сами открываете этот раздел — почтовых и push-напоминаний
        о наступлении срока нет.
      </p>

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

      <div className="mb-4 flex items-center gap-4">
        <div className="flex rounded-lg border border-line p-0.5 text-[13px]">
          <button
            onClick={() => setScope('mine')}
            className={`rounded-md px-3 py-1.5 transition-colors ${scope === 'mine' ? 'bg-surface-muted text-ink' : 'text-ink-muted'}`}
          >
            Мои
          </button>
          <button
            onClick={() => setScope('all')}
            className={`rounded-md px-3 py-1.5 transition-colors ${scope === 'all' ? 'bg-surface-muted text-ink' : 'text-ink-muted'}`}
          >
            Все
          </button>
        </div>
        <label className="flex items-center gap-1.5 text-[13px] text-ink-muted">
          <input type="checkbox" checked={includeDone} onChange={(e) => setIncludeDone(e.target.checked)} />
          Показывать выполненные
        </label>
      </div>

      {tasks.length === 0 && (
        <EmptyState icon={ListTodo} title="Задач пока нет" description="Добавьте первую задачу — себе или коллеге." />
      )}

      <div className="flex flex-col gap-2">
        {tasks.map((task) => {
          const tone = dueTone(task);
          return (
            <div
              key={task.id}
              className={
                'flex items-start gap-3 rounded-xl border p-3.5 ' +
                (tone === 'overdue' ? 'border-danger/30 bg-danger/5' : 'border-line')
              }
            >
              <button onClick={() => toggleDone(task)} className="mt-0.5 shrink-0 text-ink-faint hover:text-brand">
                {task.status === 'done' ? <CheckCircle2 className="h-5 w-5 text-success" /> : <Circle className="h-5 w-5" />}
              </button>
              <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setDetailTask(task)}>
                <p className={`text-[13px] font-medium ${task.status === 'done' ? 'text-ink-faint line-through' : 'text-ink'}`}>
                  {task.title}
                </p>
                {task.description && <p className="mt-0.5 text-xs text-ink-muted">{task.description}</p>}
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  {task.dueAt && (
                    <span className={tone === 'overdue' ? 'font-medium text-danger' : tone === 'today' ? 'font-medium text-brand' : 'text-ink-muted'}>
                      {tone === 'overdue' ? 'Просрочено · ' : tone === 'today' ? 'Сегодня · ' : ''}
                      {dateFormat.format(new Date(task.dueAt))}
                    </span>
                  )}
                  {task.assignee && <span className="text-ink-muted">{task.assignee.name}</span>}
                  {task.entityRecordLabel && task.entityTemplateKey && (
                    <Link href={`/entities/${task.entityTemplateKey}`} className="flex items-center gap-1 text-brand hover:underline">
                      <Link2 className="h-3 w-3" /> {task.entityRecordLabel}
                    </Link>
                  )}
                  {task.processInstanceTitle && task.processTemplateKey && (
                    <Link href={`/processes/${task.processTemplateKey}`} className="flex items-center gap-1 text-brand hover:underline">
                      <Link2 className="h-3 w-3" /> {task.processInstanceTitle}
                    </Link>
                  )}
                </div>
              </div>
              <RowMenu items={[{ label: 'Удалить', icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: () => remove(task) }]} />
            </div>
          );
        })}
      </div>

      <SlideOver
        open={creating}
        onClose={() => setCreating(false)}
        title="Новая задача"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>
              Отмена
            </Button>
            <Button variant="primary" loading={saving} onClick={create}>
              Создать
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input label="Название" placeholder="Позвонить клиенту" value={title} onChange={(e) => setTitle(e.target.value)} />
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-ink">Описание (необязательно)</label>
            <textarea
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-ink">Исполнитель</label>
            <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">Не назначен</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </div>
          <Input label="Срок (необязательно)" type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />

          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-ink">Связать с записью (необязательно)</label>
            <Select value={linkTemplateKey} onChange={(e) => onLinkTemplateChange(e.target.value)}>
              <option value="">Не связывать</option>
              {(entityTemplates ?? []).map((t) => (
                <option key={t.key} value={t.key}>
                  {t.namePlural}
                </option>
              ))}
            </Select>
          </div>

          {linkTemplateKey && (
            <Select value={linkRecordId} onChange={(e) => setLinkRecordId(e.target.value)}>
              <option value="">Выберите запись</option>
              {linkRecords.map((r) => {
                const fields = entityTemplates?.find((t) => t.key === linkTemplateKey)?.fields ?? [];
                return (
                  <option key={r.id} value={r.id}>
                    {recordLabel(r, fields)}
                  </option>
                );
              })}
            </Select>
          )}
        </div>
      </SlideOver>

      <SlideOver open={detailTask !== null} onClose={() => setDetailTask(null)} title={detailTask?.title ?? ''}>
        {detailTask && (
          <div className="flex flex-col gap-5">
            {detailTask.description && <p className="text-[13px] text-ink-muted">{detailTask.description}</p>}
            <AttachmentsSection parent={{ taskId: detailTask.id }} />
          </div>
        )}
      </SlideOver>
    </div>
  );
}
