/**
 * Каталог шаблонов сущностей — серверная часть (Р-29). Начальный набор сеется
 * в базу один раз при первом обращении: так работает и на уже развёрнутых
 * установках, без повторного прохождения мастера.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../data/prisma';
import { newId } from '../data/ids';
import { DEFAULT_PRESETS } from './presets';
import { getTemplate, uniqueKey } from './service';
import type { EntityPresetDef, EntityTemplateDef, FieldType, PresetFieldDef } from './types';
import { FIELD_TYPES, slugify } from './types';

export class PresetError extends Error {}

function toPresetDef(row: { id: string; key: string; name: string; namePlural: string; fields: unknown }): EntityPresetDef {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    namePlural: row.namePlural,
    fields: row.fields as PresetFieldDef[],
  };
}

async function uniquePresetKey(programId: string, base: string): Promise<string> {
  const root = slugify(base) || 'shablon';
  let candidate = root;
  let n = 2;
  while (
    await prisma.entityTemplatePreset.findUnique({ where: { programId_key: { programId, key: candidate } } })
  ) {
    candidate = `${root}-${n++}`;
  }
  return candidate;
}

export async function listPresets(programId: string): Promise<EntityPresetDef[]> {
  const count = await prisma.entityTemplatePreset.count({ where: { programId } });
  if (count === 0) {
    await prisma.entityTemplatePreset.createMany({
      data: DEFAULT_PRESETS.map((p) => ({
        id: newId(),
        programId,
        key: p.key,
        name: p.name,
        namePlural: p.namePlural,
        fields: p.fields as unknown as Prisma.InputJsonValue,
      })),
    });
  }

  const rows = await prisma.entityTemplatePreset.findMany({ where: { programId }, orderBy: { createdAt: 'asc' } });
  return rows.map(toPresetDef);
}

export async function getPreset(programId: string, key: string): Promise<EntityPresetDef | null> {
  const row = await prisma.entityTemplatePreset.findUnique({ where: { programId_key: { programId, key } } });
  return row ? toPresetDef(row) : null;
}

function assertPresetFields(fields: unknown): asserts fields is PresetFieldDef[] {
  if (!Array.isArray(fields) || fields.length === 0) throw new PresetError('Добавьте хотя бы одно поле');
  for (const f of fields) {
    if (!f || typeof f !== 'object') throw new PresetError('Некорректное поле шаблона');
    const field = f as Record<string, unknown>;
    if (typeof field.label !== 'string' || !field.label.trim()) throw new PresetError('Укажите название каждого поля');
    if (typeof field.type !== 'string' || !FIELD_TYPES.includes(field.type as FieldType)) {
      throw new PresetError('Неизвестный тип поля');
    }
    if (typeof field.key !== 'string' || !field.key.trim()) throw new PresetError('У каждого поля должен быть технический ключ');
  }
}

export async function createPreset(
  programId: string,
  input: { name: string; namePlural: string; fields: PresetFieldDef[] }
): Promise<EntityPresetDef> {
  const name = input.name.trim();
  if (!name) throw new PresetError('Укажите название шаблона');
  assertPresetFields(input.fields);

  const key = await uniquePresetKey(programId, name);
  const row = await prisma.entityTemplatePreset.create({
    data: {
      id: newId(),
      programId,
      key,
      name,
      namePlural: input.namePlural.trim() || name,
      fields: input.fields as unknown as Prisma.InputJsonValue,
    },
  });
  return toPresetDef(row);
}

export async function updatePreset(
  programId: string,
  key: string,
  input: { name: string; namePlural: string; fields: PresetFieldDef[] }
): Promise<EntityPresetDef> {
  const name = input.name.trim();
  if (!name) throw new PresetError('Укажите название шаблона');
  assertPresetFields(input.fields);

  const row = await prisma.entityTemplatePreset.update({
    where: { programId_key: { programId, key } },
    data: {
      name,
      namePlural: input.namePlural.trim() || name,
      fields: input.fields as unknown as Prisma.InputJsonValue,
    },
  });
  return toPresetDef(row);
}

export async function deletePreset(programId: string, key: string): Promise<void> {
  await prisma.entityTemplatePreset.delete({ where: { programId_key: { programId, key } } });
}

/**
 * Создаёт настоящую сущность из шаблона: сам шаблон, все его поля, связи —
 * одним действием. Дальше сущность живёт как любая другая, без обратной
 * зависимости от шаблона.
 *
 * Поле-связь ищет уже существующую сущность, созданную из целевого шаблона
 * (по sourcePresetKey). Если такой ещё нет — поле пропускается, а вызывающий
 * узнаёт об этом через skippedFields, вместо того чтобы получить связь в никуда.
 */
export async function materializePreset(
  programId: string,
  presetKey: string
): Promise<{ template: EntityTemplateDef; skippedFields: string[] }> {
  const preset = await getPreset(programId, presetKey);
  if (!preset) throw new PresetError('Шаблон не найден');

  const templateKey = await uniqueKey(programId, preset.name);
  const template = await prisma.entityTemplate.create({
    data: { id: newId(), programId, key: templateKey, name: preset.name, namePlural: preset.namePlural, sourcePresetKey: preset.key },
  });

  const skippedFields: string[] = [];
  let order = 0;

  for (const field of preset.fields) {
    let options: Prisma.InputJsonValue | undefined;

    if (field.type === 'relation') {
      const targetPresetKey = (field.options as { targetPresetKey?: string } | null | undefined)?.targetPresetKey;
      const target = targetPresetKey
        ? await prisma.entityTemplate.findFirst({ where: { programId, sourcePresetKey: targetPresetKey } })
        : null;
      if (!target) {
        skippedFields.push(field.label);
        continue;
      }
      options = { targetTemplateId: target.id };
    } else if (field.options) {
      options = field.options as Prisma.InputJsonValue;
    }

    await prisma.entityField.create({
      data: {
        id: newId(),
        templateId: template.id,
        key: field.key,
        label: field.label,
        type: field.type,
        required: field.required,
        options,
        order: order++,
      },
    });
  }

  const full = await getTemplate(programId, templateKey);
  return { template: full as EntityTemplateDef, skippedFields };
}
