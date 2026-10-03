/**
 * Автоматизации — хранение и проверка описаний. Исполнение — в engine.ts.
 * Описание проверяется целиком при сохранении, чтобы в базе не оказалось правила, которое
 * не сработает из-за опечатки в названии сущности или поля.
 */
import { prisma } from '../data/prisma';
import { newId } from '../data/ids';
import { parseCron } from '../scheduler/cron';
import { deleteJob, upsertJob } from '../scheduler/service';
import { FILTER_OPS } from '../entities/query';
import type { FilterOp, RecordFilter } from '../entities/query';
import type { EntityTemplateDef } from '../entities/types';
import { getTemplate } from '../entities/service';
import { assertSafeUrl, WebhookError } from './webhook';
import type { Action, AutomationDef, AutomationInput, AutomationRunDef, RunStep, Trigger, TriggerType } from './types';

export class AutomationError extends Error {
  constructor(message: string, public status: 400 | 404 | 409 = 400) {
    super(message);
  }
}

const NAME_MIN = 2;
const NAME_MAX = 80;
const MAX_PER_PROGRAM = 50;
const MAX_ACTIONS = 10;
const MAX_CONDITIONS = 10;
const TRIGGERS: TriggerType[] = ['record.created', 'record.updated', 'record.deleted', 'schedule'];

/** Ключ задачи планировщика, которая запускает автоматизацию по расписанию */
export const scheduleJobKey = (id: string): string => `automation.${id}`;

type Row = {
  id: string; name: string; description: string | null; enabled: boolean; trigger: unknown; conditions: unknown; actions: unknown;
  runCount: number; lastRunAt: Date | null; lastStatus: string | null; createdAt: Date;
};

export function toDef(r: Row): AutomationDef {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    enabled: r.enabled,
    trigger: r.trigger as Trigger,
    conditions: (r.conditions as RecordFilter[]) ?? [],
    actions: (r.actions as Action[]) ?? [],
    runCount: r.runCount,
    lastRunAt: r.lastRunAt?.toISOString() ?? null,
    lastStatus: r.lastStatus,
    createdAt: r.createdAt.toISOString(),
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

async function templateOf(programId: string, key: unknown, what: string): Promise<EntityTemplateDef> {
  if (typeof key !== 'string' || !key) throw new AutomationError(`${what}: укажите сущность`);
  const template = await getTemplate(programId, key);
  if (!template) throw new AutomationError(`${what}: сущность «${key}» не найдена`);
  return template;
}

function assertFieldKeys(template: EntityTemplateDef, keys: string[], what: string): void {
  for (const key of keys) {
    if (!template.fields.some((f) => f.key === key)) throw new AutomationError(`${what}: у сущности «${template.name}» нет поля «${key}»`);
  }
}

async function parseTrigger(programId: string, raw: unknown): Promise<{ trigger: Trigger; template: EntityTemplateDef | null }> {
  if (!isObj(raw) || typeof raw.type !== 'string' || !TRIGGERS.includes(raw.type as TriggerType)) {
    throw new AutomationError('Укажите событие, по которому срабатывает автоматизация');
  }
  const type = raw.type as TriggerType;
  if (type === 'schedule') {
    const cron = typeof raw.cron === 'string' ? raw.cron.trim() : '';
    if (!parseCron(cron)) throw new AutomationError('Расписание — cron из 5 полей: минута час день месяц день-недели');
    return { trigger: { type, cron }, template: null };
  }
  const template = await templateOf(programId, raw.templateKey, 'Событие');
  return { trigger: { type, templateKey: template.key }, template };
}

function parseConditions(raw: unknown, trigger: Trigger, template: EntityTemplateDef | null): RecordFilter[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new AutomationError('Условия — список');
  if (raw.length === 0) return [];
  if (!template || trigger.type === 'record.deleted') {
    throw new AutomationError('Условия по данным записи доступны для событий «создана» и «изменена»');
  }
  if (raw.length > MAX_CONDITIONS) throw new AutomationError(`Условий не больше ${MAX_CONDITIONS}`);
  return raw.map((item) => {
    if (!isObj(item) || typeof item.field !== 'string' || typeof item.op !== 'string' || !FILTER_OPS.includes(item.op as FilterOp)) {
      throw new AutomationError('Условие должно содержать поле и операцию');
    }
    const system = item.field === 'createdAt' || item.field === 'updatedAt';
    if (!system) assertFieldKeys(template, [item.field], 'Условие');
    return { field: item.field, op: item.op as FilterOp, ...(item.value !== undefined ? { value: item.value } : {}) };
  });
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

async function parseActions(programId: string, raw: unknown, trigger: Trigger, template: EntityTemplateDef | null): Promise<Action[]> {
  if (!Array.isArray(raw) || raw.length === 0) throw new AutomationError('Добавьте хотя бы одно действие');
  if (raw.length > MAX_ACTIONS) throw new AutomationError(`Действий не больше ${MAX_ACTIONS}`);

  const actions: Action[] = [];
  for (const [i, item] of raw.entries()) {
    const at = `Действие ${i + 1}`;
    if (!isObj(item) || typeof item.type !== 'string') throw new AutomationError(`${at}: не указан тип`);
    switch (item.type) {
      case 'set_fields': {
        if (!template || trigger.type === 'record.deleted') throw new AutomationError(`${at}: изменять поля можно у записи, по которой сработало событие «создана» или «изменена»`);
        if (!isObj(item.fields) || Object.keys(item.fields).length === 0) throw new AutomationError(`${at}: укажите, какие поля менять`);
        assertFieldKeys(template, Object.keys(item.fields), at);
        actions.push({ type: 'set_fields', fields: item.fields });
        break;
      }
      case 'create_record': {
        const target = await templateOf(programId, item.templateKey, at);
        const fields = isObj(item.fields) ? item.fields : {};
        assertFieldKeys(target, Object.keys(fields), at);
        actions.push({ type: 'create_record', templateKey: target.key, fields });
        break;
      }
      case 'create_task': {
        const title = str(item.title, 200);
        if (!title) throw new AutomationError(`${at}: укажите название задачи`);
        const dueInDays = item.dueInDays === undefined || item.dueInDays === null || item.dueInDays === '' ? undefined : Number(item.dueInDays);
        if (dueInDays !== undefined && (!Number.isInteger(dueInDays) || dueInDays < 0 || dueInDays > 3650)) throw new AutomationError(`${at}: срок — целое число дней от 0 до 3650`);
        const assigneeId = str(item.assigneeId, 100);
        if (assigneeId && !assigneeId.includes('{{') && !(await prisma.user.findFirst({ where: { id: assigneeId, programId } }))) {
          throw new AutomationError(`${at}: исполнитель не найден`);
        }
        actions.push({ type: 'create_task', title, ...(str(item.description, 2000) ? { description: str(item.description, 2000) } : {}), ...(assigneeId ? { assigneeId } : {}), ...(dueInDays !== undefined ? { dueInDays } : {}) });
        break;
      }
      case 'send_email': {
        const to = str(item.to, 300);
        const subject = str(item.subject, 300);
        const body = str(item.body, 10_000);
        if (!to || !subject || !body) throw new AutomationError(`${at}: укажите получателя, тему и текст письма`);
        actions.push({ type: 'send_email', to, subject, body });
        break;
      }
      case 'webhook': {
        const url = str(item.url, 500);
        try {
          await assertSafeUrl(url);
        } catch (error) {
          throw new AutomationError(`${at}: ${error instanceof WebhookError ? error.message : 'адрес вебхука не проверен'}`);
        }
        const secret = str(item.secret, 200);
        const body = typeof item.body === 'string' && item.body.trim() ? item.body.slice(0, 20_000) : undefined;
        actions.push({ type: 'webhook', url, ...(secret ? { secret } : {}), ...(body ? { body } : {}) });
        break;
      }
      default:
        throw new AutomationError(`${at}: неизвестный тип «${item.type}»`);
    }
  }
  return actions;
}

function cleanName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  if (name.length < NAME_MIN) throw new AutomationError(`Название — не короче ${NAME_MIN} знаков`);
  if (name.length > NAME_MAX) throw new AutomationError(`Название — не длиннее ${NAME_MAX} знаков`);
  return name;
}

/** Задача планировщика для расписания — заводится, пока автоматизация включена, и снимается иначе */
async function syncSchedule(programId: string, id: string, trigger: Trigger, enabled: boolean): Promise<void> {
  if (trigger.type === 'schedule' && enabled) await upsertJob(programId, { key: scheduleJobKey(id), cronExpression: trigger.cron!, enabled: true });
  else await deleteJob(programId, scheduleJobKey(id));
}

export async function listAutomations(programId: string): Promise<AutomationDef[]> {
  const rows = await prisma.automation.findMany({ where: { programId }, orderBy: { createdAt: 'asc' } });
  return rows.map(toDef);
}

export async function getAutomation(programId: string, id: string): Promise<AutomationDef> {
  const row = await prisma.automation.findFirst({ where: { id, programId } });
  if (!row) throw new AutomationError('Автоматизация не найдена', 404);
  return toDef(row);
}

export async function createAutomation(programId: string, userId: string, input: AutomationInput): Promise<AutomationDef> {
  const name = cleanName(input.name);
  const { trigger, template } = await parseTrigger(programId, input.trigger);
  const conditions = parseConditions(input.conditions, trigger, template);
  const actions = await parseActions(programId, input.actions, trigger, template);
  const description = str(input.description, 500) || null;
  const enabled = input.enabled !== false;

  if ((await prisma.automation.count({ where: { programId } })) >= MAX_PER_PROGRAM) {
    throw new AutomationError(`Не больше ${MAX_PER_PROGRAM} автоматизаций в программе`, 409);
  }

  const row = await prisma.automation.create({
    data: { id: newId(), programId, name, description, enabled, createdById: userId, trigger: trigger as object, conditions: conditions as object[], actions: actions as object[] },
  });
  await syncSchedule(programId, row.id, trigger, enabled);
  return toDef(row);
}

export async function updateAutomation(programId: string, id: string, input: AutomationInput): Promise<AutomationDef> {
  const current = await getAutomation(programId, id);

  // Для частичной правки недостающее берётся из сохранённого
  const name = input.name !== undefined ? cleanName(input.name) : current.name;
  const { trigger, template } = await parseTrigger(programId, input.trigger !== undefined ? input.trigger : current.trigger);
  const conditions = parseConditions(input.conditions !== undefined ? input.conditions : current.conditions, trigger, template);
  const actions = await parseActions(programId, input.actions !== undefined ? input.actions : current.actions, trigger, template);
  const enabled = input.enabled !== undefined ? input.enabled !== false : current.enabled;
  const description = input.description !== undefined ? str(input.description, 500) || null : current.description;

  const row = await prisma.automation.update({
    where: { id },
    data: { name, description, enabled, trigger: trigger as object, conditions: conditions as object[], actions: actions as object[] },
  });
  await syncSchedule(programId, id, trigger, enabled);
  return toDef(row);
}

export async function deleteAutomation(programId: string, id: string): Promise<AutomationDef> {
  const current = await getAutomation(programId, id);
  await prisma.automation.delete({ where: { id } });
  await deleteJob(programId, scheduleJobKey(id));
  return current;
}

export async function listRuns(programId: string, id: string, limit = 50): Promise<AutomationRunDef[]> {
  await getAutomation(programId, id);
  const rows = await prisma.automationRun.findMany({ where: { automationId: id }, orderBy: { startedAt: 'desc' }, take: Math.min(Math.max(limit, 1), 200) });
  return rows.map((r) => ({
    id: r.id,
    status: r.status as AutomationRunDef['status'],
    startedAt: r.startedAt.toISOString(),
    durationMs: r.durationMs,
    recordId: r.recordId,
    message: r.message,
    steps: (r.steps as RunStep[]) ?? [],
  }));
}
