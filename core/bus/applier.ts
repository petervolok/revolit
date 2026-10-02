/**
 * Применение входящих изменений к своей базе (Р-45). Изменение — итоговая строка или удаление
 * по ключу, то есть состояние, а не дельта: повторное применение того же сообщения не портит
 * данные. От устаревшего снимка защищает `updatedAt`: если в базе строка новее пришедшей,
 * изменение пропускается.
 *
 * Работает на агенте: он единственный, кто пишет в свою базу напрямую. Механизм универсальный —
 * источником изменений может быть любой участник шины, который знает протокол.
 */
import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import type { DataChange } from './protocol';

/** Модели с составным первичным ключом: имя составного уникального ограничения Prisma */
const COMPOSITE_UNIQUE: Record<string, string> = { UserRole: 'userId_roleId' };

interface Delegate {
  findFirst(args: unknown): Promise<Record<string, unknown> | null>;
  upsert(args: unknown): Promise<unknown>;
  deleteMany(args: unknown): Promise<unknown>;
}

let jsonFields: Map<string, Set<string>> | null = null;

/** Json-столбцы по моделям: null в них Prisma принимает только как Prisma.DbNull */
function jsonFieldsOf(model: string): Set<string> {
  if (!jsonFields) {
    jsonFields = new Map();
    for (const m of Prisma.dmmf.datamodel.models) {
      jsonFields.set(m.name, new Set(m.fields.filter((f) => f.type === 'Json').map((f) => f.name)));
    }
  }
  return jsonFields.get(model) ?? new Set();
}

function delegateOf(client: unknown, model: string): Delegate {
  const name = model.charAt(0).toLowerCase() + model.slice(1);
  const d = (client as Record<string, unknown>)[name];
  if (!d) throw new Error(`Неизвестная модель: ${model}`);
  return d as Delegate;
}

function dataOf(change: DataChange): Record<string, unknown> {
  const json = jsonFieldsOf(change.model);
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(change.row ?? {})) {
    if (k in change.key) continue;
    data[k] = v === null && json.has(k) ? Prisma.DbNull : v;
  }
  return data;
}

export interface ApplyResult {
  applied: number;
  skipped: number;
}

/** Применяет изменения одной операции атомарно. Возвращает, сколько применено и сколько пропущено как устаревшие. */
export async function applyChanges(client: PrismaClient, changes: DataChange[]): Promise<ApplyResult> {
  const result: ApplyResult = { applied: 0, skipped: 0 };

  await client.$transaction(async (tx) => {
    for (const change of changes) {
      const d = delegateOf(tx, change.model);

      if (change.op === 'delete') {
        await d.deleteMany({ where: change.key });
        result.applied++;
        continue;
      }

      const row = change.row ?? {};
      const incoming = row.updatedAt;
      if (incoming instanceof Date) {
        const existing = await d.findFirst({ where: change.key, select: { updatedAt: true } });
        const current = existing?.updatedAt;
        if (current instanceof Date && current.getTime() > incoming.getTime()) {
          result.skipped++;
          continue;
        }
      }

      const composite = COMPOSITE_UNIQUE[change.model];
      const where = composite ? { [composite]: change.key } : change.key;
      const create = { ...change.key, ...dataOf(change) };
      await d.upsert({ where, create, update: dataOf(change) });
      result.applied++;
    }
  });

  return result;
}
