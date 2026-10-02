/**
 * Описания механизма сущностей — общие для сервера и браузера.
 *
 * Типы поля: текст, длинный текст, число, да/нет, дата, дата и время, список, список с несколькими
 * значениями, связь, сотрудник, JSON, почта, ссылка, телефон. Сотрудник — не то же самое, что связь:
 * он ведёт на учётную запись из ядра, а не на запись другой сущности (Р-22).
 *
 * Тип «файл» из замысла отложен — вложения живут отдельно (Р-38), поле-файл придёт со строкой 10
 * таблицы покрытия.
 */
export type FieldType =
  | 'text'
  | 'longtext'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'select'
  | 'multiselect'
  | 'relation'
  | 'user'
  | 'json'
  | 'email'
  | 'url'
  | 'phone';

export const FIELD_TYPES: FieldType[] = [
  'text', 'longtext', 'number', 'boolean', 'date', 'datetime', 'select', 'multiselect',
  'relation', 'user', 'json', 'email', 'url', 'phone',
];

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'Текст',
  longtext: 'Длинный текст',
  number: 'Число',
  boolean: 'Да / нет',
  date: 'Дата',
  datetime: 'Дата и время',
  select: 'Список значений',
  multiselect: 'Список — можно выбрать несколько',
  relation: 'Связь с другой сущностью',
  user: 'Сотрудник программы',
  json: 'JSON',
  email: 'Почта',
  url: 'Ссылка',
  phone: 'Телефон',
};

/** Типы, значение которых — строка: между ними можно менять тип, пока в сущности есть записи */
export const STRING_TYPES: FieldType[] = ['text', 'longtext', 'email', 'url', 'phone'];

/** Для каких типов можно потребовать уникальность значения */
export const UNIQUE_TYPES: FieldType[] = ['text', 'email', 'url', 'phone', 'number', 'date', 'datetime', 'relation', 'user'];

/** Настройки, зависящие от типа поля */
export type FieldOptions =
  | { choices: string[] }
  | { targetTemplateId: string }
  | null;

/** Правила проверки значения; применяются только к подходящим типам */
export interface FieldValidation {
  /** число, дата, дата и время: нижняя граница */
  min?: number | string;
  /** число, дата, дата и время: верхняя граница */
  max?: number | string;
  /** строковые типы: длина */
  minLength?: number;
  maxLength?: number;
  /** число: только целые */
  integer?: boolean;
  /** строковые типы: регулярное выражение, которому должно соответствовать значение */
  pattern?: string;
  /** Своё сообщение при нарушении правил */
  message?: string;
}

export interface EntityFieldDef {
  id: string;
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  order: number;
  options: FieldOptions;
  /** Подпись-подсказка под полем в форме */
  description: string | null;
  /** Задано ли значение по умолчанию (у `null` и пустой строки тоже может быть смысл, поэтому отдельный признак) */
  hasDefault: boolean;
  defaultValue?: unknown;
  /** Значение не повторяется среди записей сущности */
  unique: boolean;
  /** Нельзя менять после создания записи */
  readonly: boolean;
  /** Не показывается колонкой в списке */
  hidden: boolean;
  validation: FieldValidation;
}

export interface EntityTemplateDef {
  id: string;
  key: string;
  name: string;
  namePlural: string;
  description: string | null;
  /** Имя значка из набора lucide */
  icon: string | null;
  /** Ключ поля, по которому запись показывается в связях и заголовках */
  displayField: string | null;
  fields: EntityFieldDef[];
  /** Есть хотя бы одна запись — часть правок полей ограничена (тип, удаление выбранных значений) */
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

/** Значение поля как текст для списков и заголовков */
export function displayValue(field: Pick<EntityFieldDef, 'type'>, value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (field.type === 'boolean') return value === true ? 'да' : 'нет';
  if (Array.isArray(value)) return value.map(String).join(', ');
  if (field.type === 'json') {
    const text = JSON.stringify(value);
    return text.length > 80 ? `${text.slice(0, 77)}…` : text;
  }
  if (field.type === 'date' || field.type === 'datetime') {
    const d = new Date(String(value));
    if (!Number.isNaN(d.getTime())) {
      return field.type === 'date' ? d.toLocaleDateString('ru-RU') : d.toLocaleString('ru-RU');
    }
  }
  return String(value);
}

/**
 * Запись показывается по полю, заданному у сущности (`displayField`), иначе по первому текстовому
 * полю, иначе по первому непустому значению (Р-36)
 */
export function recordLabel(record: EntityRecordDef, fields: EntityFieldDef[], displayField?: string | null): string {
  const chosen = displayField ? fields.find((f) => f.key === displayField) : undefined;
  if (chosen) {
    const text = displayValue(chosen, record.data[chosen.key]);
    if (text) return text;
  }
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
