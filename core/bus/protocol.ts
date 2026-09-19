import { decode, encode } from '../data/serialize';
import type { DataOperation } from '../data/port';

/**
 * Протокол обмена между приложением и агентом по шине (RabbitMQ) — ТЗ переработки ядра, 3.
 * Приложение публикует запрос в очередь операций и ждёт ответа в «прямой очереди ответов»
 * (Direct Reply-to) с тем же correlationId. Агент подтверждает (ack) сообщение только
 * после выполнения; при обрыве агента посреди обработки сообщение вернётся в очередь.
 * Агент публикует доменные события в fanout-обменник, приложение перевыпускает их в coreEvents.
 */
export const BUS = {
  /** Долговечная очередь операций; из неё читают агенты, приоритет — у потребителя (x-priority) */
  operationsQueue: 'revolit.data.operations',
  /** Обменник доменных событий (fanout) */
  eventsExchange: 'revolit.data.events',
  /** Псевдо-очередь RabbitMQ для ответов без объявления собственной очереди */
  replyTo: 'amq.rabbitmq.reply-to',
} as const;

export type BusRequest = { kind: 'op'; op: DataOperation } | { kind: 'batch'; ops: DataOperation[] };

export interface BusErrorInfo {
  name: string;
  message: string;
  /** Код ошибки Prisma (P2002, P2025 …) — сервисы и обработчики могут на него полагаться */
  code?: string;
}

export type BusResponse = { ok: true; result: unknown } | { ok: false; error: BusErrorInfo };

export interface BusEventMessage {
  event: string;
  payload: Record<string, unknown>;
}

export function toBuffer(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(encode(value)), 'utf8');
}

export function fromBuffer<T>(buffer: Buffer): T {
  return decode(JSON.parse(buffer.toString('utf8'))) as T;
}

export function describeError(error: unknown): BusErrorInfo {
  const e = error as { name?: string; message?: string; code?: string };
  return { name: e?.name ?? 'Error', message: e?.message ?? String(error), code: e?.code };
}

/** Восстанавливает ошибку на стороне приложения, сохраняя код Prisma */
export function rebuildError(info: BusErrorInfo): Error {
  const error = new Error(info.message);
  error.name = info.name;
  if (info.code) (error as Error & { code?: string }).code = info.code;
  return error;
}
