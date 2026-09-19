/**
 * Задачи — серверная часть (Р-37). Напоминание — это не автоматика: срок
 * подсвечивается, когда сотрудник сам открывает раздел «Задачи», письма
 * или push никто не рассылает — это честно не сделано.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../data/prisma';
import { newId } from '../data/ids';
import { toFieldDef } from '../entities/service';
import { recordLabel } from '../entities/types';
import type { EntityRecordDef } from '../entities/types';
import type { TaskDef, TaskStatus } from './types';

export class TaskError extends Error {}

const TASK_INCLUDE = {
  assignee: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  entityRecord: { include: { template: { include: { fields: true } } } },
  processInstance: { include: { template: true } },
} as const;

type TaskRow = Prisma.TaskGetPayload<{ include: typeof TASK_INCLUDE }>;

function toTaskDef(row: TaskRow): TaskDef {
  let entityRecordLabel: string | null = null;
  let entityTemplateKey: string | null = null;
  if (row.entityRecord) {
    entityTemplateKey = row.entityRecord.template.key;
    const recordDef: EntityRecordDef = {
      id: row.entityRecord.id,
      data: row.entityRecord.data as Record<string, unknown>,
      createdAt: row.entityRecord.createdAt.toISOString(),
      updatedAt: row.entityRecord.updatedAt.toISOString(),
    };
    entityRecordLabel = recordLabel(recordDef, row.entityRecord.template.fields.map(toFieldDef));
  }

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status as TaskStatus,
    dueAt: row.dueAt ? row.dueAt.toISOString() : null,
    doneAt: row.doneAt ? row.doneAt.toISOString() : null,
    assignee: row.assignee,
    createdBy: row.createdBy,
    entityRecordId: row.entityRecordId,
    entityRecordLabel,
    entityTemplateKey,
    processInstanceId: row.processInstanceId,
    processInstanceTitle: row.processInstance?.title ?? null,
    processTemplateKey: row.processInstance?.template.key ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface ListTasksFilter {
  assigneeId?: string;
  entityRecordId?: string;
  processInstanceId?: string;
  includeDone?: boolean;
}

export async function listTasks(programId: string, filter: ListTasksFilter = {}): Promise<TaskDef[]> {
  const rows = await prisma.task.findMany({
    where: {
      programId,
      ...(filter.assigneeId ? { assigneeId: filter.assigneeId } : {}),
      ...(filter.entityRecordId ? { entityRecordId: filter.entityRecordId } : {}),
      ...(filter.processInstanceId ? { processInstanceId: filter.processInstanceId } : {}),
      ...(filter.includeDone ? {} : { status: 'open' }),
    },
    include: TASK_INCLUDE,
    orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
  });
  return rows.map(toTaskDef);
}

async function requireOwnRecord(programId: string, entityRecordId: string) {
  const record = await prisma.entityRecord.findFirst({ where: { id: entityRecordId, programId } });
  if (!record) throw new TaskError('Связанная запись не найдена');
}

async function requireOwnInstance(programId: string, processInstanceId: string) {
  const instance = await prisma.processInstance.findFirst({ where: { id: processInstanceId, programId } });
  if (!instance) throw new TaskError('Связанное дело не найдено');
}

export async function createTask(
  programId: string,
  createdById: string,
  input: {
    title: string;
    description?: string;
    assigneeId?: string;
    dueAt?: string;
    entityRecordId?: string;
    processInstanceId?: string;
  }
): Promise<TaskDef> {
  if (!input.title?.trim()) throw new TaskError('Укажите название задачи');
  if (input.entityRecordId) await requireOwnRecord(programId, input.entityRecordId);
  if (input.processInstanceId) await requireOwnInstance(programId, input.processInstanceId);

  const row = await prisma.task.create({
    data: {
      id: newId(),
      programId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      assigneeId: input.assigneeId || null,
      createdById,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      entityRecordId: input.entityRecordId || null,
      processInstanceId: input.processInstanceId || null,
    },
    include: TASK_INCLUDE,
  });
  return toTaskDef(row);
}

async function requireOwnTask(programId: string, taskId: string) {
  const task = await prisma.task.findFirst({ where: { id: taskId, programId } });
  if (!task) throw new TaskError('Задача не найдена');
  return task;
}

export async function updateTask(
  programId: string,
  taskId: string,
  input: { title?: string; description?: string; assigneeId?: string | null; dueAt?: string | null }
): Promise<TaskDef> {
  await requireOwnTask(programId, taskId);

  const row = await prisma.task.update({
    where: { id: taskId },
    data: {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() || null } : {}),
      ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId || null } : {}),
      ...(input.dueAt !== undefined ? { dueAt: input.dueAt ? new Date(input.dueAt) : null } : {}),
    },
    include: TASK_INCLUDE,
  });
  return toTaskDef(row);
}

export async function setTaskStatus(programId: string, taskId: string, status: TaskStatus): Promise<TaskDef> {
  await requireOwnTask(programId, taskId);
  const row = await prisma.task.update({
    where: { id: taskId },
    data: { status, doneAt: status === 'done' ? new Date() : null },
    include: TASK_INCLUDE,
  });
  return toTaskDef(row);
}

export async function deleteTask(programId: string, taskId: string): Promise<void> {
  await requireOwnTask(programId, taskId);
  await prisma.task.delete({ where: { id: taskId } });
}
