/**
 * Механизм сущностей — серверная часть. Работает с базой напрямую,
 * поэтому не входит в браузерный вход ядра (см. types.ts — он входит).
 *
 * Хранение решено в Р-19: шаблон и поля — строки в общих таблицах,
 * запись — одна строка с JSON-содержимым. Отдельной таблицы Postgres
 * под сущность не создаётся — иначе это была бы уже не мгновенная
 * правка, а пересборка.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../data/prisma';
import type { EntityFieldDef, EntityRecordDef, EntityTemplateDef, FieldOptions, FieldType } from './types';
import { FIELD_TYPES, slugify } from './types';

export class EntityError extends Error {}

export function toFieldDef(row: {
  id: string; key: string; label: string; type: string; required: boolean; order: number; options: unknown;
}): EntityFieldDef {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    type: row.type as FieldType,
    required: row.required,
    order: row.order,
    options: (row.options as FieldOptions) ?? null,
  };
}

async function toTemplateDef(row: {
  id: string; key: string; name: string; namePlural: string;
  fields: Parameters<typeof toFieldDef>[0][];
}): Promise<EntityTemplateDef> {
  const recordCount = await prisma.entityRecord.count({ where: { templateId: row.id } });
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    namePlural: row.namePlural,
    fields: row.fields.sort((a, b) => a.order - b.order).map(toFieldDef),
    hasRecords: recordCount > 0,
  };
}

export async function listTemplates(programId: string): Promise<EntityTemplateDef[]> {
  const rows = await prisma.entityTemplate.findMany({
    where: { programId },
    include: { fields: true },
    orderBy: { createdAt: 'asc' },
  });
  return Promise.all(rows.map(toTemplateDef));
}

export async function getTemplate(programId: string, key: string): Promise<EntityTemplateDef | null> {
  const row = await prisma.entityTemplate.findUnique({
    where: { programId_key: { programId, key } },
    include: { fields: true },
  });
  return row ? toTemplateDef(row) : null;
}

export async function uniqueKey(programId: string, base: string): Promise<string> {
  const root = slugify(base) || 'sushnost';
  let candidate = root;
  let n = 2;
  while (await prisma.entityTemplate.findUnique({ where: { programId_key: { programId, key: candidate } } })) {
    candidate = `${root}-${n++}`;
  }
  return candidate;
}

export async function createTemplate(
  programId: string,
  input: { name: string; namePlural: string }
): Promise<EntityTemplateDef> {
  const name = input.name.trim();
  const namePlural = input.namePlural.trim() || name;
  if (!name) throw new EntityError('Укажите название сущности');

  const key = await uniqueKey(programId, name);
  const row = await prisma.entityTemplate.create({
    data: { programId, key, name, namePlural },
    include: { fields: true },
  });
  return toTemplateDef(row);
}

export async function renameTemplate(
  programId: string,
  key: string,
  input: { name: string; namePlural: string }
): Promise<EntityTemplateDef> {
  const name = input.name.trim();
  const namePlural = input.namePlural.trim() || name;
  if (!name) throw new EntityError('Укажите название сущности');

  const row = await prisma.entityTemplate.update({
    where: { programId_key: { programId, key } },
    data: { name, namePlural },
    include: { fields: true },
  });
  return toTemplateDef(row);
}

export async function deleteTemplate(programId: string, key: string): Promise<void> {
  const template = await getTemplate(programId, key);
  if (!template) throw new EntityError('Сущность не найдена');
  if (template.hasRecords) {
    throw new EntityError('Нельзя удалить сущность, пока в ней есть записи');
  }
  await prisma.entityTemplate.delete({ where: { programId_key: { programId, key } } });
}

function assertFieldPayload(input: { label: string; type: string; options?: unknown }): void {
  if (!input.label?.trim()) throw new EntityError('Укажите название поля');
  if (!FIELD_TYPES.includes(input.type as FieldType)) throw new EntityError('Неизвестный тип поля');
  if (input.type === 'select' || input.type === 'multiselect') {
    const choices = (input.options as { choices?: unknown })?.choices;
    if (!Array.isArray(choices) || choices.length === 0 || choices.some((c) => typeof c !== 'string' || !c.trim())) {
      throw new EntityError('Укажите варианты списка');
    }
  }
  if (input.type === 'relation') {
    const targetTemplateId = (input.options as { targetTemplateId?: unknown })?.targetTemplateId;
    if (typeof targetTemplateId !== 'string' || !targetTemplateId) {
      throw new EntityError('Укажите, с какой сущностью связь');
    }
  }
}

export async function addField(
  programId: string,
  templateKey: string,
  input: { label: string; type: FieldType; required: boolean; options?: FieldOptions }
): Promise<EntityTemplateDef> {
  const template = await getTemplate(programId, templateKey);
  if (!template) throw new EntityError('Сущность не найдена');
  if (template.hasRecords) throw new EntityError('Поля можно менять, только пока в сущности нет записей');
  assertFieldPayload(input);

  const key = await (async () => {
    const root = slugify(input.label) || 'pole';
    let candidate = root;
    let n = 2;
    while (template.fields.some((f) => f.key === candidate)) candidate = `${root}-${n++}`;
    return candidate;
  })();

  await prisma.entityField.create({
    data: {
      templateId: template.id,
      key,
      label: input.label.trim(),
      type: input.type,
      required: input.required,
      options: input.options ?? undefined,
      order: template.fields.length,
    },
  });
  return getTemplate(programId, templateKey) as Promise<EntityTemplateDef>;
}

export async function updateField(
  programId: string,
  templateKey: string,
  fieldId: string,
  input: { label: string; type: FieldType; required: boolean; options?: FieldOptions }
): Promise<EntityTemplateDef> {
  const template = await getTemplate(programId, templateKey);
  if (!template) throw new EntityError('Сущность не найдена');
  if (template.hasRecords) throw new EntityError('Поля можно менять, только пока в сущности нет записей');
  if (!template.fields.some((f) => f.id === fieldId)) throw new EntityError('Поле не найдено');
  assertFieldPayload(input);

  await prisma.entityField.update({
    where: { id: fieldId },
    data: {
      label: input.label.trim(),
      type: input.type,
      required: input.required,
      options: input.options ?? undefined,
    },
  });
  return getTemplate(programId, templateKey) as Promise<EntityTemplateDef>;
}

export async function removeField(programId: string, templateKey: string, fieldId: string): Promise<EntityTemplateDef> {
  const template = await getTemplate(programId, templateKey);
  if (!template) throw new EntityError('Сущность не найдена');
  if (template.hasRecords) throw new EntityError('Поля можно менять, только пока в сущности нет записей');
  await prisma.entityField.delete({ where: { id: fieldId } });
  return getTemplate(programId, templateKey) as Promise<EntityTemplateDef>;
}

export async function reorderFields(
  programId: string,
  templateKey: string,
  orderedFieldIds: string[]
): Promise<EntityTemplateDef> {
  const template = await getTemplate(programId, templateKey);
  if (!template) throw new EntityError('Сущность не найдена');
  if (template.hasRecords) throw new EntityError('Поля можно менять, только пока в сущности нет записей');

  await prisma.$transaction(
    orderedFieldIds.map((id, order) => prisma.entityField.update({ where: { id }, data: { order } }))
  );
  return getTemplate(programId, templateKey) as Promise<EntityTemplateDef>;
}

/** Проверяет и приводит значения записи к типам полей */
async function validateRecordData(
  programId: string,
  fields: EntityFieldDef[],
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const cleaned: Record<string, unknown> = {};

  for (const field of fields) {
    const raw = input[field.key];
    const empty = raw === undefined || raw === null || raw === '' || (Array.isArray(raw) && raw.length === 0);

    if (empty) {
      if (field.required) throw new EntityError(`Заполните поле «${field.label}»`);
      continue;
    }

    if (field.type === 'text') {
      cleaned[field.key] = String(raw).trim();
    } else if (field.type === 'number') {
      const n = Number(raw);
      if (!Number.isFinite(n)) throw new EntityError(`Поле «${field.label}» должно быть числом`);
      cleaned[field.key] = n;
    } else if (field.type === 'date') {
      const d = new Date(String(raw));
      if (Number.isNaN(d.getTime())) throw new EntityError(`Поле «${field.label}» должно быть датой`);
      cleaned[field.key] = d.toISOString();
    } else if (field.type === 'select') {
      const choices = (field.options as { choices: string[] } | null)?.choices ?? [];
      if (!choices.includes(String(raw))) throw new EntityError(`Недопустимое значение поля «${field.label}»`);
      cleaned[field.key] = String(raw);
    } else if (field.type === 'multiselect') {
      const choices = (field.options as { choices: string[] } | null)?.choices ?? [];
      const values = Array.isArray(raw) ? raw.map(String) : [String(raw)];
      if (values.some((v) => !choices.includes(v))) {
        throw new EntityError(`Недопустимое значение поля «${field.label}»`);
      }
      cleaned[field.key] = values;
    } else if (field.type === 'relation') {
      const targetTemplateId = (field.options as { targetTemplateId: string } | null)?.targetTemplateId;
      const exists = targetTemplateId
        ? await prisma.entityRecord.findFirst({ where: { id: String(raw), templateId: targetTemplateId, programId } })
        : null;
      if (!exists) throw new EntityError(`Связанная запись для поля «${field.label}» не найдена`);
      cleaned[field.key] = String(raw);
    } else if (field.type === 'user') {
      const exists = await prisma.user.findFirst({ where: { id: String(raw), programId } });
      if (!exists) throw new EntityError(`Сотрудник для поля «${field.label}» не найден`);
      cleaned[field.key] = String(raw);
    }
  }

  return cleaned;
}

export async function listRecords(programId: string, templateKey: string): Promise<EntityRecordDef[]> {
  const template = await prisma.entityTemplate.findUnique({ where: { programId_key: { programId, key: templateKey } } });
  if (!template) throw new EntityError('Сущность не найдена');

  const rows = await prisma.entityRecord.findMany({
    where: { templateId: template.id },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((r) => ({
    id: r.id,
    data: r.data as Record<string, unknown>,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function createRecord(
  programId: string,
  templateKey: string,
  input: Record<string, unknown>
): Promise<EntityRecordDef> {
  const template = await getTemplate(programId, templateKey);
  if (!template) throw new EntityError('Сущность не найдена');

  const data = await validateRecordData(programId, template.fields, input);
  const row = await prisma.entityRecord.create({
    data: { programId, templateId: template.id, data: data as Prisma.InputJsonValue },
  });
  return { id: row.id, data: row.data as Record<string, unknown>, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

export async function updateRecord(
  programId: string,
  templateKey: string,
  id: string,
  input: Record<string, unknown>
): Promise<EntityRecordDef> {
  const template = await getTemplate(programId, templateKey);
  if (!template) throw new EntityError('Сущность не найдена');

  const existing = await prisma.entityRecord.findFirst({ where: { id, templateId: template.id, programId } });
  if (!existing) throw new EntityError('Запись не найдена');

  const data = await validateRecordData(programId, template.fields, input);
  const row = await prisma.entityRecord.update({
    where: { id },
    data: { data: data as Prisma.InputJsonValue },
  });
  return { id: row.id, data: row.data as Record<string, unknown>, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

export async function deleteRecord(programId: string, templateKey: string, id: string): Promise<void> {
  const template = await prisma.entityTemplate.findUnique({ where: { programId_key: { programId, key: templateKey } } });
  if (!template) throw new EntityError('Сущность не найдена');
  await prisma.entityRecord.deleteMany({ where: { id, templateId: template.id, programId } });
}
