import type { PrismaClient } from '@prisma/client';
import { latestOccurrence, parseCron } from './cron';

/**
 * Раннер расписания (ТЗ переработки ядра, 7). Раз в тик читает включённые ScheduledJob и,
 * если у задачи наступил момент расписания, о котором ещё не сообщали, публикует событие
 * `scheduler.job.fired` — на него подписываются плагины и бот. Раннер запускает агент №1:
 * `ScheduledJob` — учётная модель и живёт только в БД №1 (ТЗ 3.3).
 *
 * Гарантии (честно):
 * - Пропущенные срабатывания НЕ догоняются: если раннер не работал сутки, задача «каждый час»
 *   сработает один раз при возвращении, а не двадцать четыре.
 * - Новая задача не срабатывает задним числом: точка отсчёта — `lastRunAt`, а при его отсутствии `createdAt`.
 * - «Не больше одного раза»: срабатывание сначала занимается атомарной записью `lastRunAt`, потом публикуется.
 *   Если процесс упадёт между этими шагами, это срабатывание потеряется. Если публикация вернёт ошибку,
 *   отметка откатывается и срабатывание повторится на следующем тике.
 */
export interface FiredJob {
  programId: string;
  jobKey: string;
  /** Момент расписания, а не время фактической публикации (ISO) */
  scheduledFor: string;
}

type SchedulerClient = Pick<PrismaClient, 'scheduledJob'>;

export async function runSchedulerTick(
  client: SchedulerClient,
  emit: (fired: FiredJob) => void | Promise<void>,
  now: Date = new Date(),
  offsetMinutes = 0,
  onInvalid: (jobKey: string, expression: string) => void = () => undefined
): Promise<number> {
  const jobs = await client.scheduledJob.findMany({ where: { enabled: true } });
  let fired = 0;

  for (const job of jobs) {
    const spec = parseCron(job.cronExpression);
    if (!spec) {
      onInvalid(job.key, job.cronExpression);
      continue;
    }

    const occurrence = latestOccurrence(spec, now, offsetMinutes);
    if (!occurrence) continue;

    const since = job.lastRunAt ?? job.createdAt;
    if (occurrence.getTime() <= since.getTime()) continue;

    // Атомарная «заявка» на срабатывание: если раннеров окажется два, выиграет один
    const claimed = await client.scheduledJob.updateMany({
      where: { id: job.id, lastRunAt: job.lastRunAt },
      data: { lastRunAt: occurrence },
    });
    if (claimed.count === 0) continue;

    try {
      await emit({ programId: job.programId, jobKey: job.key, scheduledFor: occurrence.toISOString() });
      fired++;
    } catch (error) {
      await client.scheduledJob.updateMany({
        where: { id: job.id, lastRunAt: occurrence },
        data: { lastRunAt: job.lastRunAt },
      });
      throw error;
    }
  }

  return fired;
}

/** Запускает раннер по таймеру. Тики не накладываются друг на друга. Возвращает функцию остановки. */
export function startScheduler(options: {
  client: SchedulerClient;
  emit: (fired: FiredJob) => void | Promise<void>;
  tickMs?: number;
  offsetMinutes?: number;
  log?: (message: string) => void;
}): () => void {
  const { client, emit, tickMs = 30_000, offsetMinutes = 0, log = () => undefined } = options;
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runSchedulerTick(client, emit, new Date(), offsetMinutes, (key, expr) =>
        log(`задача «${key}»: некорректное расписание «${expr}» — пропущена`)
      );
    } catch (error) {
      log(`сбой тика планировщика: ${(error as Error).message}`);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(tick, tickMs);
  void tick();
  return () => clearInterval(timer);
}
