/**
 * Запрос к записям сущности: поиск, фильтры, сортировка, страница (строка 3 таблицы покрытия).
 * Чистые функции без базы — работают и на сервере, и в проверках. Записи хранятся JSON-ом (Р-19),
 * поэтому сортировку по полю внутри JSON база не делает; сервер перебирает записи порциями,
 * отбирает и сортирует их здесь и отдаёт браузеру только одну страницу.
 */
import { displayValue } from './types';
import type { EntityFieldDef, EntityRecordDef } from './types';

export type FilterOp = 'eq' | 'ne' | 'contains' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'empty' | 'notEmpty';

export const FILTER_OPS: FilterOp[] = ['eq', 'ne', 'contains', 'gt', 'gte', 'lt', 'lte', 'in', 'empty', 'notEmpty'];

export const FILTER_OP_LABELS: Record<FilterOp, string> = {
  eq: 'равно',
  ne: 'не равно',
  contains: 'содержит',
  gt: 'больше',
  gte: 'не меньше',
  lt: 'меньше',
  lte: 'не больше',
  in: 'одно из',
  empty: 'пусто',
  notEmpty: 'не пусто',
};

export interface RecordFilter {
  /** Ключ поля или служебные createdAt / updatedAt */
  field: string;
  op: FilterOp;
  value?: unknown;
}

export interface RecordSort {
  field: string;
  dir: 'asc' | 'desc';
}

export interface RecordQuery {
  /** Текстовый поиск по всем полям */
  q?: string;
  filters?: RecordFilter[];
  sort?: RecordSort;
  page?: number;
  pageSize?: number;
}

export interface RecordPage {
  records: EntityRecordDef[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 200;
export const SYSTEM_FIELDS = ['createdAt', 'updatedAt'];

/** Какие операции осмысленны для типа поля — по ним строится выбор в экране */
export function opsForType(type: EntityFieldDef['type'] | 'system'): FilterOp[] {
  switch (type) {
    case 'number':
    case 'date':
    case 'datetime':
    case 'system':
      return ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'empty', 'notEmpty'];
    case 'boolean':
      return ['eq', 'ne'];
    case 'select':
      return ['eq', 'ne', 'in', 'empty', 'notEmpty'];
    case 'multiselect':
    case 'relations':
      return ['contains', 'empty', 'notEmpty'];
    case 'relation':
    case 'user':
      return ['eq', 'ne', 'in', 'empty', 'notEmpty'];
    default:
      return ['contains', 'eq', 'ne', 'empty', 'notEmpty'];
  }
}

function isEmptyValue(v: unknown): boolean {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
}

/** Значение поля записи для сравнения; служебные поля — из самой записи */
function valueOf(record: EntityRecordDef, field: string): unknown {
  return field === 'createdAt' || field === 'updatedAt' ? record[field] : record.data[field];
}

type Comparable = number | string;

function comparable(type: EntityFieldDef['type'] | 'system', v: unknown): Comparable | null {
  if (isEmptyValue(v)) return null;
  if (type === 'number') return Number(v);
  if (type === 'date' || type === 'datetime' || type === 'system') {
    const t = new Date(String(v)).getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (type === 'boolean') return v === true ? 1 : 0;
  return String(v).toLowerCase();
}

function matchFilter(record: EntityRecordDef, f: RecordFilter, fields: Map<string, EntityFieldDef>): boolean {
  const def = fields.get(f.field);
  const type = def ? def.type : 'system';
  const raw = valueOf(record, f.field);

  if (f.op === 'empty') return isEmptyValue(raw);
  if (f.op === 'notEmpty') return !isEmptyValue(raw);

  if (f.op === 'contains') {
    if (Array.isArray(raw)) return raw.map(String).includes(String(f.value));
    return String(raw ?? '').toLowerCase().includes(String(f.value ?? '').toLowerCase());
  }
  if (f.op === 'in') {
    const set = (Array.isArray(f.value) ? f.value : String(f.value ?? '').split(',')).map((x) => String(x).trim().toLowerCase());
    return !isEmptyValue(raw) && set.includes(String(raw).toLowerCase());
  }

  const left = comparable(type, raw);
  const target = type === 'boolean' ? (f.value === true || f.value === 'true' ? 1 : 0) : comparable(type, f.value);
  if (f.op === 'eq') return left !== null && left === target;
  if (f.op === 'ne') return left === null || left !== target;
  if (left === null || target === null || typeof left !== typeof target) return false;
  if (f.op === 'gt') return left > target;
  if (f.op === 'gte') return left >= target;
  if (f.op === 'lt') return left < target;
  return left <= target; // lte
}

function matchSearch(record: EntityRecordDef, fields: EntityFieldDef[], q: string): boolean {
  return fields.some((f) => displayValue(f, record.data[f.key]).toLowerCase().includes(q) || String(record.data[f.key] ?? '').toLowerCase().includes(q));
}

function compare(a: unknown, b: unknown, type: EntityFieldDef['type'] | 'system'): number {
  const x = comparable(type, a);
  const y = comparable(type, b);
  // Пустые значения всегда в конце, в каком бы порядке ни сортировали
  if (x === null && y === null) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  if (typeof x === 'number' && typeof y === 'number') return x - y;
  return String(x).localeCompare(String(y), 'ru');
}

/** Подходит ли запись под все условия (для автоматизаций и других мест, где нужна проверка одной записи) */
export function recordMatches(record: EntityRecordDef, fields: EntityFieldDef[], filters: RecordFilter[]): boolean {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  return filters.every((f) => matchFilter(record, f, byKey));
}

/** Отбор по поиску и фильтрам, сортировка, страница. Неизвестные поля в фильтре и сортировке — ошибка */
export function applyQuery(records: EntityRecordDef[], fields: EntityFieldDef[], query: RecordQuery): RecordPage {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const known = (key: string) => byKey.has(key) || SYSTEM_FIELDS.includes(key);

  for (const f of query.filters ?? []) {
    if (!known(f.field)) throw new Error(`Неизвестное поле в фильтре: ${f.field}`);
    if (!FILTER_OPS.includes(f.op)) throw new Error(`Неизвестная операция в фильтре: ${String(f.op)}`);
  }
  if (query.sort && !known(query.sort.field)) throw new Error(`Неизвестное поле сортировки: ${query.sort.field}`);

  const q = (query.q ?? '').trim().toLowerCase();
  let rows = records;
  if (q) rows = rows.filter((r) => matchSearch(r, fields, q));
  for (const f of query.filters ?? []) rows = rows.filter((r) => matchFilter(r, f, byKey));

  if (query.sort) {
    const { field, dir } = query.sort;
    const type = byKey.get(field)?.type ?? 'system';
    const sign = dir === 'desc' ? -1 : 1;
    rows = [...rows].sort((a, b) => {
      const av = valueOf(a, field);
      const bv = valueOf(b, field);
      const emptyA = isEmptyValue(av);
      const emptyB = isEmptyValue(bv);
      if (emptyA || emptyB) return compare(av, bv, type); // пустые — в конце при любом порядке
      return sign * compare(av, bv, type);
    });
  }

  const pageSize = Math.min(Math.max(Math.floor(query.pageSize ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(Math.floor(query.page ?? 1) || 1, 1), pages);
  return { records: rows.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize, pages };
}

/** Разбор параметров адресной строки; вместо исключения возвращает текст ошибки */
export function parseRecordQuery(params: URLSearchParams): RecordQuery | string {
  const query: RecordQuery = {};
  const q = params.get('q');
  if (q) query.q = q.slice(0, 200);

  const page = params.get('page');
  if (page) query.page = Number(page);
  const pageSize = params.get('pageSize');
  if (pageSize) query.pageSize = Number(pageSize);

  const sort = params.get('sort');
  if (sort) query.sort = { field: sort, dir: params.get('dir') === 'desc' ? 'desc' : 'asc' };

  const filter = params.get('filter');
  if (filter) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(filter);
    } catch {
      return 'Фильтр задан неверно: это не JSON';
    }
    if (!Array.isArray(parsed) || parsed.length > 20) return 'Фильтр — список не длиннее 20 условий';
    const filters: RecordFilter[] = [];
    for (const item of parsed) {
      const f = item as Partial<RecordFilter>;
      if (typeof f?.field !== 'string' || typeof f.op !== 'string' || !FILTER_OPS.includes(f.op as FilterOp)) {
        return 'Условие фильтра должно содержать поле (field) и операцию (op)';
      }
      filters.push({ field: f.field, op: f.op as FilterOp, value: f.value });
    }
    query.filters = filters;
  }
  return query;
}

/** Есть ли в параметрах что-то, что просит постраничный ответ (иначе работает прежний — полный список) */
export function wantsPage(params: URLSearchParams): boolean {
  return ['q', 'page', 'pageSize', 'sort', 'filter'].some((k) => params.has(k));
}
