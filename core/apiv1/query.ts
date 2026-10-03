/**
 * Язык запросов публичного API: параметры адресной строки в привычном виде.
 *
 *   ?q=текст                       поиск по всем полям
 *   ?sort=-price                   сортировка (минус — по убыванию)
 *   ?page=2&pageSize=50            страница
 *   ?filter[price][gte]=100        условие: поле, операция, значение
 *   ?filter[kind]=еда              короткая запись — «равно»
 *   ?filter[kind][in]=еда,книги    «одно из»
 *   ?filter[price][empty]=true     «пусто» (notEmpty — «не пусто»)
 *
 * Операции: eq, ne, contains, gt, gte, lt, lte, in, empty, notEmpty. Условия складываются через «и».
 */
import { FILTER_OPS } from '../entities/query';
import type { FilterOp, RecordFilter, RecordQuery } from '../entities/query';

const FILTER_KEY = /^filter\[([^\]]+)\](?:\[([A-Za-z]+)\])?$/;
const MAX_FILTERS = 20;

export function parseApiQuery(params: URLSearchParams): RecordQuery | string {
  const query: RecordQuery = {};

  const q = params.get('q');
  if (q) query.q = q.slice(0, 200);

  const sort = params.get('sort');
  if (sort) {
    const desc = sort.startsWith('-');
    const field = (desc ? sort.slice(1) : sort).trim();
    if (!field || field.includes(',')) return 'Сортировка — по одному полю: sort=поле или sort=-поле';
    query.sort = { field, dir: desc ? 'desc' : 'asc' };
  }

  for (const [name, limit] of [['page', 1_000_000], ['pageSize', 200]] as const) {
    const raw = params.get(name);
    if (raw === null) continue;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > limit) return `Параметр ${name} — целое число от 1 до ${limit}`;
    query[name] = n;
  }

  const filters: RecordFilter[] = [];
  for (const [key, value] of params.entries()) {
    const m = FILTER_KEY.exec(key);
    if (!m) {
      if (key.startsWith('filter')) return `Условие фильтра задано неверно: ${key}. Пример: filter[поле][gte]=5`;
      continue;
    }
    const op = (m[2] ?? 'eq') as FilterOp;
    if (!FILTER_OPS.includes(op)) return `Неизвестная операция в фильтре: ${m[2]}. Доступны: ${FILTER_OPS.join(', ')}`;
    if (op === 'empty' || op === 'notEmpty') {
      if (value !== 'true') return `Для операции ${op} значение — true`;
      filters.push({ field: m[1], op });
    } else if (op === 'in') {
      filters.push({ field: m[1], op, value: value.split(',').map((x) => x.trim()).filter(Boolean) });
    } else {
      filters.push({ field: m[1], op, value });
    }
  }
  if (filters.length > MAX_FILTERS) return `Условий фильтра не больше ${MAX_FILTERS}`;
  if (filters.length > 0) query.filters = filters;
  return query;
}
