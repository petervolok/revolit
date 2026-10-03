/**
 * Исполнитель автоматизаций (строка 8 таблицы покрытия). Подписывается на события ядра — создание,
 * изменение и удаление записей (их выводит слой данных после подтверждённой записи, в режимах direct и
 * bus одинаково) и срабатывание расписания — и выполняет подходящие правила.
 *
 * Защита от зацикливания: автоматизация меняет запись → это событие «запись изменена» → она же могла
 * бы сработать снова. Поэтому (1) в одной цепочке вызовов (AsyncLocalStorage) та же автоматизация
 * повторно не запускается и глубина цепочки ограничена; (2) «изменить поля» не пишет в базу, если значения
 * уже такие — повторное срабатывание затухает само, и это же спасает в режиме bus, где события приходят
 * из другого процесса и цепочку вызовов не видно; (3) не больше 60 срабатываний в минуту на правило.
 */
import { AsyncLocalStorage } from 'async_hooks';
import { prisma } from '../data/prisma';
import { newId } from '../data/ids';
import { coreEvents } from '../events/coreEvents';
import { createRecord, getTemplate, updateRecord } from '../entities/service';
import { recordMatches } from '../entities/query';
import type { EntityRecordDef, EntityTemplateDef } from '../entities/types';
import { sendMail } from '../ports/mail';
import { createTask } from '../tasks/service';
import { callWebhook } from './webhook';
import { render, renderText, withClock } from './template';
import type { TemplateContext } from './template';
import { toDef } from './service';
import type { Action, AutomationDef, RunStep } from './types';

const MAX_DEPTH = 3;
const BREAKER_LIMIT = 60;
const BREAKER_WINDOW_MS = 60_000;
const KEEP_RUNS = 200;
const CACHE_TTL_MS = 5_000;

type LoadedAutomation = AutomationDef & { createdById: string | null };
interface Shared {
  chainStore: AsyncLocalStorage<{ chain: string[] }>;
  breaker: Map<string, number[]>;
  enabledCache: Map<string, { at: number; list: LoadedAutomation[] }>;
}

// Одно состояние на процесс: Next собирает модуль в несколько бандлов (маршруты, instrumentation), и без
// общего состояния отмена кэша в маршруте не дошла бы до исполнителя, а цепочка вызовов потерялась бы
const globalShared = globalThis as unknown as { __revolitAutomationShared?: Shared };
const shared: Shared = (globalShared.__revolitAutomationShared ??= {
  chainStore: new AsyncLocalStorage(),
  breaker: new Map(),
  enabledCache: new Map(),
});
const { chainStore, breaker, enabledCache } = shared;

/** Только для проверок: сбросить память процесса */
export function resetEngineState(): void {
  breaker.clear();
  enabledCache.clear();
}

export function invalidateAutomationCache(programId?: string): void {
  if (programId) enabledCache.delete(programId);
  else enabledCache.clear();
}

export interface RunResult {
  status: 'ok' | 'error' | 'skipped';
  message: string;
  steps: RunStep[];
}

interface Subject {
  event: string;
  record?: EntityRecordDef;
  template?: EntityTemplateDef;
}

type Loaded = LoadedAutomation;

async function loadEnabled(programId: string): Promise<Loaded[]> {
  const hit = enabledCache.get(programId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.list;
  const rows = await prisma.automation.findMany({ where: { programId, enabled: true } });
  const list = rows.map((r) => ({ ...toDef(r), createdById: r.createdById }));
  enabledCache.set(programId, { at: Date.now(), list });
  return list;
}

function tooOften(id: string, now = Date.now()): boolean {
  const recent = (breaker.get(id) ?? []).filter((t) => now - t < BREAKER_WINDOW_MS);
  recent.push(now);
  breaker.set(id, recent);
  return recent.length > BREAKER_LIMIT;
}

function sameValue(a: unknown, b: unknown): boolean {
  const empty = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
  if (empty(a) && empty(b)) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Env {
  programId: string;
  auto: Loaded;
  ctx: TemplateContext;
  subject: Subject;
}

/** Выполняет одно действие и возвращает описание результата */
async function execute(action: Action, env: Env): Promise<string> {
  const { programId, auto, subject } = env;
  switch (action.type) {
    case 'set_fields': {
      const { record, template } = subject;
      if (!record || !template) throw new Error('Нет записи, поля которой нужно менять');
      const current = await prisma.entityRecord.findFirst({ where: { id: record.id, programId } });
      if (!current) throw new Error('Запись уже удалена');
      const data = current.data as Record<string, unknown>;
      const values = render(action.fields, env.ctx) as Record<string, unknown>;

      const changed = Object.keys(values).filter((k) => !sameValue(data[k], values[k]));
      if (changed.length === 0) return 'значения уже такие, запись не менялась';

      const updated = await updateRecord(programId, template.key, record.id, { ...data, ...values });
      env.ctx.record = { id: updated.id, ...updated.data };
      return `изменены поля: ${changed.join(', ')}`;
    }
    case 'create_record': {
      const created = await createRecord(programId, action.templateKey, render(action.fields, env.ctx) as Record<string, unknown>);
      return `создана запись ${created.id}`;
    }
    case 'create_task': {
      if (!auto.createdById) throw new Error('У автоматизации нет автора, от имени которого заводить задачи');
      const assignee = action.assigneeId ? renderText(action.assigneeId, env.ctx).trim() : '';
      const task = await createTask(programId, auto.createdById, {
        title: renderText(action.title, env.ctx),
        ...(action.description ? { description: renderText(action.description, env.ctx) } : {}),
        ...(assignee ? { assigneeId: assignee } : {}),
        ...(action.dueInDays !== undefined ? { dueAt: new Date(Date.now() + action.dueInDays * 86400_000).toISOString() } : {}),
        ...(subject.record && subject.event !== 'record.deleted' ? { entityRecordId: subject.record.id } : {}),
      });
      return `создана задача «${task.title}»`;
    }
    case 'send_email': {
      const to = renderText(action.to, env.ctx).trim();
      if (!EMAIL_RE.test(to)) throw new Error(`Получатель «${to || 'пусто'}» — не адрес почты`);
      await sendMail({ to, subject: renderText(action.subject, env.ctx), text: renderText(action.body, env.ctx) });
      return `письмо отправлено на ${to}`;
    }
    case 'webhook': {
      const body = action.body
        ? renderText(action.body, env.ctx)
        : JSON.stringify({
            event: subject.event,
            automation: { id: auto.id, name: auto.name },
            template: subject.template ? { key: subject.template.key, name: subject.template.name } : undefined,
            record: subject.record ? { id: subject.record.id, data: subject.record.data } : undefined,
            timestamp: new Date().toISOString(),
          });
      const { status } = await callWebhook(action.url, body, { secret: action.secret, event: subject.event });
      return `вебхук вызван, ответ ${status}`;
    }
  }
}

async function saveRun(auto: Loaded, programId: string, startedAt: number, recordId: string | undefined, result: RunResult): Promise<void> {
  try {
    await prisma.automationRun.create({
      data: {
        id: newId(), automationId: auto.id, programId, status: result.status, durationMs: Date.now() - startedAt,
        recordId: recordId ?? null, message: result.message.slice(0, 500), steps: result.steps as object[],
      },
    });
    await prisma.automation.update({ where: { id: auto.id }, data: { runCount: { increment: 1 }, lastRunAt: new Date(), lastStatus: result.status } });
    // Журнал не растёт бесконечно: хранятся последние KEEP_RUNS срабатываний
    const count = await prisma.automationRun.count({ where: { automationId: auto.id } });
    if (count > KEEP_RUNS + 50) {
      const old = await prisma.automationRun.findMany({ where: { automationId: auto.id }, orderBy: { startedAt: 'desc' }, skip: KEEP_RUNS, select: { id: true } });
      if (old.length > 0) await prisma.automationRun.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
    }
  } catch (error) {
    console.error('[автоматизации] не удалось записать журнал', error);
  }
}

/**
 * Выполняет автоматизацию по событию. null — условия не выполнены (в журнал не пишется: иначе каждое
 * изменение любой записи оставляло бы след). Остальное — выполнено, пропущено защитой или завершилось ошибкой.
 */
export async function runAutomation(auto: Loaded, subject: Subject, programId: string): Promise<RunResult | null> {
  const store = chainStore.getStore();
  const chain = store?.chain ?? [];
  const startedAt = Date.now();
  const recordId = subject.record?.id;

  // Своё же изменение запускает ту же автоматизацию повторно — это ожидаемо, в журнал не пишется
  if (chain.includes(auto.id)) return { status: 'skipped', message: 'Повторный запуск из собственного действия пропущен (защита от зацикливания)', steps: [] };
  if (chain.length >= MAX_DEPTH) {
    const result: RunResult = { status: 'skipped', message: 'Цепочка автоматизаций слишком длинная — пропущено', steps: [] };
    await saveRun(auto, programId, startedAt, recordId, result);
    return result;
  }

  if (subject.record && subject.template && auto.conditions.length > 0 && !recordMatches(subject.record, subject.template.fields, auto.conditions)) {
    return null;
  }

  if (tooOften(auto.id)) {
    const result: RunResult = { status: 'skipped', message: `Больше ${BREAKER_LIMIT} срабатываний в минуту — пропущено (защита от лавины)`, steps: [] };
    await saveRun(auto, programId, startedAt, recordId, result);
    return result;
  }

  const env: Env = {
    programId, auto, subject,
    ctx: withClock({
      event: subject.event,
      automation: { id: auto.id, name: auto.name },
      ...(subject.template ? { template: { key: subject.template.key, name: subject.template.name } } : {}),
      ...(subject.record ? { record: { id: subject.record.id, ...subject.record.data } } : {}),
    }),
  };

  const steps: RunStep[] = [];
  let failed = false;
  await chainStore.run({ chain: [...chain, auto.id] }, async () => {
    for (const action of auto.actions) {
      try {
        steps.push({ type: action.type, ok: true, message: await execute(action, env) });
      } catch (error) {
        steps.push({ type: action.type, ok: false, message: (error as Error).message || 'Ошибка' });
        failed = true;
        break; // следующие действия после сбоя не выполняются
      }
    }
  });

  const result: RunResult = failed
    ? { status: 'error', message: steps[steps.length - 1].message, steps }
    : { status: 'ok', message: steps.map((s) => s.message).join('; '), steps };
  await saveRun(auto, programId, startedAt, recordId, result);
  return result;
}

async function loadRecord(programId: string, recordId: string): Promise<EntityRecordDef | null> {
  const row = await prisma.entityRecord.findFirst({ where: { id: recordId, programId } });
  if (!row) return null;
  return {
    id: row.id, data: row.data as Record<string, unknown>, createdById: row.createdById,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  };
}

async function templateById(programId: string, templateId: string): Promise<EntityTemplateDef | null> {
  const row = await prisma.entityTemplate.findFirst({ where: { id: templateId, programId }, select: { key: true } });
  return row ? getTemplate(programId, row.key) : null;
}

/** Событие записи: находит подходящие автоматизации и запускает их */
export async function processRecordEvent(
  kind: 'created' | 'updated' | 'deleted',
  payload: { programId: string; recordId: string; templateId?: string }
): Promise<void> {
  const list = await loadEnabled(payload.programId);
  const candidates = list.filter((a) => a.trigger.type === `record.${kind}`);
  if (candidates.length === 0 || !payload.templateId) return;

  const template = await templateById(payload.programId, payload.templateId);
  if (!template) return;
  const matching = candidates.filter((a) => a.trigger.templateKey === template.key);
  if (matching.length === 0) return;

  const record = kind === 'deleted' ? ({ id: payload.recordId, data: {}, createdAt: '', updatedAt: '' } as EntityRecordDef) : await loadRecord(payload.programId, payload.recordId);
  if (!record) return;

  for (const auto of matching) {
    await runAutomation(auto, { event: `record.${kind}`, record, template }, payload.programId).catch((error) => {
      console.error(`[автоматизации] «${auto.name}» упала`, error);
    });
  }
}

/** Срабатывание расписания: задача планировщика с ключом automation.<id> */
export async function processSchedule(payload: { programId: string; jobKey: string }): Promise<void> {
  if (!payload.jobKey.startsWith('automation.')) return;
  const id = payload.jobKey.slice('automation.'.length);
  const auto = (await loadEnabled(payload.programId)).find((a) => a.id === id);
  if (!auto || auto.trigger.type !== 'schedule') return;
  await runAutomation(auto, { event: 'schedule' }, payload.programId).catch((error) => {
    console.error(`[автоматизации] «${auto.name}» упала`, error);
  });
}

/** Ручной запуск для проверки правила: по выбранной записи (если нужна) и независимо от того, включено ли оно */
export async function runManually(programId: string, id: string, recordId?: string): Promise<RunResult> {
  const row = await prisma.automation.findFirst({ where: { id, programId } });
  if (!row) throw new Error('Автоматизация не найдена');
  const auto: Loaded = { ...toDef(row), createdById: row.createdById };

  const subject: Subject = { event: auto.trigger.type === 'schedule' ? 'schedule' : auto.trigger.type };
  if (auto.trigger.type !== 'schedule') {
    const template = await getTemplate(programId, auto.trigger.templateKey!);
    if (!template) throw new Error('Сущность автоматизации не найдена');
    subject.template = template;
    if (!recordId) throw new Error('Для этого события укажите запись, на которой проверить правило');
    const record = await loadRecord(programId, recordId);
    if (!record) throw new Error('Запись не найдена');
    subject.record = record;
  }
  const result = await runAutomation(auto, subject, programId);
  return result ?? { status: 'skipped', message: 'Условия правила для этой записи не выполняются', steps: [] };
}

const globalState = globalThis as unknown as { __revolitAutomationEngine?: () => void };

/** Подписывает исполнитель на события ядра. Повторный вызов безопасен; возвращает функцию остановки */
export function startAutomationEngine(): () => void {
  if (globalState.__revolitAutomationEngine) return globalState.__revolitAutomationEngine;
  const offs = [
    coreEvents.on('entity.record.created', (p) => processRecordEvent('created', p)),
    coreEvents.on('entity.record.updated', (p) => processRecordEvent('updated', p)),
    coreEvents.on('entity.record.deleted', (p) => processRecordEvent('deleted', p)),
    coreEvents.on('scheduler.job.fired', (p) => processSchedule(p)),
  ];
  const stop = () => {
    offs.forEach((off) => off());
    globalState.__revolitAutomationEngine = undefined;
  };
  globalState.__revolitAutomationEngine = stop;
  return stop;
}
