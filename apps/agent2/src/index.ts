/**
 * Агент №2 (docs/11b, раздел 2.2) — существует ТОЛЬКО в этой сборке, для сервера №2.
 * Работает по протоколу трёх потоков шины (docs/08-decisions.md Р-45):
 *   1. забирает команду из MAIN и исполняет её на своей БД №2 в транзакции, вместе с записью
 *      в журнал операций (повторная доставка не исполняет операцию снова);
 *   2. публикует результат (состояние строк, без чувствительных) в EVENTS по ключу `changes`;
 *   3. ждёт подтверждение в COMPLETIONS — изменения применены в БД №1;
 *   4. только после этого отвечает вызвавшему приложению и подтверждает (ack) команду в MAIN.
 * Инвариант: команда исчезла из MAIN → её результат уже в БД №1. Упал до подтверждения — команда
 * осталась в MAIN и придёт снова; журнал не даёт исполнить её второй раз.
 *
 * Подключение к шине, приоритет, остановка — минимальная обвязка, скопированная намеренно, а не
 * общий код с apps/agent: логика чувствительности не должна течь в сборку сервера №1.
 */
import * as amqp from 'amqplib';
import type { Channel, ConsumeMessage } from 'amqplib';
import { BUS, CHANGES_KEY, EVENT_KEY, describeError, fromBuffer, toBuffer } from '../../../core/bus/protocol';
import type { BusCompletion, BusRequest, BusResponse, DataChange } from '../../../core/bus/protocol';
import { newId } from '../../../core/data/ids';
import { deriveDomainEvents, WRITE_OPERATIONS } from '../../../core/data/domainEvents';
import type { DerivedEvent } from '../../../core/data/domainEvents';
import { createLocalDataPort } from '../../../core/data/localPort';
import { decode, encode } from '../../../core/data/serialize';
import type { PrismaClient } from '@prisma/client';
import { handleRequest, isInfrastructureError } from '../../agent/src/handler';
import type { AgentPrismaClient } from './client';
import { db2 } from './client';
import { runWrites } from './changes';

const name = process.env.AGENT_NAME ?? 'agent-2';
const log = (message: string) => console.log(`[${name}] ${message}`);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Порт для чтения: клиент agent2 собран из другой, но структурно совместимой схемы — приводим тип на границе */
const readPort = createLocalDataPort(db2 as unknown as PrismaClient);

interface Outcome {
  response: BusResponse;
  changes: DataChange[];
  events: DerivedEvent[];
}

/** Журнал операций: Json-значения, а не Prisma-клиент сервера №1, поэтому доступ через узкий интерфейс */
interface LogDelegate {
  findUnique(args: unknown): Promise<{ response: unknown; changes: unknown; events: unknown } | null>;
  create(args: unknown): Promise<unknown>;
  deleteMany(args: unknown): Promise<unknown>;
}
const logOf = (client: unknown) => (client as { operationLog: LogDelegate }).operationLog;

async function loadOutcome(operationId: string): Promise<Outcome | null> {
  const row = await logOf(db2).findUnique({ where: { id: operationId } });
  if (!row) return null;
  return {
    response: decode(row.response) as BusResponse,
    changes: decode(row.changes) as DataChange[],
    events: decode(row.events) as DerivedEvent[],
  };
}

/** Не больше N записей одновременно: остальные ждут здесь, а не падают на нехватке соединений с базой */
const writeSlots = Number(process.env.AGENT_WRITE_CONCURRENCY) || 4;
let activeWrites = 0;
const writeQueue: (() => void)[] = [];

async function withWriteSlot<T>(task: () => Promise<T>): Promise<T> {
  if (activeWrites >= writeSlots) await new Promise<void>((resolve) => writeQueue.push(resolve));
  activeWrites++;
  try {
    return await task();
  } finally {
    activeWrites--;
    writeQueue.shift()?.();
  }
}

/** Исполняет запись и сохраняет журнал одной транзакцией */
function executeWrite(request: BusRequest, operationId: string): Promise<Outcome> {
  return withWriteSlot(() => executeWriteNow(request, operationId));
}

async function executeWriteNow(request: BusRequest, operationId: string): Promise<Outcome> {
  const ops = request.kind === 'batch' ? request.ops : [request.op];

  return db2.$transaction(
    async (tx) => {
      const client = tx as unknown as AgentPrismaClient;
      const { results, changes } = await runWrites(client, ops);

      const events = ops.flatMap((op, i) =>
        WRITE_OPERATIONS.has(op.operation) ? deriveDomainEvents(op.model, op.operation, op.args, results[i]) : []
      );
      const response: BusResponse = { ok: true, result: request.kind === 'batch' ? results : results[0] };

      await logOf(client).create({
        data: { id: operationId, response: encode(response), changes: encode(changes), events: encode(events) },
      });
      return { response, changes, events };
    },
    { timeout: 20_000, maxWait: 15_000 }
  );
}

async function main(): Promise<void> {
  const url = process.env.BUS_URL;
  if (!url) throw new Error('Не задан BUS_URL');

  const priority = Number(process.env.AGENT_PRIORITY ?? 10);
  // Команда держится неподтверждённой, пока сервер 1 не применил результат. Когда у приоритетного
  // потребителя исчерпан prefetch, брокер отдаёт излишек потребителю с меньшим приоритетом — и такие
  // записи ушли бы мимо БД №2. Поэтому предел большой, а число одновременных транзакций ограничено отдельно.
  const prefetch = Number(process.env.AGENT_PREFETCH ?? 1000);
  const completionTimeout = Number(process.env.AGENT_COMPLETION_TIMEOUT_MS) || 20_000;

  const connection = await amqp.connect(url, { heartbeat: Number(process.env.BUS_HEARTBEAT) || 5 });
  connection.on('close', () => {
    log('соединение с шиной закрыто — выхожу');
    process.exit(1);
  });
  connection.on('error', (error: Error) => log(`ошибка соединения: ${error.message}`));

  const channel: Channel = await connection.createChannel();
  await channel.assertQueue(BUS.operationsQueue, { durable: true });
  await channel.assertExchange(BUS.eventsExchange, 'topic', { durable: true });
  await channel.assertExchange(BUS.completionsExchange, 'fanout', { durable: true });
  await channel.prefetch(prefetch);

  // COMPLETIONS: своя очередь на время жизни процесса; ожидающие операции ищут своё подтверждение по operationId
  const waiters = new Map<string, (completion: BusCompletion) => void>();
  const completions = await channel.assertQueue('', { exclusive: true, autoDelete: true });
  await channel.bindQueue(completions.queue, BUS.completionsExchange, '');
  await channel.consume(
    completions.queue,
    (msg: ConsumeMessage | null) => {
      if (!msg) return;
      const completion = fromBuffer<BusCompletion>(msg.content);
      waiters.get(completion.operationId)?.(completion);
    },
    { noAck: true }
  );

  /** Публикует изменения в EVENTS и ждёт подтверждение. Ожидание заводится ДО публикации — иначе подтверждение могло бы прийти раньше */
  const publishAndWait = (operationId: string, changes: DataChange[]): Promise<BusCompletion | null> => {
    const wait = new Promise<BusCompletion | null>((resolve) => {
      const timer = setTimeout(() => {
        waiters.delete(operationId);
        resolve(null);
      }, completionTimeout);
      waiters.set(operationId, (completion) => {
        clearTimeout(timer);
        waiters.delete(operationId);
        resolve(completion);
      });
    });
    channel.publish(BUS.eventsExchange, CHANGES_KEY, toBuffer({ operationId, changes }), {
      persistent: true,
      contentType: 'application/json',
    });
    return wait;
  };

  await channel.consume(
    BUS.operationsQueue,
    async (msg: ConsumeMessage | null) => {
      if (!msg) return;
      let request: BusRequest;
      try {
        request = fromBuffer<BusRequest>(msg.content);
      } catch {
        channel.reject(msg, false);
        return;
      }

      if (process.env.AGENT_LOG_OPS === '1') {
        log(request.kind === 'batch' ? `op batch(${request.ops.length})` : `op ${request.op.model}.${request.op.operation}`);
      }

      const reply = (response: BusResponse) => {
        if (msg.properties.replyTo) {
          channel.sendToQueue(msg.properties.replyTo, toBuffer(response), { correlationId: msg.properties.correlationId });
        }
      };

      const ops = request.kind === 'batch' ? request.ops : [request.op];
      const isWrite = request.kind === 'batch' || ops.some((op) => WRITE_OPERATIONS.has(op.operation));

      // Чтение: журнал и подтверждения не нужны, результат никуда не передаётся
      if (!isWrite) {
        const handled = await handleRequest(readPort, request);
        if (handled.retry) {
          log('сбой инфраструктуры, возвращаю сообщение в очередь');
          await sleep(2000);
          channel.nack(msg, false, true);
          return;
        }
        reply(handled.response);
        channel.ack(msg);
        return;
      }

      // Запись. operationId — correlationId команды; он же ключ журнала и ключ подтверждения
      const operationId = (msg.properties.correlationId as string | undefined) ?? newId();

      let outcome: Outcome | null = null;
      try {
        outcome = await loadOutcome(operationId); // повторная доставка: операция уже выполнена
        if (!outcome) outcome = await executeWrite(request, operationId);
      } catch (error) {
        if (isInfrastructureError(error)) {
          log('сбой инфраструктуры, возвращаю сообщение в очередь');
          await sleep(2000);
          channel.nack(msg, false, true);
          return;
        }
        // Ошибка самой операции (нарушение ограничения и т.п.): транзакция откатилась, ничего не записано
        outcome = { response: { ok: false, error: describeError(error) }, changes: [], events: [] };
      }

      if (outcome.changes.length > 0) {
        const completion = await publishAndWait(operationId, outcome.changes);
        if (!completion?.ok) {
          // Не подтверждено: команду не снимаем — вернётся в MAIN и пройдёт тот же путь (журнал не даст исполнить дважды)
          log(`применение не подтверждено (${completion ? completion.error : 'нет ответа'}), возвращаю команду в очередь`);
          await sleep(5000);
          channel.nack(msg, false, true);
          return;
        }
      }

      reply(outcome.response);
      for (const e of outcome.events) {
        channel.publish(BUS.eventsExchange, EVENT_KEY, toBuffer({ event: e.event, payload: e.payload }));
      }
      channel.ack(msg);
    },
    { priority, noAck: false }
  );

  log(`готов: очередь ${BUS.operationsQueue}, приоритет ${priority}, prefetch ${prefetch}, ожидание подтверждения ${completionTimeout} мс`);

  // Журнал нужен, пока команда может прийти повторно; неделя с большим запасом
  const keepDays = Number(process.env.AGENT_LOG_KEEP_DAYS) || 7;
  const cleanup = setInterval(() => {
    logOf(db2)
      .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - keepDays * 86_400_000) } } })
      .catch((error: Error) => log(`очистка журнала не удалась: ${error.message}`));
  }, 3_600_000);

  const shutdown = async () => {
    log('остановка');
    clearInterval(cleanup);
    connection.removeAllListeners('close');
    await channel.close().catch(() => undefined);
    await connection.close().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((error) => {
  console.error(`[${name}] не запустился:`, error);
  process.exit(1);
});
