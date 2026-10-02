/**
 * Порт данных (Р-44: шина обязательна для каждой установки, режима `direct` не
 * существует). Операция над моделью описывается как { model, operation, args } —
 * по образцу MailPort/StoragePort. Приложение всегда обращается к шинной реализации;
 * прямой локальный порт (`createLocalDataPort`) использует только сам агент — он
 * терминус шины и обязан писать в свою базу напрямую, это не то же самое, что «режим
 * direct» приложения, которого больше нет.
 */

export interface DataOperation {
  /** Имя модели Prisma в PascalCase, как его отдаёт $extends: 'EntityRecord' */
  model: string;
  /** findMany, findFirst, create, update, delete, count, createMany … */
  operation: string;
  args?: unknown;
}

export interface DataPort {
  execute(op: DataOperation): Promise<unknown>;
  /** Пакет операций одним атомарным блоком (на стороне агента — настоящий $transaction) */
  runBatch(ops: DataOperation[]): Promise<unknown[]>;
}

export type DataMode = 'bus' | 'direct';

/**
 * Как приложение добирается до базы — выбирается при развёртывании переменной окружения, не из
 * админки: от режима зависит доступ к самой базе, а адрес и секрет шины не могут лежать в базе,
 * которую обслуживают (Р-40). `bus` (по умолчанию) — через шину и агента; `direct` — приложение
 * пишет в базу само. Без агента в режиме `direct` нет приоритетных потребителей и схемы двух
 * серверов; планировщик работает внутри приложения (Р-45, этап 4).
 */
export function dataMode(): DataMode {
  return process.env.DATA_MODE === 'direct' ? 'direct' : 'bus';
}

let busPort: DataPort | null = null;

/** Подставляет шинную реализацию (вызывается лениво при первом обращении) */
export function setBusDataPort(port: DataPort): void {
  busPort = port;
}

export function getBusDataPort(): DataPort {
  if (!busPort) {
    // Лениво: библиотека шины не нужна коду, который порт не использует (например, агенту)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createBusDataPort } = require('../bus/busPort') as typeof import('../bus/busPort');
    busPort = createBusDataPort();
  }
  return busPort;
}
