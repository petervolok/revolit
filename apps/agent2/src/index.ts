/**
 * Агент №2 (docs/11b, раздел 2.2) — существует ТОЛЬКО в этой сборке, для сервера №2.
 * Отличие от обычного агента (apps/agent) ровно одно: после исполнения операции на своей
 * БД №2 решает, дублировать ли её в БД №1 напрямую (не через шину — см. dualWrite.ts,
 * решение владельца в docs/08-decisions.md Р-41). Само подключение к шине, приоритет
 * потребителя, протокол, ack/nack и остановка — как у обычного агента (переиспользуются
 * его же модуль подключения через copy-paste минимальной обвязки ниже, а не общий код,
 * чтобы конкретно в этом файле было видно и проверяемо: логика чувствительности не течёт
 * обратно в apps/agent, которым собирается сервер №1).
 */
import type { PrismaClient } from '@prisma/client';
import * as amqp from 'amqplib';
import type { ConsumeMessage } from 'amqplib';
import { BUS, fromBuffer, toBuffer } from '../../../core/bus/protocol';
import type { BusRequest } from '../../../core/bus/protocol';
import { createLocalDataPort } from '../../../core/data/localPort';
import type { DataOperation } from '../../../core/data/port';
import { handleRequest } from '../../agent/src/handler';
import { createPrimaryClient, db2 } from './client';
import { captureBeforeState, shouldMirrorToPrimary } from './dualWrite';

/**
 * `createLocalDataPort` типизирован по клиенту apps/crm (`@prisma/client`) — единственному,
 * который знает основной код (core/agent). Клиент agent2 (`./client`) собран из другой,
 * но структурно совместимой схемы (свой генератор, ТЗ 4.1) — приводим тип только здесь,
 * на границе, где это доказуемо безопасно (обе схемы включают одни и те же доменные модели).
 */
const asPortClient = (client: unknown): PrismaClient => client as PrismaClient;

const name = process.env.AGENT_NAME ?? 'agent-2';
const log = (message: string) => console.log(`[${name}] ${message}`);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const localPort = createLocalDataPort(asPortClient(db2));
const primaryClient = createPrimaryClient();
const primaryPort = primaryClient ? createLocalDataPort(asPortClient(primaryClient)) : null;

if (!primaryPort) {
  log('DATABASE_URL_PRIMARY не задан — дублирование в БД №1 выключено, работаю только со своей БД');
}

/** Дублирует уже подтверждённую на БД №2 операцию в БД №1. Сбой сюда не должен долетать до ack. */
async function mirror(op: DataOperation): Promise<void> {
  if (!primaryPort) return;
  try {
    await primaryPort.execute(op);
  } catch (error) {
    // Повтор create по явному id (этап 1) сделает это безопасным при следующей попытке —
    // здесь только логируем, не роняем обработку основного сообщения
    log(`дублирование в БД №1 не удалось (${op.model}.${op.operation}): ${(error as Error).message}`);
  }
}

async function main(): Promise<void> {
  const url = process.env.BUS_URL;
  if (!url) throw new Error('Не задан BUS_URL');

  const priority = Number(process.env.AGENT_PRIORITY ?? 10);
  const prefetch = Number(process.env.AGENT_PREFETCH ?? 4);

  const connection = await amqp.connect(url, { heartbeat: Number(process.env.BUS_HEARTBEAT) || 5 });
  connection.on('close', () => {
    log('соединение с шиной закрыто — выхожу');
    process.exit(1);
  });
  connection.on('error', (error: Error) => log(`ошибка соединения: ${error.message}`));

  const channel = await connection.createChannel();
  await channel.assertQueue(BUS.operationsQueue, { durable: true });
  await channel.assertExchange(BUS.eventsExchange, 'fanout', { durable: false });
  await channel.prefetch(prefetch);

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

      // «Снимок» до исполнения — нужен для delete/deleteMany, пока запись ещё жива
      const before = request.kind === 'op' ? await captureBeforeState(db2, request.op) : null;

      const handled = await handleRequest(localPort, request);

      if (handled.retry) {
        log('сбой инфраструктуры, возвращаю сообщение в очередь');
        await sleep(2000);
        channel.nack(msg, false, true);
        return;
      }

      if (handled.response.ok) {
        if (request.kind === 'op') {
          const mirrorIt = await shouldMirrorToPrimary(db2, request.op, handled.response.result, before);
          if (mirrorIt) await mirror(request.op);
        } else {
          // Пакетные операции (перестановка полей/этапов) — структурные данные, зеркалятся всегда
          for (const op of request.ops) await mirror(op);
        }
      }

      if (msg.properties.replyTo) {
        channel.sendToQueue(msg.properties.replyTo, toBuffer(handled.response), {
          correlationId: msg.properties.correlationId,
        });
      }
      for (const e of handled.events) {
        channel.publish(BUS.eventsExchange, '', toBuffer({ event: e.event, payload: e.payload }));
      }
      channel.ack(msg);
    },
    { priority, noAck: false }
  );

  log(`готов: очередь ${BUS.operationsQueue}, приоритет ${priority}, prefetch ${prefetch}, дублирование в БД №1 ${primaryPort ? 'включено' : 'выключено'}`);

  const shutdown = async () => {
    log('остановка');
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
