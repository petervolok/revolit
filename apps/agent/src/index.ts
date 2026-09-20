/**
 * Агент данных (ТЗ переработки ядра, 3.5): потребитель шины, который выполняет операции над
 * доменными моделями настоящим Prisma-клиентом СВОЕЙ базы и отвечает приложению. Один и тот же
 * образ служит и агентом №1, и агентом №2 — различие только в переменных окружения:
 *   BUS_URL         адрес шины (у агента №1 — локальный, у агента №2 — публичный адрес сервера №1)
 *   DATABASE_URL    своя база
 *   AGENT_PRIORITY  приоритет потребителя (x-priority): 0 у агента №1, выше у агента №2
 * Пока подключён потребитель с бо́льшим приоритетом, все сообщения идут ему; при его обрыве
 * RabbitMQ сам возвращает поток остальным (ТЗ 3.7). В коде нет ничего про «второй сервер».
 */
import * as amqp from 'amqplib';
import type { ConsumeMessage } from 'amqplib';
import { BUS, fromBuffer, toBuffer } from '../../../core/bus/protocol';
import type { BusRequest } from '../../../core/bus/protocol';
import { basePrisma, localDataPort } from '../../../core/data/prisma';
import { startScheduler } from '../../../core/scheduler/runner';
import { dataMode } from '../../../core/data/port';
import { handleRequest } from './handler';

const name = process.env.AGENT_NAME ?? 'agent';
const log = (message: string) => console.log(`[${name}] ${message}`);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  if (dataMode() === 'bus') {
    // Агент, читающий шину через шину, зациклил бы сам себя
    throw new Error('Агент должен работать в DATA_MODE=direct — он и есть конец шины');
  }
  const url = process.env.BUS_URL;
  if (!url) throw new Error('Не задан BUS_URL');

  const priority = Number(process.env.AGENT_PRIORITY ?? 0);
  const prefetch = Number(process.env.AGENT_PREFETCH ?? 4);

  const connection = await amqp.connect(url, { heartbeat: Number(process.env.BUS_HEARTBEAT) || 5 });
  // Обрыв — выходим: перезапуск контейнера восстановит подключение (restart: unless-stopped)
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
      if (!msg) return; // потребитель снят брокером
      let request: BusRequest;
      try {
        request = fromBuffer<BusRequest>(msg.content);
      } catch {
        channel.reject(msg, false); // нечитаемое сообщение не должно крутиться в очереди вечно
        return;
      }

      // Диагностика для стендовых проверок: кто именно обработал операцию (ТЗ 11b, раздел 8)
      if (process.env.AGENT_LOG_OPS === '1') {
        log(request.kind === 'batch' ? `op batch(${request.ops.length})` : `op ${request.op.model}.${request.op.operation}`);
      }

      const handled = await handleRequest(localDataPort, request);

      if (handled.retry) {
        // База недоступна: ack не даём, сообщение вернётся в очередь (ТЗ 3.5); пауза — чтобы не крутиться вхолостую
        log('сбой инфраструктуры, возвращаю сообщение в очередь');
        await sleep(2000);
        channel.nack(msg, false, true);
        return;
      }

      if (msg.properties.replyTo) {
        channel.sendToQueue(msg.properties.replyTo, toBuffer(handled.response), {
          correlationId: msg.properties.correlationId,
        });
      }
      for (const e of handled.events) {
        channel.publish(BUS.eventsExchange, '', toBuffer({ event: e.event, payload: e.payload }));
      }
      // ack — только после записи и ответа (ТЗ 3.5)
      channel.ack(msg);
    },
    { priority, noAck: false }
  );

  log(`готов: очередь ${BUS.operationsQueue}, приоритет ${priority}, prefetch ${prefetch}`);

  // Планировщик (ТЗ 7) запускается ТОЛЬКО на одном агенте — том, у которого в БД лежит ScheduledJob
  // (агент №1: это учётная модель, в БД №2 её нет). Два раннера дали бы двойные срабатывания.
  let stopScheduler: () => void = () => undefined;
  if (process.env.SCHEDULER_ENABLED === '1') {
    stopScheduler = startScheduler({
      client: basePrisma,
      tickMs: Number(process.env.SCHEDULER_TICK_MS) || 30_000,
      // Часовой пояс расписания: сдвиг от UTC в минутах (Москва — 180)
      offsetMinutes: Number(process.env.SCHEDULER_UTC_OFFSET_MINUTES) || 0,
      log,
      emit: (fired) => {
        channel.publish(BUS.eventsExchange, '', toBuffer({ event: 'scheduler.job.fired', payload: fired }));
      },
    });
    log('планировщик включён');
  }

  // Штатная остановка: закрываем канал и соединение, чтобы брокер сразу передал поток другому потребителю
  const shutdown = async () => {
    log('остановка');
    stopScheduler();
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
