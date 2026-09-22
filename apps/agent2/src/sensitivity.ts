/**
 * Вычисление чувствительности — существует ТОЛЬКО здесь, в сборке сервера №2.
 * Ничего из этого файла не импортируется и не может импортироваться из core
 * или apps/agent (сборки сервера №1) — они физически не видят эту папку
 * (Dockerfile копирует apps/agent2 только в образ агента №2).
 *
 * Признак не хранится нигде — вычисляется заново на каждой записи из текущих
 * данных и текущих правил. Это снимает проблему «протухшего» флага: смена
 * правила или правка данных сразу учитывается на следующей операции с записью
 * (но не пересчитывает задним числом уже лежащие в БД №1 записи — это
 * сознательно оставлено вне объёма, см. docs/11-core-rework-progress.md).
 */
import type { AgentPrismaClient } from './client';

interface Condition {
  field: string;
  op: 'eq' | 'ne' | 'in' | 'not_in' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains';
  value: unknown;
}

function matchCondition(data: Record<string, unknown>, c: Condition): boolean {
  const actual = data[c.field];
  switch (c.op) {
    case 'eq':
      return actual === c.value;
    case 'ne':
      return actual !== c.value;
    case 'in':
      return Array.isArray(c.value) && c.value.includes(actual);
    case 'not_in':
      return Array.isArray(c.value) && !c.value.includes(actual);
    case 'gt':
      return typeof actual === 'number' && typeof c.value === 'number' && actual > c.value;
    case 'gte':
      return typeof actual === 'number' && typeof c.value === 'number' && actual >= c.value;
    case 'lt':
      return typeof actual === 'number' && typeof c.value === 'number' && actual < c.value;
    case 'lte':
      return typeof actual === 'number' && typeof c.value === 'number' && actual <= c.value;
    case 'contains':
      return Array.isArray(actual) && actual.includes(c.value);
    default:
      return false;
  }
}

function matchesRule(data: Record<string, unknown>, conditions: unknown): boolean {
  if (!Array.isArray(conditions) || conditions.length === 0) return false;
  return conditions.every((c) => matchCondition(data, c as Condition));
}

/** Чувствительна ли запись с такими данными по правилам её сущности */
export async function evaluateRecordSensitivity(
  db: AgentPrismaClient,
  programId: string,
  templateKey: string,
  data: Record<string, unknown>
): Promise<boolean> {
  const rules = await db.sensitivityRule.findMany({ where: { programId, templateKey, enabled: true } });
  return rules.some((rule) => matchesRule(data, rule.conditions));
}

/** Чувствительна ли запись по её id (используется для дел/задач/вложений через entityRecordId) */
export async function isRecordSensitive(db: AgentPrismaClient, programId: string, entityRecordId: string | null | undefined): Promise<boolean> {
  if (!entityRecordId) return false; // нечего скрывать — не привязано ни к одной записи

  const record = await db.entityRecord.findFirst({
    where: { id: entityRecordId, programId },
    include: { template: { select: { key: true } } },
  });
  if (!record) return false;

  return evaluateRecordSensitivity(db, programId, record.template.key, record.data as Record<string, unknown>);
}
