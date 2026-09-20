/**
 * Смоук-проверка планировщика (ТЗ переработки ядра, этап 7). Запускается в CI после bus-smoke:
 *   DATA_MODE=bus BUS_URL=amqp://... DATABASE_URL=... npx tsx tools/scheduler-smoke.ts
 * Часть A — чистые проверки разбора и вычисления cron. Часть B — живой прогон: агент с включённым
 * раннером, настоящие Postgres и RabbitMQ, событие приходит в приложение по шине.
 * ЧЕГО НЕ ПРОВЕРЯЕТ: работу планировщика при переключении агентов между серверами и часовые пояса
 * дальше проверки сдвига в cron-функциях.
 */
import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import path from 'path';
import { coreEvents } from '../core/events/coreEvents';
import { basePrisma, prisma } from '../core/data/prisma';
import { latestOccurrence, parseCron } from '../core/scheduler/cron';
import { ensureJob, SchedulerError, upsertJob } from '../core/scheduler/service';

const AGENT = path.resolve(__dirname, '../apps/agent/dist/agent.js');
const PROGRAM = 'smoke-sched';
let failures = 0;
const allLines: string[] = [];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function check(name: string, ok: boolean, detail = ''): void {
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`;
  console.log(line);
  allLines.push(line);
  if (!ok) failures++;
}

const at = (iso: string) => new Date(iso);
function occurrence(expr: string, now: string, offset = 0): string | null {
  const spec = parseCron(expr);
  const result = spec ? latestOccurrence(spec, at(now), offset) : null;
  return result ? result.toISOString() : null;
}

function partA(): void {
  check('некорректные выражения отвергаются', ['* * * *', '60 * * * *', '* 24 * * *', 'a b c d e', '*/0 * * * *', ''].every((e) => parseCron(e) === null));
  check('корректное выражение с диапазоном, списком и шагом разбирается', parseCron('*/15 0-6 1,15 * 1-5') !== null);
  check('«0 6 * * *» → последнее срабатывание в 06:00 того же дня', occurrence('0 6 * * *', '2026-09-20T10:30:00Z') === '2026-09-20T06:00:00.000Z');
  check('сдвиг +180 мин: 06:00 по Москве = 03:00 UTC', occurrence('0 6 * * *', '2026-09-20T10:30:00Z', 180) === '2026-09-20T03:00:00.000Z');
  check('«*/15 * * * *» в 12:07 → 12:00', occurrence('*/15 * * * *', '2026-09-20T12:07:30Z') === '2026-09-20T12:00:00.000Z');
  check('день недели: «0 9 * * 1» в воскресенье → прошлый понедельник', occurrence('0 9 * * 1', '2026-09-20T12:00:00Z') === '2026-09-14T09:00:00.000Z');
  check('7 — тоже воскресенье', occurrence('0 9 * * 7', '2026-09-20T12:00:00Z') === '2026-09-20T09:00:00.000Z');
  check('день месяца и день недели вместе — по «или»', occurrence('0 0 13 * 5', '2026-09-16T12:00:00Z') === '2026-09-13T00:00:00.000Z');
  check('29 февраля: за горизонт в год срабатывания нет → null', occurrence('0 0 29 2 *', '2026-09-20T12:00:00Z') === null);
}

interface Agent {
  proc: ChildProcess;
  logs: string[];
}

async function startAgent(): Promise<Agent> {
  const logs: string[] = [];
  const proc = spawn('node', [AGENT], {
    env: {
      ...process.env,
      DATA_MODE: 'direct',
      AGENT_NAME: 'agent-sched',
      AGENT_PRIORITY: '0',
      SCHEDULER_ENABLED: '1',
      SCHEDULER_TICK_MS: '500',
    },
  });
  proc.stdout.on('data', (d) => logs.push(...String(d).split('\n').filter(Boolean)));
  proc.stderr.on('data', (d) => logs.push(...String(d).split('\n').filter(Boolean)));
  for (let i = 0; i < 100 && !logs.some((l) => l.includes('планировщик включён')); i++) await sleep(100);
  if (!logs.some((l) => l.includes('планировщик включён'))) throw new Error(`агент не запустился:\n${logs.join('\n')}`);
  return { proc, logs };
}

interface Fired {
  jobKey: string;
  scheduledFor: string;
}

async function partB(): Promise<void> {
  const agent = await startAgent();

  // Открываем соединение приложения с шиной (вместе с мостом событий) обычной операцией
  await prisma.entityTemplate.count({ where: { programId: PROGRAM } });

  const fired: Fired[] = [];
  coreEvents.on('scheduler.job.fired', (p) => {
    if (p.programId === PROGRAM) fired.push({ jobKey: p.jobKey, scheduledFor: p.scheduledFor });
  });
  const firedFor = (key: string) => fired.filter((f) => f.jobKey === key);
  const waitFor = async (key: string, ms = 4000) => {
    for (let i = 0; i < ms / 100 && firedFor(key).length === 0; i++) await sleep(100);
    return firedFor(key)[0];
  };

  const now = Date.now();
  const longAgo = new Date(now - 5 * 60_000);
  await basePrisma.scheduledJob.create({
    data: { id: 'sj-every-minute', programId: PROGRAM, key: 'every-minute', cronExpression: '* * * * *', lastRunAt: longAgo },
  });
  await basePrisma.scheduledJob.create({
    data: { id: 'sj-disabled', programId: PROGRAM, key: 'disabled', cronExpression: '* * * * *', lastRunAt: longAgo, enabled: false },
  });
  await basePrisma.scheduledJob.create({
    data: { id: 'sj-bogus', programId: PROGRAM, key: 'bogus', cronExpression: 'это не cron', lastRunAt: longAgo },
  });
  await basePrisma.scheduledJob.create({
    data: { id: 'sj-new-yearly', programId: PROGRAM, key: 'new-yearly', cronExpression: '0 0 1 1 *' },
  });

  const first = await waitFor('every-minute');
  check('событие scheduler.job.fired доходит до приложения по шине', Boolean(first));
  check('scheduledFor — недавний момент расписания (не старше минуты)', Boolean(first) && now - new Date(first.scheduledFor).getTime() < 90_000, first?.scheduledFor);

  await sleep(1500);
  const perMoment = new Map<string, number>();
  for (const f of firedFor('every-minute')) perMoment.set(f.scheduledFor, (perMoment.get(f.scheduledFor) ?? 0) + 1);
  check('на один момент расписания — одно срабатывание', [...perMoment.values()].every((n) => n === 1), JSON.stringify([...perMoment.values()]));

  const saved = await basePrisma.scheduledJob.findUnique({ where: { id: 'sj-every-minute' } });
  check('lastRunAt обновлён до момента расписания', Boolean(saved?.lastRunAt) && saved!.lastRunAt!.getTime() > longAgo.getTime());

  check('выключенная задача не срабатывает', firedFor('disabled').length === 0);
  check('новая годовая задача не срабатывает задним числом', firedFor('new-yearly').length === 0);
  check('некорректное расписание не роняет агента и попадает в журнал', agent.proc.exitCode === null && agent.logs.some((l) => l.includes('некорректное расписание')));

  // Сервис управления задачами (ScheduledJob — не проксируемая модель: в режиме bus идёт напрямую в БД)
  let rejected = false;
  try {
    await upsertJob(PROGRAM, { key: 'svc', cronExpression: 'bad' });
  } catch (e) {
    rejected = e instanceof SchedulerError;
  }
  check('сервис отвергает некорректное расписание', rejected);
  await upsertJob(PROGRAM, { key: 'svc2', cronExpression: '0 5 * * *' });
  await ensureJob(PROGRAM, 'svc2', '0 6 * * *');
  const svc2 = await basePrisma.scheduledJob.findFirst({ where: { programId: PROGRAM, key: 'svc2' } });
  check('ensureJob не перезаписывает уже настроенное расписание', svc2?.cronExpression === '0 5 * * *', svc2?.cronExpression);

  // Задача, добавленная уже при работающем раннере, срабатывает
  await upsertJob(PROGRAM, { key: 'late-added', cronExpression: '* * * * *' });
  await basePrisma.scheduledJob.updateMany({ where: { programId: PROGRAM, key: 'late-added' }, data: { lastRunAt: longAgo } });
  check('задача, добавленная при работающем раннере, срабатывает', Boolean(await waitFor('late-added')));

  agent.proc.kill('SIGTERM');
}

async function main(): Promise<void> {
  partA();
  await partB();
  await sleep(300);
  console.log(failures === 0 ? '\nВсе проверки планировщика пройдены' : `\nПРОВАЛЕНО проверок: ${failures}`);
  console.log(`::${failures === 0 ? 'notice' : 'error'} title=scheduler-smoke итог::${allLines.join('%0A')}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
