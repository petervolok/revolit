import { PrismaClient } from '@prisma/client';
import { createLocalDataPort } from './localPort';
import { getBusDataPort } from './port';
import type { DataPort } from './port';

const globalForPrisma = globalThis as unknown as { basePrisma?: PrismaClient };

/** Настоящий клиент своей базы. Только агент работает с ним напрямую (он терминус шины). */
export const basePrisma = globalForPrisma.basePrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.basePrisma = basePrisma;
}

/** Локальная реализация порта данных — прямой вызов basePrisma. Использует только агент. */
export const localDataPort: DataPort = createLocalDataPort(basePrisma);

/** Приложение всегда работает через шину (Р-44) — прямого режима для него не существует */
export function getDataPort(): DataPort {
  return getBusDataPort();
}

/**
 * Клиент для сервисов ядра. Все операции над моделями перехватываются и уходят в порт
 * (то есть по шине — агент их выполняет настоящим Prisma-клиентом своей базы и публикует
 * доменные события). Сервисы продолжают писать `prisma.entityRecord.findMany(...)` как раньше.
 */
export const prisma: PrismaClient = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args }) {
        if (!model) throw new Error(`Операция ${operation} без модели не поддерживается портом`);
        return getDataPort().execute({ model, operation, args });
      },
    },
  },
}) as unknown as PrismaClient;

/**
 * Пакет операций одним атомарным блоком (ТЗ 3.4). Через шину массив уже созданных запросов
 * передать нельзя, поэтому операции описываются данными, а агент оборачивает их в настоящий
 * $transaction.
 */
export function runBatch(ops: { model: string; operation: string; args?: unknown }[]): Promise<unknown[]> {
  return getDataPort().runBatch(ops);
}
