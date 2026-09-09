'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Link2, Plus, Trash2, XCircle } from 'lucide-react';
import Button from '../ui/Button';
import Checkbox from '../ui/Checkbox';
import EmptyState from '../ui/EmptyState';
import Input from '../ui/Input';
import Select from '../ui/Select';
import SlideOver from '../ui/SlideOver';
import AttachmentsSection from '../attachments/AttachmentsSection';
import { recordLabel } from '../entities/types';
import type { EntityRecordDef, EntityTemplateDef } from '../entities/types';
import type { ProcessInstanceDef, ProcessInstanceWithHistory, ProcessTemplateDef } from '../processes/types';
import type { TaskDef } from '../tasks/types';

const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function ProcessBoardClient({ templateKey }: { templateKey: string }) {
  const [template, setTemplate] = useState<ProcessTemplateDef | null>(null);
  const [instances, setInstances] = useState<ProcessInstanceDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [saving, setSaving] = useState(false);

  // Необязательная связь нового дела с записью сущности (Р-36)
  const [entityTemplates, setEntityTemplates] = useState<EntityTemplateDef[] | null>(null);
  const [linkTemplateKey, setLinkTemplateKey] = useState('');
  const [linkRecords, setLinkRecords] = useState<EntityRecordDef[]>([]);
  const [linkRecordId, setLinkRecordId] = useState('');

  const [detail, setDetail] = useState<ProcessInstanceWithHistory | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  // Задачи, заведённые по этому делу — только для чтения здесь (Р-37)
  const [detailTasks, setDetailTasks] = useState<TaskDef[]>([]);

  // Перетаскивание карточки между этапами мышью
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/processes/${templateKey}/instances`);
    if (!res.ok) {
      setTemplate(null);
      setLoading(false);
      return;
    }
    const body = await res.json();
    setTemplate(body.template);
    setInstances(body.instances);
    setLoading(false);
  }, [templateKey]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (id: string) => {
    const res = await fetch(`/api/process-instances/${id}`);
    if (res.ok) {
      setDetail(await res.json());
      setDetailOpen(true);
    }
    setDetailTasks([]);
    fetch(`/api/tasks?processInstanceId=${id}&includeDone=1`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setDetailTasks);
  };

  const openCreate = () => {
    setNewTitle('');
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

  const createInstance = async () => {
    if (!newTitle.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/processes/${templateKey}/instances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle, entityRecordId: linkRecordId || undefined }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setBanner({ tone: 'err', text: body.error ?? 'Не удалось создать дело' });
      return;
    }
    setCreating(false);
    setNewTitle('');
    load();
  };

  /** Общий переход на этап — им пользуются и выбор в карточке, и перетаскивание мышью */
  const moveInstance = async (instanceId: string, toStageId: string) => {
    // Оптимистично переносим карточку сразу, не дожидаясь ответа сервера —
    // перетаскивание иначе ощущается медленным. Полная перезагрузка ниже
    // всё равно подтверждает итог.
    setInstances((prev) => prev.map((i) => (i.id === instanceId ? { ...i, currentStageId: toStageId } : i)));

    const res = await fetch(`/api/process-instances/${instanceId}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toStageId }),
    });

    if (!res.ok) {
      load(); // откатываем оптимистичное перемещение, если сервер отказал
      return;
    }
    if (detail?.id === instanceId) await openDetail(instanceId);
    load();
  };

  const move = (toStageId: string) => {
    if (!detail) return;
    moveInstance(detail.id, toStageId);
  };

  const onCardDragStart = (e: React.DragEvent, instanceId: string) => {
    // Кладём id в dataTransfer, а не только в состояние React: между dragstart
    // и drop состояние не гарантированно успевает обновиться до срабатывания
    // обработчика — dataTransfer от такой гонки не зависит.
    e.dataTransfer.setData('text/plain', instanceId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(instanceId);
  };

  const onColumnDrop = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    setDragOverStageId(null);
    const instanceId = e.dataTransfer.getData('text/plain') || draggingId;
    if (instanceId) moveInstance(instanceId, stageId);
    setDraggingId(null);
  };

  const toggleItem = async (stageId: string, itemIndex: number, checked: boolean) => {
    if (!detail) return;
    const res = await fetch(`/api/process-instances/${detail.id}/checklist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stageId, itemIndex, checked }),
    });
    if (res.ok) await openDetail(detail.id);
  };

  const setStatus = async (status: 'done' | 'cancelled') => {
    if (!detail) return;
    const res = await fetch(`/api/process-instances/${detail.id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      setDetailOpen(false);
      setBanner({ tone: 'ok', text: status === 'done' ? 'Дело завершено' : 'Дело отменено' });
      load();
    }
  };

  const removeInstance = async () => {
    if (!detail || !confirm(`Удалить дело «${detail.title}»?`)) return;
    const res = await fetch(`/api/process-instances/${detail.id}`, { method: 'DELETE' });
    if (res.ok) {
      setDetailOpen(false);
      setBanner({ tone: 'ok', text: 'Дело удалено' });
      load();
    }
  };

  if (loading) return null;
  if (!template) {
    return <EmptyState icon={Trash2} title="Процесс не найден" description="Возможно, он был удалён." />;
  }

  const active = instances.filter((i) => i.status === 'active');
  const currentStage = detail ? template.stages.find((s) => s.id === detail.currentStageId) : null;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-ink">{template.name}</h1>
        <Button variant="primary" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Добавить дело
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

      {template.stages.length === 0 && (
        <EmptyState
          icon={Plus}
          title="У процесса нет этапов"
          description="Добавьте этапы в настройках процесса, чтобы можно было заводить дела."
        />
      )}

      {template.stages.length > 0 && (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {template.stages.map((stage) => {
            const cards = active.filter((i) => i.currentStageId === stage.id);
            return (
              <div key={stage.id} className="w-72 shrink-0">
                <div className="mb-2 flex items-center justify-between px-1">
                  <h2 className="text-[13px] font-semibold text-ink">{stage.name}</h2>
                  <span className="text-xs text-ink-muted">{cards.length}</span>
                </div>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragOverStageId !== stage.id) setDragOverStageId(stage.id);
                  }}
                  onDragLeave={() => setDragOverStageId((s) => (s === stage.id ? null : s))}
                  onDrop={(e) => onColumnDrop(e, stage.id)}
                  className={
                    'flex min-h-[64px] flex-col gap-2 rounded-lg p-1 transition-colors ' +
                    (dragOverStageId === stage.id ? 'bg-brand/5 ring-2 ring-brand/30' : '')
                  }
                >
                  {cards.map((instance) => (
                    <div
                      key={instance.id}
                      role="button"
                      tabIndex={0}
                      draggable
                      onDragStart={(e) => onCardDragStart(e, instance.id)}
                      onDragEnd={() => setDraggingId(null)}
                      onClick={() => openDetail(instance.id)}
                      onKeyDown={(e) => e.key === 'Enter' && openDetail(instance.id)}
                      className={
                        'cursor-grab rounded-lg border border-line bg-surface p-3 text-left transition-colors hover:border-brand/50 hover:bg-surface-muted active:cursor-grabbing ' +
                        (draggingId === instance.id ? 'opacity-40' : '')
                      }
                    >
                      <p className="text-[13px] font-medium text-ink">{instance.title}</p>
                      {instance.entityRecordLabel && (
                        <p className="mt-1 flex items-center gap-1 text-xs text-brand">
                          <Link2 className="h-3 w-3" /> {instance.entityRecordLabel}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-ink-muted">{dateFormat.format(new Date(instance.createdAt))}</p>
                    </div>
                  ))}
                  {cards.length === 0 && (
                    <div className="rounded-lg border border-dashed border-line p-3 text-xs text-ink-faint">Пусто</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <SlideOver
        open={creating}
        onClose={() => setCreating(false)}
        title="Новое дело"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>
              Отмена
            </Button>
            <Button variant="primary" loading={saving} onClick={createInstance}>
              Создать
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input label="Название" placeholder="Банкет для ООО «Ромашка»" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />

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

      <SlideOver
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={detail?.title ?? ''}
        subtitle={currentStage?.name}
        width="lg"
        footer={
          detail && (
            <>
              <Button variant="ghost" onClick={removeInstance}>
                <Trash2 className="h-4 w-4" /> Удалить
              </Button>
              <Button variant="secondary" onClick={() => setStatus('cancelled')}>
                <XCircle className="h-4 w-4" /> Отменить
              </Button>
              <Button variant="primary" onClick={() => setStatus('done')}>
                <CheckCircle2 className="h-4 w-4" /> Завершить
              </Button>
            </>
          )
        }
      >
        {detail && currentStage && (
          <div className="flex flex-col gap-5">
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-ink">Этап</label>
              <Select value={currentStage.id} onChange={(e) => move(e.target.value)}>
                {template.stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>

            {detail.entityRecordLabel && detail.entityTemplateKey && (
              <Link
                href={`/entities/${detail.entityTemplateKey}`}
                className="flex items-center gap-1.5 text-[13px] text-brand hover:underline"
              >
                <Link2 className="h-3.5 w-3.5" /> {detail.entityRecordLabel}
              </Link>
            )}

            {currentStage.responsible && (
              <p className="text-[13px] text-ink-muted">
                Ответственный: <span className="text-ink">{currentStage.responsible}</span>
              </p>
            )}

            {currentStage.regulation && (
              <div>
                <h3 className="mb-1.5 text-[13px] font-semibold text-ink">Регламент</h3>
                <p className="whitespace-pre-line text-[13px] text-ink-muted">{currentStage.regulation}</p>
              </div>
            )}

            {currentStage.checklist.length > 0 && (
              <div>
                <h3 className="mb-1.5 text-[13px] font-semibold text-ink">Чек-лист</h3>
                <div className="flex flex-col gap-1">
                  {currentStage.checklist.map((item, i) => (
                    <Checkbox
                      key={i}
                      label={item.label}
                      checked={Boolean(detail.checklistState[currentStage.id]?.[i])}
                      onChange={(v) => toggleItem(currentStage.id, i, v)}
                    />
                  ))}
                </div>
              </div>
            )}

            <AttachmentsSection parent={{ processInstanceId: detail.id }} />

            {detailTasks.length > 0 && (
              <div>
                <h3 className="mb-1.5 text-[13px] font-semibold text-ink">Задачи</h3>
                <div className="flex flex-col gap-1">
                  {detailTasks.map((t) => (
                    <p key={t.id} className={'text-[13px] ' + (t.status === 'done' ? 'text-ink-faint line-through' : 'text-ink')}>
                      {t.title}
                      {t.assignee ? ` · ${t.assignee.name}` : ''}
                    </p>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="mb-1.5 text-[13px] font-semibold text-ink">История</h3>
              <div className="flex flex-col gap-1.5">
                {detail.history.map((h) => (
                  <p key={h.id} className="text-xs text-ink-muted">
                    {dateFormat.format(new Date(h.createdAt))} — {h.fromStageId ? 'переход на этап' : 'создано, этап'}{' '}
                    <span className="text-ink">{template.stages.find((s) => s.id === h.toStageId)?.name ?? '—'}</span>
                    {h.actorEmail ? ` · ${h.actorEmail}` : ''}
                  </p>
                ))}
              </div>
            </div>
          </div>
        )}
      </SlideOver>
    </div>
  );
}
