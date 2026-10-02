/**
 * Выполнение записи на БД №2 и сбор изменений для БД №1 (docs/08-decisions.md Р-45, заменяет
 * dualWrite.ts из Р-41). Операция исполняется на своей БД первой — это источник истины; затем
 * по тронутым ключам читается итоговое состояние строк, и изменения передаются СОСТОЯНИЕМ
 * (итоговая строка или удаление по ключу), а не повтором операции. Чувствительные строки
 * в изменения не попадают — решение принимается по каждой строке отдельно.
 *
 * Всё выполняется внутри переданной транзакции: вместе с записью журнала операций она
 * фиксируется или откатывается целиком.
 */
import { callOperation } from '../../../core/data/localPort';
import type { PrismaClient } from '@prisma/client';
import type { DataOperation } from '../../../core/data/port';
import type { DataChange } from '../../../core/bus/protocol';
import { WRITE_OPERATIONS } from '../../../core/data/domainEvents';
import type { AgentPrismaClient } from './client';
import { evaluateRecordSensitivity, isRecordSensitive } from './sensitivity';

type Row = Record<string, unknown>;
type Key = Record<string, unknown>;

interface Delegate {
  findFirst(args: unknown): Promise<Row | null>;
  findMany(args: unknown): Promise<Row[]>;
  findUnique(args: unknown): Promise<Row | null>;
}

/** Модели, у которых чувствительность выводится из связанной записи сущности */
const RECORD_LINKED = new Set(['ProcessInstance', 'Task', 'Attachment']);

const isRec = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);

function delegateOf(db: unknown, model: string): Delegate {
  const d = (db as Record<string, unknown>)[model.charAt(0).toLowerCase() + model.slice(1)];
  if (!d) throw new Error(`Неизвестная модель: ${model}`);
  return d as Delegate;
}

/** Ключ строки: `{ id }`, у UserRole — составной. null — ключа в строке нет, передать её нельзя */
export function keyOf(model: string, row: Row): Key | null {
  if (model === 'UserRole') {
    return typeof row.userId === 'string' && typeof row.roleId === 'string' ? { userId: row.userId, roleId: row.roleId } : null;
  }
  return typeof row.id === 'string' ? { id: row.id } : null;
}

const keyString = (model: string, key: Key) => `${model}:${JSON.stringify(Object.entries(key).sort())}`;

/** Чувствительна ли строка — решает по текущим данным и правилам, признак нигде не хранится (Р-41) */
export async function rowIsSensitive(db: AgentPrismaClient, model: string, row: Row): Promise<boolean> {
  if (model === 'EntityRecord') {
    const template = await db.entityTemplate.findUnique({ where: { id: String(row.templateId) }, select: { key: true } });
    if (!template) return false; // не должно случиться; лучше показать, чем молча спрятать
    return evaluateRecordSensitivity(db, String(row.programId), template.key, (row.data as Row) ?? {});
  }
  if (RECORD_LINKED.has(model)) {
    return isRecordSensitive(db, String(row.programId), (row.entityRecordId as string | null | undefined) ?? null);
  }
  // Прочие модели (шаблоны, этапы, учётные данные, настройки) бизнес-данных клиента, которые
  // нужно прятать, сами по себе не несут
  return false;
}

/** Строки, которые операция затронет, — читаются ДО исполнения: нужны для удалений и операций *Many */
export async function preRead(db: AgentPrismaClient, op: DataOperation): Promise<Row[]> {
  const where = isRec(op.args) && isRec(op.args.where) ? op.args.where : null;
  if (!where || !WRITE_OPERATIONS.has(op.operation)) return [];
  const d = delegateOf(db, op.model);
  if (op.operation === 'updateMany' || op.operation === 'deleteMany') return d.findMany({ where });
  if (op.operation === 'update' || op.operation === 'delete' || op.operation === 'upsert') {
    const row = await d.findUnique({ where });
    return row ? [row] : [];
  }
  return [];
}

/** Собирает изменения по итогам исполнения: тронутые ключи → итоговое состояние → фильтр по чувствительности */
export async function collectChanges(db: AgentPrismaClient, ops: DataOperation[], results: unknown[], pres: Row[][]): Promise<DataChange[]> {
  const touched = new Map<string, { model: string; key: Key }>();
  const before = new Map<string, Row>();

  const touch = (model: string, row: Row) => {
    const key = keyOf(model, row);
    if (key) touched.set(keyString(model, key), { model, key });
    return key;
  };

  ops.forEach((op, i) => {
    for (const row of pres[i] ?? []) {
      const key = touch(op.model, row);
      if (key) before.set(keyString(op.model, key), row);
    }
    const result = results[i];
    if (['create', 'update', 'upsert', 'delete'].includes(op.operation) && isRec(result)) touch(op.model, result);
    if (op.operation === 'createMany') {
      const data = isRec(op.args) ? op.args.data : undefined;
      for (const item of Array.isArray(data) ? data : data ? [data] : []) if (isRec(item)) touch(op.model, item);
    }
  });

  const changes: DataChange[] = [];
  for (const { model, key } of touched.values()) {
    const row = await delegateOf(db, model).findFirst({ where: key });
    if (row) {
      if (await rowIsSensitive(db, model, row)) continue;
      changes.push({ model, op: 'upsert', key, row });
    } else {
      // Строки больше нет: если до удаления она была чувствительной, в БД №1 её не было и сообщать нечего
      const was = before.get(keyString(model, key));
      if (was && (await rowIsSensitive(db, model, was))) continue;
      changes.push({ model, op: 'delete', key });
    }
  }
  return changes;
}

export interface WriteOutcome {
  results: unknown[];
  changes: DataChange[];
}

/** Исполняет операции последовательно в переданной транзакции и собирает изменения */
export async function runWrites(tx: AgentPrismaClient, ops: DataOperation[]): Promise<WriteOutcome> {
  const results: unknown[] = [];
  const pres: Row[][] = [];
  for (const op of ops) {
    // Читаем «до» перед КАЖДОЙ операцией: пакет может удалять то, что создала предыдущая его операция
    pres.push(await preRead(tx, op));
    results.push(await callOperation(tx as unknown as PrismaClient, op));
  }
  return { results, changes: await collectChanges(tx, ops, results, pres) };
}
