/**
 * Конструктор процессов — серверная часть. Линейная структура: Процесс →
 * Этапы по порядку → Дела, проходящие через этапы (Р-32).
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../data/prisma';
import { slugify } from '../entities/types';
import type {
  ChecklistItem,
  ChecklistState,
  ProcessHistoryEntryDef,
  ProcessInstanceDef,
  ProcessInstanceWithHistory,
  ProcessStageDef,
  ProcessTemplateDef,
} from './types';

export class ProcessError extends Error {}

function toStageDef(row: {
  id: string; order: number; name: string; responsible: string | null; regulation: string | null; checklist: unknown;
}): ProcessStageDef {
  return {
    id: row.id,
    order: row.order,
    name: row.name,
    responsible: row.responsible,
    regulation: row.regulation,
    checklist: (row.checklist as ChecklistItem[] | null) ?? [],
  };
}

async function toTemplateDef(row: {
  id: string; key: string; name: string;
  stages: Parameters<typeof toStageDef>[0][];
}): Promise<ProcessTemplateDef> {
  const instanceCount = await prisma.processInstance.count({ where: { templateId: row.id } });
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    stages: row.stages.sort((a, b) => a.order - b.order).map(toStageDef),
    hasInstances: instanceCount > 0,
  };
}

export async function listTemplates(programId: string): Promise<ProcessTemplateDef[]> {
  const rows = await prisma.processTemplate.findMany({
    where: { programId },
    include: { stages: true },
    orderBy: { createdAt: 'asc' },
  });
  return Promise.all(rows.map(toTemplateDef));
}

export async function getTemplate(programId: string, key: string): Promise<ProcessTemplateDef | null> {
  const row = await prisma.processTemplate.findUnique({
    where: { programId_key: { programId, key } },
    include: { stages: true },
  });
  return row ? toTemplateDef(row) : null;
}

async function uniqueKey(programId: string, base: string): Promise<string> {
  const root = slugify(base) || 'protsess';
  let candidate = root;
  let n = 2;
  while (await prisma.processTemplate.findUnique({ where: { programId_key: { programId, key: candidate } } })) {
    candidate = `${root}-${n++}`;
  }
  return candidate;
}

export async function createTemplate(programId: string, input: { name: string }): Promise<ProcessTemplateDef> {
  const name = input.name.trim();
  if (!name) throw new ProcessError('Укажите название процесса');

  const key = await uniqueKey(programId, name);
  const row = await prisma.processTemplate.create({ data: { programId, key, name }, include: { stages: true } });
  return toTemplateDef(row);
}

export async function renameTemplate(programId: string, key: string, input: { name: string }): Promise<ProcessTemplateDef> {
  const name = input.name.trim();
  if (!name) throw new ProcessError('Укажите название процесса');

  const row = await prisma.processTemplate.update({
    where: { programId_key: { programId, key } },
    data: { name },
    include: { stages: true },
  });
  return toTemplateDef(row);
}

export async function deleteTemplate(programId: string, key: string): Promise<void> {
  const template = await getTemplate(programId, key);
  if (!template) throw new ProcessError('Процесс не найден');
  if (template.hasInstances) throw new ProcessError('Нельзя удалить процесс, пока по нему есть дела');
  await prisma.processTemplate.delete({ where: { programId_key: { programId, key } } });
}

function normalizeChecklist(input: unknown): ChecklistItem[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => (typeof item === 'string' ? item : (item as { label?: unknown })?.label))
    .filter((label): label is string => typeof label === 'string' && label.trim().length > 0)
    .map((label) => ({ label: label.trim() }));
}

export async function addStage(
  programId: string,
  templateKey: string,
  input: { name: string; responsible?: string; regulation?: string; checklist?: unknown }
): Promise<ProcessTemplateDef> {
  const template = await getTemplate(programId, templateKey);
  if (!template) throw new ProcessError('Процесс не найден');
  if (template.hasInstances) throw new ProcessError('Этапы можно менять, только пока по процессу нет дел');
  if (!input.name?.trim()) throw new ProcessError('Укажите название этапа');

  await prisma.processStage.create({
    data: {
      templateId: template.id,
      name: input.name.trim(),
      responsible: input.responsible?.trim() || null,
      regulation: input.regulation?.trim() || null,
      checklist: normalizeChecklist(input.checklist) as unknown as Prisma.InputJsonValue,
      order: template.stages.length,
    },
  });
  return getTemplate(programId, templateKey) as Promise<ProcessTemplateDef>;
}

/** Название, ответственный, регламент и чек-лист можно менять всегда — это не структура (Р-32) */
export async function updateStage(
  programId: string,
  templateKey: string,
  stageId: string,
  input: { name: string; responsible?: string; regulation?: string; checklist?: unknown }
): Promise<ProcessTemplateDef> {
  const template = await getTemplate(programId, templateKey);
  if (!template) throw new ProcessError('Процесс не найден');
  if (!template.stages.some((s) => s.id === stageId)) throw new ProcessError('Этап не найден');
  if (!input.name?.trim()) throw new ProcessError('Укажите название этапа');

  await prisma.processStage.update({
    where: { id: stageId },
    data: {
      name: input.name.trim(),
      responsible: input.responsible?.trim() || null,
      regulation: input.regulation?.trim() || null,
      checklist: normalizeChecklist(input.checklist) as unknown as Prisma.InputJsonValue,
    },
  });
  return getTemplate(programId, templateKey) as Promise<ProcessTemplateDef>;
}

export async function removeStage(programId: string, templateKey: string, stageId: string): Promise<ProcessTemplateDef> {
  const template = await getTemplate(programId, templateKey);
  if (!template) throw new ProcessError('Процесс не найден');
  if (template.hasInstances) throw new ProcessError('Этапы можно менять, только пока по процессу нет дел');
  await prisma.processStage.delete({ where: { id: stageId } });
  return getTemplate(programId, templateKey) as Promise<ProcessTemplateDef>;
}

export async function reorderStages(
  programId: string,
  templateKey: string,
  orderedStageIds: string[]
): Promise<ProcessTemplateDef> {
  const template = await getTemplate(programId, templateKey);
  if (!template) throw new ProcessError('Процесс не найден');
  if (template.hasInstances) throw new ProcessError('Этапы можно менять, только пока по процессу нет дел');

  await prisma.$transaction(
    orderedStageIds.map((id, order) => prisma.processStage.update({ where: { id }, data: { order } }))
  );
  return getTemplate(programId, templateKey) as Promise<ProcessTemplateDef>;
}

function toInstanceDef(row: {
  id: string; templateId: string; title: string; currentStageId: string; status: string;
  checklistState: unknown; createdAt: Date; updatedAt: Date;
}): ProcessInstanceDef {
  return {
    id: row.id,
    templateId: row.templateId,
    title: row.title,
    currentStageId: row.currentStageId,
    status: row.status as ProcessInstanceDef['status'],
    checklistState: (row.checklistState as ChecklistState | null) ?? {},
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listInstances(programId: string, templateKey: string): Promise<ProcessInstanceDef[]> {
  const template = await prisma.processTemplate.findUnique({ where: { programId_key: { programId, key: templateKey } } });
  if (!template) throw new ProcessError('Процесс не найден');

  const rows = await prisma.processInstance.findMany({
    where: { templateId: template.id },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(toInstanceDef);
}

export async function createInstance(
  programId: string,
  templateKey: string,
  input: { title: string }
): Promise<ProcessInstanceDef> {
  const template = await getTemplate(programId, templateKey);
  if (!template) throw new ProcessError('Процесс не найден');
  if (template.stages.length === 0) throw new ProcessError('Сначала добавьте хотя бы один этап');
  if (!input.title?.trim()) throw new ProcessError('Укажите название дела');

  const firstStage = template.stages[0];
  const row = await prisma.processInstance.create({
    data: { programId, templateId: template.id, title: input.title.trim(), currentStageId: firstStage.id },
  });
  await prisma.processHistoryEntry.create({
    data: { instanceId: row.id, fromStageId: null, toStageId: firstStage.id },
  });
  return toInstanceDef(row);
}

async function loadInstance(programId: string, instanceId: string) {
  const instance = await prisma.processInstance.findFirst({ where: { id: instanceId, programId } });
  if (!instance) throw new ProcessError('Дело не найдено');
  return instance;
}

export async function getInstance(programId: string, instanceId: string): Promise<ProcessInstanceWithHistory> {
  const instance = await loadInstance(programId, instanceId);
  const history = await prisma.processHistoryEntry.findMany({
    where: { instanceId },
    orderBy: { createdAt: 'asc' },
  });
  return {
    ...toInstanceDef(instance),
    history: history.map(
      (h): ProcessHistoryEntryDef => ({
        id: h.id,
        fromStageId: h.fromStageId,
        toStageId: h.toStageId,
        actorEmail: h.actorEmail,
        note: h.note,
        createdAt: h.createdAt.toISOString(),
      })
    ),
  };
}

export async function moveInstance(
  programId: string,
  instanceId: string,
  input: { toStageId: string; actorEmail?: string }
): Promise<ProcessInstanceDef> {
  const instance = await loadInstance(programId, instanceId);
  const targetStage = await prisma.processStage.findFirst({
    where: { id: input.toStageId, templateId: instance.templateId },
  });
  if (!targetStage) throw new ProcessError('Этап не найден в этом процессе');

  const updated = await prisma.processInstance.update({
    where: { id: instanceId },
    data: { currentStageId: targetStage.id },
  });
  await prisma.processHistoryEntry.create({
    data: {
      instanceId,
      fromStageId: instance.currentStageId,
      toStageId: targetStage.id,
      actorEmail: input.actorEmail,
    },
  });
  return toInstanceDef(updated);
}

export async function setInstanceStatus(
  programId: string,
  instanceId: string,
  status: 'active' | 'done' | 'cancelled'
): Promise<ProcessInstanceDef> {
  await loadInstance(programId, instanceId);
  const updated = await prisma.processInstance.update({ where: { id: instanceId }, data: { status } });
  return toInstanceDef(updated);
}

export async function toggleChecklistItem(
  programId: string,
  instanceId: string,
  input: { stageId: string; itemIndex: number; checked: boolean }
): Promise<ProcessInstanceDef> {
  const instance = await loadInstance(programId, instanceId);
  const state = ((instance.checklistState as ChecklistState | null) ?? {}) as ChecklistState;
  const stageState = { ...(state[input.stageId] ?? {}) };
  stageState[input.itemIndex] = input.checked;
  const nextState = { ...state, [input.stageId]: stageState };

  const updated = await prisma.processInstance.update({
    where: { id: instanceId },
    data: { checklistState: nextState as unknown as Prisma.InputJsonValue },
  });
  return toInstanceDef(updated);
}

export async function deleteInstance(programId: string, instanceId: string): Promise<void> {
  await loadInstance(programId, instanceId);
  await prisma.processInstance.delete({ where: { id: instanceId } });
}
