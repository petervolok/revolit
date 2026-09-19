import { PrismaClient } from '@prisma/client';
import { createLocalDataPort } from './localPort';
import { dataMode, getBusDataPort, isProxied } from './port';
import type { DataPort } from './port';

const globalForPrisma = globalThis as unknown as { basePrisma?: PrismaClient };

/** Настоящий клиент своей базы. Агент и режим `direct` работают именно с ним. */
export const basePrisma = globalForPrisma.basePrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.basePrisma = basePrisma;
}

/** Локальная реализация порта данных — прямой вызов basePrisma */
export const localDataPort: DataPort = createLocalDataPort(basePrisma);

/**
 * Порт, через который сейчас идут доменные операции: в режиме `direct` — локальный,
 * в режиме `bus` — шинный (ТЗ 3.1).
 */
export function getDataPort(): DataPort {
  return dataMode() === 'bus' ? getBusDataPort() : localDataPort;
}

/**
 * Клиент для сервисов ядра. В режиме `direct` это сам basePrisma — поведение
 * не отличается от прежнего. В режиме `bus` операции над доменными моделями
 * перехватываются и уходят в порт (ТЗ 3.2); сервисы продолжают писать
 * `prisma.entityRecord.findMany(...)` как раньше. Учётные модели (User, Role,
 * Session …) проходят напрямую в локальную БД в любом режиме.
 */
const intercepting = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!isProxied(model)) return query(args);
        return getDataPort().execute({ model, operation, args });
      },
    },
  },
}) as unknown as PrismaClient;

export const prisma: PrismaClient = dataMode() === 'bus' ? intercepting : basePrisma;

/**
 * Пакет операций одним атомарным блоком (ТЗ 3.4). Заменяет `prisma.$transaction([...])`
 * на доменных моделях: через шину массив уже созданных запросов передать нельзя,
 * поэтому операции описываются данными, а агент оборачивает их в настоящий $transaction.
 */
export function runBatch(ops: { model: string; operation: string; args?: unknown }[]): Promise<unknown[]> {
  return getDataPort().runBatch(ops);
}
