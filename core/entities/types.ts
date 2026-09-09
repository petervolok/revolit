/**
 * Описания механизма сущностей — общие для сервера и браузера.
 *
 * Семь типов поля реализованы: текст, число, дата, список, список с несколькими
 * значениями, связь, сотрудник. Сотрудник — не то же самое, что связь: он ведёт
 * на учётную запись из ядра, а не на запись другой сущности (Р-22).
 *
 * Тип «файл» из замысла отложен — требует подключённой сменной части
 * для хранения файлов, которая пока нигде не зарегистрирована (Р-21).
 */
export type FieldType = 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'relation' | 'user';

export const FIELD_TYPES: FieldType[] = ['text', 'number', 'date', 'select', 'multiselect', 'relation', 'user'];

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'Текст',
  number: 'Число',
  date: 'Дата',
  select: 'Список значений',
  multiselect: 'Список — можно выбрать несколько',
  relation: 'Связь с другой сущностью',
  user: 'Сотрудник программы',
};

/** Настройки, зависящие от типа поля */
export type FieldOptions =
  | { choices: string[] }
  | { targetTemplateId: string }
  | null;

export interface EntityFieldDef {
  id: string;
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  order: number;
  options: FieldOptions;
}

export interface EntityTemplateDef {
  id: string;
  key: string;
  name: string;
  namePlural: string;
  fields: EntityFieldDef[];
  /** Есть хотя бы одна запись — поля больше не редактируются (Р-19 → следствие) */
  hasRecords: boolean;
}

/**
 * Шаблон сущности из каталога (Р-29). Поле-связь ссылается на другой шаблон
 * по ключу (targetPresetKey), а не на сущность — на этапе описания шаблона
 * сущности ещё нет, она появляется только при создании из шаблона.
 */
export type PresetFieldOptions = { choices: string[] } | { targetPresetKey: string } | null;

export interface PresetFieldDef {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: PresetFieldOptions;
}

/** Готовый шаблон из каталога — уже сохранённый в базе, с id */
export interface EntityPresetDef {
  id: string;
  key: string;
  name: string;
  namePlural: string;
  fields: PresetFieldDef[];
}

export interface EntityRecordDef {
  id: string;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Запись показывается по первому текстовому полю, иначе — по первому непустому значению (Р-36) */
export function recordLabel(record: EntityRecordDef, fields: EntityFieldDef[]): string {
  const textField = fields.find((f) => f.type === 'text');
  if (textField && record.data[textField.key]) return String(record.data[textField.key]);
  const firstValue = fields.map((f) => record.data[f.key]).find((v) => v !== undefined && v !== null && v !== '');
  return firstValue !== undefined ? String(firstValue) : `Запись ${record.id.slice(0, 6)}`;
}

/** Техническое имя из названия: латиница, цифры, дефис */
export function slugify(input: string): string {
  const map: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
    й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
    у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
    э: 'e', ю: 'yu', я: 'ya',
  };
  const transliterated = input
    .toLowerCase()
    .split('')
    .map((ch) => map[ch] ?? ch)
    .join('');
  return transliterated
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}
