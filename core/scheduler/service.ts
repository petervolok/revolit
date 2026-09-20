import { prisma } from '../data/prisma';
import { newId } from '../data/ids';
import { parseCron } from './cron';

export class SchedulerError extends Error {}

export interface ScheduledJobDef {
  key: string;
  cronExpression: string;
  enabled: boolean;
  lastRunAt: string | null;
}

const KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

function toDef(row: { key: string; cronExpression: string; enabled: boolean; lastRunAt: Date | null }): ScheduledJobDef {
  return {
    key: row.key,
    cronExpression: row.cronExpression,
    enabled: row.enabled,
    lastRunAt: row.lastRunAt ? row.lastRunAt.toISOString() : null,
  };
}

function validate(key: string, cronExpression: string): void {
  if (!KEY_PATTERN.test(key)) throw new SchedulerError('Ключ задачи — латиница, цифры, точка, дефис, подчёркивание (до 64 символов)');
  if (!parseCron(cronExpression)) throw new SchedulerError('Расписание — cron из 5 полей: минута час день месяц день-недели');
}

export async function listJobs(programId: string): Promise<ScheduledJobDef[]> {
  const rows = await prisma.scheduledJob.findMany({ where: { programId }, orderBy: { key: 'asc' } });
  return rows.map(toDef);
}

/** Создаёт или меняет задачу (по ключу). Смена расписания не сбрасывает `lastRunAt`. */
export async function upsertJob(
  programId: string,
  input: { key: string; cronExpression: string; enabled?: boolean }
): Promise<ScheduledJobDef> {
  const key = input.key.trim();
  const cronExpression = input.cronExpression.trim();
  validate(key, cronExpression);

  const row = await prisma.scheduledJob.upsert({
    where: { programId_key: { programId, key } },
    create: { id: newId(), programId, key, cronExpression, enabled: input.enabled ?? true },
    update: { cronExpression, ...(input.enabled !== undefined ? { enabled: input.enabled } : {}) },
  });
  return toDef(row);
}

/**
 * Для плагинов: заводит задачу, только если её ещё нет, и НЕ трогает уже настроенное расписание —
 * администратор мог его изменить или выключить задачу.
 */
export async function ensureJob(programId: string, key: string, cronExpression: string): Promise<void> {
  validate(key, cronExpression);
  await prisma.scheduledJob.upsert({
    where: { programId_key: { programId, key } },
    create: { id: newId(), programId, key, cronExpression, enabled: true },
    update: {},
  });
}

export async function deleteJob(programId: string, key: string): Promise<void> {
  await prisma.scheduledJob.deleteMany({ where: { programId, key } });
}
