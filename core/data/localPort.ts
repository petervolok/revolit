import type { PrismaClient } from '@prisma/client';
import type { DataOperation, DataPort } from './port';

/** Делегат модели по имени: 'EntityRecord' → client.entityRecord */
function delegate(client: PrismaClient, model: string): Record<string, (args?: unknown) => unknown> {
  const name = model.charAt(0).toLowerCase() + model.slice(1);
  const d = (client as unknown as Record<string, unknown>)[name];
  if (!d) throw new Error(`Неизвестная модель: ${model}`);
  return d as Record<string, (args?: unknown) => unknown>;
}

function call(client: PrismaClient, op: DataOperation): Promise<unknown> {
  const fn = delegate(client, op.model)[op.operation];
  if (typeof fn !== 'function') throw new Error(`Операция ${op.model}.${op.operation} не поддерживается`);
  return fn.call(delegate(client, op.model), op.args) as Promise<unknown>;
}

/**
 * Локальная реализация — прямой вызов Prisma-клиента (режим `direct`, поведение
 * до переработки). Её же использует агент на стороне шины: он выполняет пришедшие
 * операции настоящим клиентом своей базы.
 */
export function createLocalDataPort(client: PrismaClient): DataPort {
  return {
    execute: (op) => call(client, op),
    // Массив отложенных запросов Prisma исполняется одной транзакцией — атомарно
    runBatch: (ops) => client.$transaction(ops.map((op) => call(client, op) as never)) as Promise<unknown[]>,
  };
}
