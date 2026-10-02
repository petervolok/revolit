import { PrismaClient } from '@prisma/client';
import { coreEvents } from '../events/coreEvents';
import { deriveDomainEvents, WRITE_OPERATIONS } from './domainEvents';
import { createLocalDataPort } from './localPort';
import { dataMode, getBusDataPort } from './port';
import type { DataPort } from './port';

const globalForPrisma = globalThis as unknown as { basePrisma?: PrismaClient };

/** Настоящий клиент своей базы. С ним напрямую работают агент и приложение в режиме `direct`. */
export const basePrisma = globalForPrisma.basePrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.basePrisma = basePrisma;
}

/** Локальная реализация порта данных — прямой вызов basePrisma */
export const localDataPort: DataPort = createLocalDataPort(basePrisma);

/**
 * Порт, через который идут операции приложения: шина (по умолчанию) или прямой вызов — режим
 * выбирается при развёртывании (`DATA_MODE`, см. port.ts, Р-45 этап 4).
 */
export function getDataPort(): DataPort {
  return dataMode() === 'direct' ? localDataPort : getBusDataPort();
}

/**
 * Клиент для сервисов ядра. Все операции над моделями перехватываются и уходят в порт — по шине
 * или напрямую. Сервисы продолжают писать `prisma.entityRecord.findMany(...)` как раньше.
 * В режиме `bus` доменные события публикует агент; в режиме `direct` агента нет, поэтому после
 * записи они выводятся и отправляются здесь же (ТЗ 6).
 */
export const prisma: PrismaClient = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args }) {
        if (!model) throw new Error(`Операция ${operation} без модели не поддерживается портом`);
        const result = await getDataPort().execute({ model, operation, args });

        if (dataMode() === 'direct' && WRITE_OPERATIONS.has(operation)) {
          for (const e of deriveDomainEvents(model, operation, args, result)) {
            await coreEvents.emit(e.event, e.payload as never);
          }
        }
        return result;
      },
    },
  },
}) as unknown as PrismaClient;

/**
 * Пакет операций одним атомарным блоком (ТЗ 3.4). Через шину массив уже созданных запросов
 * передать нельзя, поэтому операции описываются данными, а агент оборачивает их в настоящий
 * $transaction (в режиме `direct` порт делает это сам).
 */
export function runBatch(ops: { model: string; operation: string; args?: unknown }[]): Promise<unknown[]> {
  return getDataPort().runBatch(ops);
}
