import * as amqp from 'amqplib';
import type { Channel, ConsumeMessage } from 'amqplib';
import { newId } from '../data/ids';
import { coreEvents } from '../events/coreEvents';
import type { DataOperation, DataPort } from '../data/port';
import { BUS, fromBuffer, rebuildError, toBuffer } from './protocol';
import type { BusEventMessage, BusRequest, BusResponse } from './protocol';

/**
 * Шинная реализация порта данных (ТЗ 3.1): публикует операцию в очередь и ждёт ответа
 * по correlationId. Приложение всегда обращается к ОДНОМУ локальному адресу шины
 * (BUS_URL) и не знает, какой агент на другом конце (ТЗ 3.7, 5.2).
 *
 * Состояние соединения — в globalThis: Next может загрузить модуль в нескольких
 * бандлах маршрутов, а соединение должно быть одно на процесс.
 */
interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

// Тип соединения не называем напрямую: в разных версиях @types/amqplib он зовётся по-разному
type Connection = Awaited<ReturnType<typeof amqp.connect>>;

interface BusState {
  ready?: Promise<Channel>;
  connection?: Connection;
  pending: Map<string, Pending>;
}

const globalState = globalThis as unknown as { __revolitBus?: BusState };
const state: BusState = (globalState.__revolitBus ??= { pending: new Map() });

function busUrl(): string {
  const url = process.env.BUS_URL;
  if (!url) throw new Error('DATA_MODE=bus требует переменную окружения BUS_URL (адрес шины)');
  return url;
}

function timeoutMs(): number {
  return Number(process.env.BUS_TIMEOUT_MS) || 30_000;
}

function failAllPending(reason: string): void {
  for (const [id, p] of state.pending) {
    clearTimeout(p.timer);
    p.reject(new Error(reason));
    state.pending.delete(id);
  }
}

function resetConnection(reason: string): void {
  state.ready = undefined;
  state.connection = undefined;
  failAllPending(reason);
}

function connect(): Promise<Channel> {
  if (state.ready) return state.ready;

  state.ready = (async () => {
    // Короткий heartbeat — быстрее замечаем обрыв (ТЗ 11b, раздел 8)
    const url = busUrl();
    const connection = await amqp.connect(url, { heartbeat: Number(process.env.BUS_HEARTBEAT) || 5 });
    connection.on('close', () => resetConnection('Соединение с шиной закрыто'));
    connection.on('error', () => resetConnection('Ошибка соединения с шиной'));
    state.connection = connection;

    const channel = await connection.createChannel();
    await channel.assertQueue(BUS.operationsQueue, { durable: true });

    // Ответы: подписка на псевдо-очередь ДО первой публикации с replyTo
    await channel.consume(
      BUS.replyTo,
      (msg: ConsumeMessage | null) => {
        if (!msg) return;
        const id = msg.properties.correlationId as string | undefined;
        const pending = id ? state.pending.get(id) : undefined;
        if (!pending || !id) return;
        state.pending.delete(id);
        clearTimeout(pending.timer);

        const response = fromBuffer<BusResponse>(msg.content);
        if (response.ok) pending.resolve(response.result);
        else pending.reject(rebuildError(response.error));
      },
      { noAck: true }
    );

    // Доменные события, которые публикует агент после подтверждённой записи (ТЗ 6)
    await channel.assertExchange(BUS.eventsExchange, 'fanout', { durable: false });
    const events = await channel.assertQueue('', { exclusive: true, autoDelete: true });
    await channel.bindQueue(events.queue, BUS.eventsExchange, '');
    await channel.consume(
      events.queue,
      (msg: ConsumeMessage | null) => {
        if (!msg) return;
        const { event, payload } = fromBuffer<BusEventMessage>(msg.content);
        void coreEvents.emit(event as never, payload as never);
      },
      { noAck: true }
    );

    return channel;
  })().catch((error) => {
    state.ready = undefined;
    throw error;
  });

  return state.ready;
}

async function request(req: BusRequest): Promise<unknown> {
  const channel = await connect();
  const id = newId();

  return new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => {
      state.pending.delete(id);
      // Сообщение могло уже уйти агенту: create безопасен при повторе (явный id), остальное — нет
      reject(new Error('Шина не ответила вовремя'));
    }, timeoutMs());
    state.pending.set(id, { resolve, reject, timer });

    channel.sendToQueue(BUS.operationsQueue, toBuffer(req), {
      correlationId: id,
      replyTo: BUS.replyTo,
      persistent: true,
      contentType: 'application/json',
    });
  });
}

export function createBusDataPort(): DataPort {
  return {
    execute: (op: DataOperation) => request({ kind: 'op', op }),
    runBatch: (ops: DataOperation[]) => request({ kind: 'batch', ops }) as Promise<unknown[]>,
  };
}
