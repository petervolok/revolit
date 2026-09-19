/**
 * Порт данных (ТЗ переработки ядра, 3.1). Операция над доменной моделью описывается
 * как { model, operation, args } — по образцу MailPort/StoragePort. Реализаций две:
 * локальная (прямой Prisma, режим `direct`) и шинная (RabbitMQ, режим `bus`, этап 5).
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

/**
 * Доменные модели, которые ходят через порт (ТЗ 3.3). Учётные (User, Role, Session,
 * Program, ProgramSettings, ModuleToggle, AiKey*, AuditLog …) всегда идут напрямую
 * в локальную БД №1 и через шину не проходят.
 */
export const PROXIED_MODELS: ReadonlySet<string> = new Set([
  'EntityTemplate',
  'EntityField',
  'EntityRecord',
  'EntityTemplatePreset',
  'ProcessTemplate',
  'ProcessStage',
  'ProcessInstance',
  'ProcessHistoryEntry',
  'Task',
  'Attachment',
]);

export function isProxied(model: string | undefined): boolean {
  return model !== undefined && PROXIED_MODELS.has(model);
}

export type DataMode = 'direct' | 'bus';

/**
 * Режим задаётся переменной окружения процесса, а не значением в БД: адрес и секрет
 * шины не могут лежать в базе, которую они же обслуживают (ТЗ 3.1, 8).
 */
export function dataMode(): DataMode {
  return process.env.DATA_MODE === 'bus' ? 'bus' : 'direct';
}

let busPort: DataPort | null = null;

/** Подставляет шинную реализацию (этап 5 вызывает это при старте в режиме `bus`) */
export function setBusDataPort(port: DataPort): void {
  busPort = port;
}

export function getBusDataPort(): DataPort {
  if (!busPort) {
    throw new Error('DATA_MODE=bus, но шинный порт данных не подключён (реализуется на этапе 5 — apps/agent)');
  }
  return busPort;
}
