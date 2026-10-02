/**
 * Механизм сущностей — серверная часть. Работает с базой напрямую,
 * поэтому не входит в браузерный вход ядра (см. types.ts — он входит).
 *
 * Хранение решено в Р-19: шаблон и поля — строки в общих таблицах,
 * запись — одна строка с JSON-содержимым. Отдельной таблицы Postgres
 * под сущность не создаётся — иначе это была бы уже не мгновенная
 * правка, а пересборка.
 *
 * Поля можно добавлять, переименовывать и удалять и при наличии записей (строка 1 таблицы
 * покрытия): записи — JSON, нового поля в них просто нет, а удаляемый ключ вычищается из записей.
 */
import type { Prisma } from '@prisma/client';
import { prisma, runBatch } from '../data/prisma';
import { newId } from '../data/ids';
import type { EntityFieldDef, EntityRecordDef, EntityTemplateDef, FieldOptions, FieldType, FieldValidation } from './types';
import { FIELD_TYPES, STRING_TYPES, UNIQUE_TYPES, slugify } from './types';

export class EntityError extends Error {}

type FieldRow = {
  id: string; key: string; label: string; type: string; required: boolean; order: number; options: unknown;
  description?: string | null; defaultValue?: unknown; isUnique?: boolean; readonly?: boolean; hidden?: boolean; validation?: unknown;
};

export function toFieldDef(row: FieldRow): EntityFieldDef {
  const defaultBox = (row.defaultValue ?? {}) as { v?: unknown };
  const hasDefault = typeof defaultBox === 'object' && defaultBox !== null && 'v' in defaultBox;
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    type: row.type as FieldType,
    required: row.required,
    order: row.order,
    options: (row.options as FieldOptions) ?? null,
    description: row.description ?? null,
    hasDefault,
    ...(hasDefault ? { defaultValue: defaultBox.v } : {}),
    unique: row.isUnique ?? false,
    readonly: row.readonly ?? false,
    hidden: row.hidden ?? false,
    validation: (row.validation as FieldValidation | null) ?? {},
  };
}

async function toTemplateDef(row: {
  id: string; key: string; name: string; namePlural: string;
  description?: string | null; icon?: string | null; displayField?: string | null;
  fields: FieldRow[];
}): Promise<EntityTemplateDef> {
  const recordCount = await prisma.entityRecord.count({ where: { templateId: row.id } });
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    namePlural: row.namePlural,
    description: row.description ?? null,
    icon: row.icon ?? null,
    displayField: row.displayField ?? null,
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
    data: { id: newId(), programId, key, name, namePlural },
    include: { fields: true },
  });
  return toTemplateDef(row);
}

export interface TemplateInput {
  name: string;
  namePlural: string;
  description?: string | null;
  /** Имя значка lucide (латиница и цифры); пустое — без значка */
  icon?: string | null;
  /** Ключ поля-заголовка; пустое — по первому текстовому полю */
  displayField?: string | null;
}

export async function renameTemplate(programId: string, key: string, input: TemplateInput): Promise<EntityTemplateDef> {
  const name = input.name.trim();
  const namePlural = input.namePlural.trim() || name;
  if (!name) throw new EntityError('Укажите название сущности');

  const template = await getTemplate(programId, key);
  if (!template) throw new EntityError('Сущность не найдена');

  const data: Prisma.EntityTemplateUpdateInput = { name, namePlural };

  if (input.description !== undefined) {
    const description = (input.description ?? '').trim();
    if (description.length > 500) throw new EntityError('Описание сущности длиннее 500 знаков');
    data.description = description || null;
  }
  if (input.icon !== undefined) {
    const icon = (input.icon ?? '').trim();
    if (icon && !/^[A-Za-z0-9]{1,40}$/.test(icon)) throw new EntityError('Имя значка — латиница и цифры, например Users');
    data.icon = icon || null;
  }
  if (input.displayField !== undefined) {
    const displayField = (input.displayField ?? '').trim();
    if (displayField && !template.fields.some((f) => f.key === displayField)) {
      throw new EntityError('Поле для заголовка записи не найдено среди полей сущности');
    }
    data.displayField = displayField || null;
  }

  const row = await prisma.entityTemplate.update({
    where: { programId_key: { programId, key } },
    data,
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

// ─── Проверка значений по типам ───

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9 ()\-]{5,25}$/;
const MAX_TEXT = 10_000;
const MAX_JSON = 100_000;

function isEmpty(raw: unknown): boolean {
  return raw === undefined || raw === null || raw === '' || (Array.isArray(raw) && raw.length === 0);
}

function fail(field: Pick<EntityFieldDef, 'validation'>, fallback: string): never {
  throw new EntityError(field.validation.message?.trim() || fallback);
}

function checkPattern(field: EntityFieldDef, text: string): void {
  const pattern = field.validation.pattern;
  if (pattern && !new RegExp(pattern).test(text)) fail(field, `Значение поля «${field.label}» не соответствует нужному формату`);
}

function checkLength(field: EntityFieldDef, text: string): void {
  const { minLength, maxLength } = field.validation;
  if (minLength !== undefined && text.length < minLength) fail(field, `Поле «${field.label}»: не короче ${minLength} знаков`);
  if (maxLength !== undefined && text.length > maxLength) fail(field, `Поле «${field.label}»: не длиннее ${maxLength} знаков`);
}

function checkRange(field: EntityFieldDef, value: number, toNumber: (bound: number | string) => number): void {
  const { min, max } = field.validation;
  if (min !== undefined && value < toNumber(min)) fail(field, `Поле «${field.label}»: не меньше ${String(min)}`);
  if (max !== undefined && value > toNumber(max)) fail(field, `Поле «${field.label}»: не больше ${String(max)}`);
}

/** Приводит значение типов, которым не нужна база, к хранимому виду; нарушение — EntityError */
function coerceScalar(field: EntityFieldDef, raw: unknown): unknown {
  const bad = (what: string) => fail(field, `Поле «${field.label}» должно быть ${what}`);
  const asText = (): string => {
    if (typeof raw === 'object' || typeof raw === 'boolean') bad('текстом');
    return String(raw);
  };

  switch (field.type) {
    case 'text': {
      const s = asText().trim();
      if (s.length > MAX_TEXT) bad(`короче ${MAX_TEXT} знаков`);
      checkLength(field, s);
      checkPattern(field, s);
      return s;
    }
    case 'longtext': {
      const s = asText().replace(/\r\n/g, '\n').trimEnd();
      if (s.length > MAX_TEXT) bad(`короче ${MAX_TEXT} знаков`);
      checkLength(field, s);
      checkPattern(field, s);
      return s;
    }
    case 'email': {
      const s = asText().trim().toLowerCase();
      if (s.length > 254 || !EMAIL_RE.test(s)) bad('адресом почты');
      checkLength(field, s);
      checkPattern(field, s);
      return s;
    }
    case 'url': {
      const s = asText().trim();
      let url: URL | null = null;
      try {
        url = new URL(s);
      } catch {
        url = null;
      }
      if (!url || !['http:', 'https:'].includes(url.protocol) || s.length > 2048) bad('ссылкой http или https');
      checkLength(field, s);
      checkPattern(field, s);
      return s;
    }
    case 'phone': {
      const s = asText().trim();
      if (!PHONE_RE.test(s) || s.replace(/\D/g, '').length < 5) bad('телефоном');
      checkLength(field, s);
      checkPattern(field, s);
      return s;
    }
    case 'number': {
      if (typeof raw === 'boolean' || typeof raw === 'object') bad('числом');
      const n = Number(raw);
      if (!Number.isFinite(n)) bad('числом');
      if (field.validation.integer && !Number.isInteger(n)) bad('целым числом');
      checkRange(field, n, (b) => Number(b));
      return n;
    }
    case 'boolean': {
      if (raw === true || raw === 'true' || raw === 'да') return true;
      if (raw === false || raw === 'false' || raw === 'нет') return false;
      return bad('«да» или «нет»');
    }
    case 'date':
    case 'datetime': {
      const d = new Date(String(raw));
      if (Number.isNaN(d.getTime())) bad(field.type === 'date' ? 'датой' : 'датой и временем');
      checkRange(field, d.getTime(), (b) => new Date(String(b)).getTime());
      return d.toISOString();
    }
    case 'select': {
      const choices = (field.options as { choices: string[] } | null)?.choices ?? [];
      if (!choices.includes(String(raw))) throw new EntityError(`Недопустимое значение поля «${field.label}»`);
      return String(raw);
    }
    case 'multiselect': {
      const choices = (field.options as { choices: string[] } | null)?.choices ?? [];
      const values = Array.isArray(raw) ? raw.map(String) : [String(raw)];
      if (values.some((v) => !choices.includes(v))) throw new EntityError(`Недопустимое значение поля «${field.label}»`);
      return values;
    }
    case 'json': {
      let value: unknown = raw;
      if (typeof raw === 'string') {
        try {
          value = JSON.parse(raw);
        } catch {
          bad('корректным JSON');
        }
      }
      if (JSON.stringify(value).length > MAX_JSON) bad(`JSON не больше ${MAX_JSON} знаков`);
      return value;
    }
    default:
      throw new EntityError(`Поле «${field.label}» этого типа проверяется отдельно`);
  }
}

/** Значение не должно повторяться среди записей сущности (кроме самой записи при правке) */
async function assertUnique(templateId: string, field: EntityFieldDef, value: unknown, excludeId?: string): Promise<void> {
  const found = await prisma.entityRecord.findFirst({
    where: {
      templateId,
      data: { path: [field.key], equals: value as Prisma.InputJsonValue },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true },
  });
  if (found) throw new EntityError(`Значение поля «${field.label}» уже используется в другой записи`);
}

interface RecordCheck {
  /** Подставлять значения по умолчанию в пустые поля (создание записи) */
  applyDefaults: boolean;
  /** Прежнее содержимое при правке: из него берутся поля «только чтение» */
  existing?: Record<string, unknown>;
  excludeId?: string;
}

/** Проверяет и приводит значения записи к типам полей */
async function validateRecordData(
  programId: string,
  templateId: string,
  fields: EntityFieldDef[],
  input: Record<string, unknown>,
  check: RecordCheck
): Promise<Record<string, unknown>> {
  const cleaned: Record<string, unknown> = {};

  for (const field of fields) {
    let raw = input[field.key];
    if (check.existing && field.readonly) raw = check.existing[field.key];

    let empty = isEmpty(raw);
    if (empty && check.applyDefaults && field.hasDefault) {
      raw = field.defaultValue;
      empty = isEmpty(raw);
    }

    if (empty) {
      if (field.required) throw new EntityError(`Заполните поле «${field.label}»`);
      continue;
    }

    if (field.type === 'relation') {
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
    } else {
      cleaned[field.key] = coerceScalar(field, raw);
    }

    if (field.unique) await assertUnique(templateId, field, cleaned[field.key], check.excludeId);
  }

  return cleaned;
}

// ─── Поля ───

export interface FieldInput {
  label: string;
  type: FieldType;
  required: boolean;
  options?: FieldOptions;
  description?: string | null;
  /** Задано ли значение по умолчанию; само значение — в defaultValue */
  hasDefault?: boolean;
  defaultValue?: unknown;
  unique?: boolean;
  readonly?: boolean;
  hidden?: boolean;
  validation?: FieldValidation;
}

/** Оставляет в правилах проверки только известные ключи нужных типов и подходящие для типа поля */
function normalizeValidation(type: FieldType, raw: FieldValidation | undefined): FieldValidation {
  const out: FieldValidation = {};
  if (!raw) return out;
  const isString = STRING_TYPES.includes(type);
  const isRange = type === 'number' || type === 'date' || type === 'datetime';

  if (isRange) {
    if (raw.min !== undefined && raw.min !== null && raw.min !== '') out.min = type === 'number' ? Number(raw.min) : String(raw.min);
    if (raw.max !== undefined && raw.max !== null && raw.max !== '') out.max = type === 'number' ? Number(raw.max) : String(raw.max);
  }
  if (type === 'number' && raw.integer) out.integer = true;
  if (isString) {
    if (raw.minLength !== undefined && raw.minLength !== null && String(raw.minLength) !== '') out.minLength = Number(raw.minLength);
    if (raw.maxLength !== undefined && raw.maxLength !== null && String(raw.maxLength) !== '') out.maxLength = Number(raw.maxLength);
    if (typeof raw.pattern === 'string' && raw.pattern.trim()) out.pattern = raw.pattern.trim();
  }
  if (typeof raw.message === 'string' && raw.message.trim()) out.message = raw.message.trim().slice(0, 200);
  return out;
}

function assertFieldPayload(input: FieldInput): void {
  if (!input.label?.trim()) throw new EntityError('Укажите название поля');
  if (!FIELD_TYPES.includes(input.type)) throw new EntityError('Неизвестный тип поля');
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
  if ((input.description ?? '').length > 300) throw new EntityError('Подсказка к полю длиннее 300 знаков');
  if (input.unique && !UNIQUE_TYPES.includes(input.type)) {
    throw new EntityError('Уникальность можно задать для текста, почты, ссылки, телефона, числа, даты, связи и сотрудника');
  }

  const v = normalizeValidation(input.type, input.validation);
  for (const key of ['min', 'max'] as const) {
    if (v[key] === undefined) continue;
    if (input.type === 'number' ? !Number.isFinite(v[key]) : Number.isNaN(new Date(String(v[key])).getTime())) {
      throw new EntityError(`Граница «${key === 'min' ? 'от' : 'до'}» заполнена неверно`);
    }
  }
  if (v.min !== undefined && v.max !== undefined) {
    const lo = input.type === 'number' ? Number(v.min) : new Date(String(v.min)).getTime();
    const hi = input.type === 'number' ? Number(v.max) : new Date(String(v.max)).getTime();
    if (lo > hi) throw new EntityError('Нижняя граница больше верхней');
  }
  for (const key of ['minLength', 'maxLength'] as const) {
    if (v[key] !== undefined && (!Number.isInteger(v[key]) || (v[key] as number) < 0)) throw new EntityError('Длина задаётся целым числом не меньше нуля');
  }
  if (v.minLength !== undefined && v.maxLength !== undefined && v.minLength > v.maxLength) throw new EntityError('Минимальная длина больше максимальной');
  if (v.pattern) {
    if (v.pattern.length > 200) throw new EntityError('Шаблон проверки длиннее 200 знаков');
    try {
      new RegExp(v.pattern);
    } catch {
      throw new EntityError('Шаблон проверки — некорректное регулярное выражение');
    }
  }

  if (input.hasDefault) {
    if (input.type === 'relation' || input.type === 'user') {
      throw new EntityError('Для связи и сотрудника значение по умолчанию не задаётся');
    }
    // Значение по умолчанию обязано проходить собственные правила поля
    const probe = toFieldDef({
      id: 'probe', key: 'probe', label: input.label.trim(), type: input.type, required: false, order: 0,
      options: input.options ?? null, validation: v,
    });
    coerceScalar(probe, input.defaultValue);
  }
}

/** Столбцы строки поля из входных данных; значение по умолчанию хранится как { v } или {} */
function fieldColumns(input: FieldInput) {
  const validation = normalizeValidation(input.type, input.validation);
  let defaultValue: Record<string, unknown> = {};
  if (input.hasDefault) {
    const probe = toFieldDef({
      id: 'probe', key: 'probe', label: input.label.trim(), type: input.type, required: false, order: 0,
      options: input.options ?? null, validation,
    });
    defaultValue = { v: coerceScalar(probe, input.defaultValue) };
  }
  return {
    description: input.description?.trim() || null,
    defaultValue: defaultValue as Prisma.InputJsonValue,
    isUnique: Boolean(input.unique),
    readonly: Boolean(input.readonly),
    hidden: Boolean(input.hidden),
    validation: validation as unknown as Prisma.InputJsonValue,
    /** Само значение по умолчанию — для заполнения уже существующих записей */
    defaultV: input.hasDefault ? (defaultValue as { v: unknown }).v : undefined,
  };
}

const CHUNK = 200;

/** Обходит записи сущности порциями — чтобы правка структуры не держала в памяти всю таблицу */
async function forEachRecordChunk(
  templateId: string,
  fn: (rows: { id: string; data: Record<string, unknown> }[]) => Promise<void>
): Promise<void> {
  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.entityRecord.findMany({
      where: { templateId },
      select: { id: true, data: true },
      orderBy: { id: 'asc' },
      take: CHUNK,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (rows.length === 0) return;
    await fn(rows.map((r) => ({ id: r.id, data: r.data as Record<string, unknown> })));
    if (rows.length < CHUNK) return;
    cursor = rows[rows.length - 1].id;
  }
}

/** Заменяет содержимое записей одним атомарным пакетом на порцию */
async function rewriteRecords(rows: { id: string; data: Record<string, unknown> }[]): Promise<void> {
  if (rows.length === 0) return;
  await runBatch(
    rows.map((r) => ({ model: 'EntityRecord', operation: 'update', args: { where: { id: r.id }, data: { data: r.data } } }))
  );
}

async function backfill(templateId: string, key: string, value: unknown): Promise<void> {
  await forEachRecordChunk(templateId, async (rows) => {
    await rewriteRecords(rows.filter((r) => isEmpty(r.data[key])).map((r) => ({ id: r.id, data: { ...r.data, [key]: value } })));
  });
}

async function countMissing(templateId: string, key: string): Promise<number> {
  let missing = 0;
  await forEachRecordChunk(templateId, async (rows) => {
    missing += rows.filter((r) => isEmpty(r.data[key])).length;
  });
  return missing;
}

export async function addField(programId: string, templateKey: string, input: FieldInput): Promise<EntityTemplateDef> {
  const template = await getTemplate(programId, templateKey);
  if (!template) throw new EntityError('Сущность не найдена');
  assertFieldPayload(input);
  if (template.hasRecords && input.required && !input.hasDefault) {
    throw new EntityError('В сущности уже есть записи: для обязательного поля задайте значение по умолчанию');
  }

  const key = await (async () => {
    const root = slugify(input.label) || 'pole';
    let candidate = root;
    let n = 2;
    while (template.fields.some((f) => f.key === candidate)) candidate = `${root}-${n++}`;
    return candidate;
  })();

  const { defaultV, ...columns } = fieldColumns(input);
  await prisma.entityField.create({
    data: {
      id: newId(),
      templateId: template.id,
      key,
      label: input.label.trim(),
      type: input.type,
      required: input.required,
      options: input.options ?? undefined,
      order: template.fields.length,
      ...columns,
    },
  });

  // Обязательное поле с уже существующими записями: им проставляется значение по умолчанию
  if (template.hasRecords && input.required && input.hasDefault) {
    await backfill(template.id, key, defaultV);
  }
  return getTemplate(programId, templateKey) as Promise<EntityTemplateDef>;
}

export async function updateField(
  programId: string,
  templateKey: string,
  fieldId: string,
  input: FieldInput
): Promise<EntityTemplateDef> {
  const template = await getTemplate(programId, templateKey);
  if (!template) throw new EntityError('Сущность не найдена');
  const field = template.fields.find((f) => f.id === fieldId);
  if (!field) throw new EntityError('Поле не найдено');
  assertFieldPayload(input);

  const { defaultV, ...columns } = fieldColumns(input);

  if (template.hasRecords) {
    const sameFamily = field.type === input.type || (STRING_TYPES.includes(field.type) && STRING_TYPES.includes(input.type));
    if (!sameFamily) throw new EntityError('Тип поля нельзя изменить, пока в сущности есть записи (текстовые типы меняются между собой)');

    if (field.type === 'relation') {
      const was = (field.options as { targetTemplateId?: string } | null)?.targetTemplateId;
      const now = (input.options as { targetTemplateId?: string } | null)?.targetTemplateId;
      if (was !== now) throw new EntityError('Связь нельзя перенаправить на другую сущность, пока есть записи');
    }

    if (field.type === 'select' || field.type === 'multiselect') {
      const before = (field.options as { choices: string[] } | null)?.choices ?? [];
      const after = (input.options as { choices: string[] } | null)?.choices ?? [];
      const removed = before.filter((c) => !after.includes(c));
      if (removed.length > 0) {
        let used = 0;
        await forEachRecordChunk(template.id, async (rows) => {
          for (const r of rows) {
            const value = r.data[field.key];
            const values = Array.isArray(value) ? value.map(String) : value === undefined || value === null ? [] : [String(value)];
            if (values.some((v) => removed.includes(v))) used++;
          }
        });
        if (used > 0) throw new EntityError(`Удаляемые значения списка используются в записях (${used}) — сначала измените эти записи`);
      }
    }

    if (input.unique && !field.unique) {
      const seen = new Set<string>();
      await forEachRecordChunk(template.id, async (rows) => {
        for (const r of rows) {
          const value = r.data[field.key];
          if (isEmpty(value)) continue;
          const id = JSON.stringify(value);
          if (seen.has(id)) throw new EntityError('В записях уже есть повторяющиеся значения этого поля — уникальность включить нельзя');
          seen.add(id);
        }
      });
    }

    if (input.required && !field.required) {
      const missing = await countMissing(template.id, field.key);
      if (missing > 0) {
        if (!input.hasDefault) {
          throw new EntityError(`У ${missing} записей это поле пусто: задайте значение по умолчанию или заполните его`);
        }
        await backfill(template.id, field.key, defaultV);
      }
    }
  }

  await prisma.entityField.update({
    where: { id: fieldId },
    data: {
      label: input.label.trim(),
      type: input.type,
      required: input.required,
      options: input.options ?? undefined,
      ...columns,
    },
  });
  return getTemplate(programId, templateKey) as Promise<EntityTemplateDef>;
}

export async function removeField(programId: string, templateKey: string, fieldId: string): Promise<EntityTemplateDef> {
  const template = await getTemplate(programId, templateKey);
  if (!template) throw new EntityError('Сущность не найдена');
  const field = template.fields.find((f) => f.id === fieldId);
  if (!field) throw new EntityError('Поле не найдено');

  // Значение удаляемого поля убирается из записей — иначе оно «воскресло» бы в новом поле с тем же ключом
  if (template.hasRecords) {
    await forEachRecordChunk(template.id, async (rows) => {
      await rewriteRecords(
        rows
          .filter((r) => field.key in r.data)
          .map((r) => {
            const rest = { ...r.data };
            delete rest[field.key];
            return { id: r.id, data: rest };
          })
      );
    });
  }

  await prisma.entityField.delete({ where: { id: fieldId } });
  if (template.displayField === field.key) {
    await prisma.entityTemplate.update({ where: { id: template.id }, data: { displayField: null } });
  }
  return getTemplate(programId, templateKey) as Promise<EntityTemplateDef>;
}

export async function reorderFields(
  programId: string,
  templateKey: string,
  orderedFieldIds: string[]
): Promise<EntityTemplateDef> {
  const template = await getTemplate(programId, templateKey);
  if (!template) throw new EntityError('Сущность не найдена');

  await runBatch(
    orderedFieldIds.map((id, order) => ({ model: 'EntityField', operation: 'update', args: { where: { id }, data: { order } } }))
  );
  return getTemplate(programId, templateKey) as Promise<EntityTemplateDef>;
}

// ─── Записи ───

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

  const data = await validateRecordData(programId, template.id, template.fields, input, { applyDefaults: true });
  const row = await prisma.entityRecord.create({
    data: { id: newId(), programId, templateId: template.id, data: data as Prisma.InputJsonValue },
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

  const data = await validateRecordData(programId, template.id, template.fields, input, {
    applyDefaults: false,
    existing: existing.data as Record<string, unknown>,
    excludeId: id,
  });
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
