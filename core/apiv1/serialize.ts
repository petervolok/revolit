import type { EntityRecordDef, EntityTemplateDef } from '../entities/types';

/** Запись в ответе API: данные лежат в data, чтобы ключи полей не сталкивались со служебными */
export function toApiRecord(r: EntityRecordDef) {
  return { id: r.id, createdAt: r.createdAt, updatedAt: r.updatedAt, data: r.data };
}

export function toApiTemplate(t: EntityTemplateDef) {
  return {
    key: t.key,
    name: t.name,
    namePlural: t.namePlural,
    description: t.description,
    displayField: t.displayField,
    fields: t.fields.map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      required: f.required,
      readonly: f.readonly,
      unique: f.unique,
      options: f.options,
      validation: f.validation,
      ...(f.hasDefault ? { default: f.defaultValue } : {}),
    })),
    // Что можно делать с записями; для токена с полными правами поле не заполняется
    ...(t.access ? { permissions: t.access } : {}),
  };
}
