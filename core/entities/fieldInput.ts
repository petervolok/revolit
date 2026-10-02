import type { FieldInput } from './service';
import type { FieldType, FieldValidation } from './types';

/** Разбор тела запроса «создать/изменить поле»; вместо ошибки возвращает текст для пользователя */
export function parseFieldInput(body: unknown): FieldInput | string {
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  if (typeof b.label !== 'string' || typeof b.type !== 'string') return 'Заполните название и тип поля';

  const validation = typeof b.validation === 'object' && b.validation !== null ? (b.validation as FieldValidation) : undefined;
  return {
    label: b.label,
    type: b.type as FieldType,
    required: Boolean(b.required),
    options: (b.options as FieldInput['options']) ?? null,
    description: typeof b.description === 'string' ? b.description : null,
    hasDefault: Boolean(b.hasDefault),
    defaultValue: b.defaultValue,
    unique: Boolean(b.unique),
    readonly: Boolean(b.readonly),
    hidden: Boolean(b.hidden),
    validation,
  };
}
