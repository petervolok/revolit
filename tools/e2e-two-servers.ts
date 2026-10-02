/**
 * Сквозная проверка схемы двух серверов (Р-41, Р-45): настоящие агент №1 (БД №1) и агент №2 (БД №2)
 * на одной шине. Запускается в CI после создания второй базы:
 *   BUS_URL=amqp://... DATABASE_URL=<БД №1> DATABASE_URL_2=<БД №2> npx tsx tools/e2e-two-servers.ts
 * Приложение здесь — этот скрипт: он пишет через общий `prisma` (шина). Проверяется инвариант:
 * ответ приложению приходит после применения результата в БД №1; чувствительное остаётся только
 * в БД №2; повторная команда не исполняется дважды; без применителя на сервере 1 команда не
 * подтверждается и доходит до БД №1 после его возврата.
 * ЧЕГО НЕ ПРОВЕРЯЕТ: настоящую сеть между серверами (всё на одной машине) и догон БД №2 после
 * простоя агента №2 — записи, сделанные в это время агентом №1, в БД №2 не попадают.
 */
import * as amqp from 'amqplib';
import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import path from 'path';
import { PrismaClient as Prisma2 } from '../apps/agent2/prisma/generated';
import { coreEvents } from '../core/events/coreEvents';
import { newId } from '../core/data/ids';
import { basePrisma, prisma } from '../core/data/prisma';
import { fromBuffer, toBuffer } from '../core/bus/protocol';
import type { BusResponse } from '../core/bus/protocol';

const ROOT = path.resolve(__dirname, '..');
const AGENT1 = path.resolve(ROOT, 'apps/agent/dist/agent.js');
const AGENT2 = path.resolve(ROOT, 'apps/agent2/src/index.ts');
const DB1 = process.env.DATABASE_URL as string;
const DB2 = process.env.DATABASE_URL_2 as string;
const PROGRAM = 'e2e';

let failures = 0;
const allLines: string[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function check(name: string, ok: boolean, detail = ''): void {
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`;
  console.log(line);
  allLines.push(line);
  if (!ok) failures++;
}

async function eventually(fn: () => Promise<boolean>, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(300);
  }
  return false;
}

interface Agent {
  proc: ChildProcess;
  logs: string[];
}

async function start(file: string, env: Record<string, string>, viaTsx = false): Promise<Agent> {
  const logs: string[] = [];
  const args = viaTsx ? ['--import', 'tsx', file] : [file];
  const proc = spawn(process.execPath, args, { cwd: ROOT, env: { ...process.env, AGENT_LOG_OPS: '1', BUS_HEARTBEAT: '2', ...env } });
  proc.stdout.on('data', (d) => logs.push(...String(d).split('\n').filter(Boolean)));
  proc.stderr.on('data', (d) => logs.push(...String(d).split('\n').filter(Boolean)));
  for (let i = 0; i < 300 && !logs.some((l) => l.includes('готов')); i++) await sleep(100);
  if (!logs.some((l) => l.includes('готов'))) throw new Error(`агент не запустился (${file}):\n${logs.join('\n')}`);
  return { proc, logs };
}

const startAgent1 = () => start(AGENT1, { DATABASE_URL: DB1, AGENT_NAME: 'agent-1', AGENT_PRIORITY: '0' });
const startAgent2 = () =>
  start(AGENT2, { DATABASE_URL: DB2, AGENT_NAME: 'agent-2', AGENT_PRIORITY: '10', AGENT_COMPLETION_TIMEOUT_MS: '3000' }, true);

async function kill(agent: Agent): Promise<void> {
  const exited = new Promise<void>((resolve) => agent.proc.once('exit', () => resolve()));
  agent.proc.kill('SIGKILL');
  await exited;
}

function waitEvent(name: string, ms = 8000): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const off = coreEvents.on(name as never, ((payload: Record<string, unknown>) => {
      off();
      resolve(payload);
    }) as never);
    setTimeout(() => {
      off();
      resolve(null);
    }, ms);
  });
}

async function main(): Promise<void> {
  const db2 = new Prisma2({ datasources: { db: { url: DB2 } } });

  // Агент №2 стартует первым: пока он подключён, команды идут ему, агент №1 только применяет результаты
  const a2 = await startAgent2();
  let a1 = await startAgent1();

  // Правило чувствительности — только в БД №2
  await db2.sensitivityRule.create({
    data: { id: newId(), programId: PROGRAM, templateKey: 'e2e-t', name: 'Наличные', conditions: [{ field: 'oplata', op: 'eq', value: 'nalichnye' }] },
  });

  // 1. Структура: запись проходит через агента №2 и попадает в обе базы ДО ответа приложению
  const templateId = newId();
  await prisma.entityTemplate.create({ data: { id: templateId, programId: PROGRAM, key: 'e2e-t', name: 'Заказ', namePlural: 'Заказы' } });
  const inDb1 = await basePrisma.entityTemplate.findUnique({ where: { id: templateId } });
  const inDb2 = await db2.entityTemplate.findUnique({ where: { id: templateId } });
  check('ответ приложению пришёл после применения в БД №1: запись уже в обеих базах', inDb1 !== null && inDb2 !== null);
  check('команду исполнил агент №2 (приоритетный потребитель)', a2.logs.some((l) => l.includes('EntityTemplate.create')) && !a1.logs.some((l) => l.includes('EntityTemplate.create')));

  // 2. Обычная и чувствительная записи
  const normalId = newId();
  const hiddenId = newId();
  const created = waitEvent('entity.record.created');
  await prisma.entityRecord.create({ data: { id: normalId, programId: PROGRAM, templateId, data: { oplata: 'perevod' } } });
  const event = await created;
  await prisma.entityRecord.create({ data: { id: hiddenId, programId: PROGRAM, templateId, data: { oplata: 'nalichnye' } } });

  check('обычная запись есть в обеих базах', (await basePrisma.entityRecord.findUnique({ where: { id: normalId } })) !== null && (await db2.entityRecord.findUnique({ where: { id: normalId } })) !== null);
  check(
    'чувствительная запись есть только в БД №2',
    (await db2.entityRecord.findUnique({ where: { id: hiddenId } })) !== null && (await basePrisma.entityRecord.findUnique({ where: { id: hiddenId } })) === null
  );
  check('доменное событие дошло до приложения через EVENTS', event !== null);

  // 3. Чтение обслуживает агент №2: приложение видит и чувствительную запись, БД №1 её не содержит
  const seen = await prisma.entityRecord.findMany({ where: { programId: PROGRAM } });
  const inDb1Only = await basePrisma.entityRecord.count({ where: { programId: PROGRAM } });
  check('приложение читает полные данные через агента №2', seen.length === 2 && inDb1Only === 1, `через шину ${seen.length}, в БД №1 ${inDb1Only}`);

  // 4. Изменение и удаление доходят до БД №1 до ответа
  await prisma.entityRecord.update({ where: { id: normalId }, data: { data: { oplata: 'perevod', summa: 10 } } });
  const updated = (await basePrisma.entityRecord.findUnique({ where: { id: normalId } }))?.data as { summa?: number } | undefined;
  check('изменение обычной записи применено в БД №1 до ответа', updated?.summa === 10);

  await prisma.entityRecord.update({ where: { id: normalId }, data: { data: { oplata: 'nalichnye' } } });
  const stale = (await basePrisma.entityRecord.findUnique({ where: { id: normalId } }))?.data as { oplata?: string } | undefined;
  check('запись стала чувствительной: в БД №1 остаётся прежнее состояние (решение Р-41)', stale?.oplata === 'perevod');

  await prisma.entityRecord.delete({ where: { id: hiddenId } });
  check('чувствительная запись удалена в БД №2, в БД №1 её не было и нет', (await db2.entityRecord.findUnique({ where: { id: hiddenId } })) === null && (await basePrisma.entityRecord.findUnique({ where: { id: hiddenId } })) === null);

  const goneId = newId();
  await prisma.entityRecord.create({ data: { id: goneId, programId: PROGRAM, templateId, data: { oplata: 'perevod' } } });
  await prisma.entityRecord.delete({ where: { id: goneId } });
  check(
    'удаление обычной записи применено в обеих базах до ответа',
    (await db2.entityRecord.findUnique({ where: { id: goneId } })) === null && (await basePrisma.entityRecord.findUnique({ where: { id: goneId } })) === null
  );

  // 5. Повторная доставка той же команды не исполняется второй раз
  const conn = await amqp.connect(process.env.BUS_URL as string);
  const ch = await conn.createChannel();
  const replyQ = await ch.assertQueue('', { exclusive: true, autoDelete: true });
  const replies: BusResponse[] = [];
  await ch.consume(replyQ.queue, (msg) => msg && replies.push(fromBuffer<BusResponse>(msg.content)), { noAck: true });

  const dupId = newId();
  const corr = newId();
  const dupRequest = { kind: 'op', op: { model: 'EntityTemplate', operation: 'create', args: { data: { id: dupId, programId: PROGRAM, key: `dup-${dupId}`, name: 'Д', namePlural: 'Д' } } } };
  const sendDup = () => ch.sendToQueue('revolit.data.operations', toBuffer(dupRequest), { correlationId: corr, replyTo: replyQ.queue, persistent: true });
  sendDup();
  await eventually(async () => replies.length >= 1, 15_000);
  sendDup(); // та же команда с тем же correlationId — как при повторной доставке после сбоя
  await eventually(async () => replies.length >= 2, 15_000);
  const logCount = await db2.operationLog.count({ where: { id: corr } });
  check(
    'повторная команда не исполнена второй раз: оба ответа ok, запись одна, в журнале одна строка',
    replies.length === 2 && replies.every((r) => r.ok) && (await db2.entityTemplate.count({ where: { id: dupId } })) === 1 && logCount === 1
  );

  // 6. Применителя нет: команда не подтверждается, приложение не получает ответ; после возврата — доходит
  await kill(a1);
  process.env.BUS_TIMEOUT_MS = '6000';
  const lateId = newId();
  let timedOut = false;
  try {
    await prisma.entityTemplate.create({ data: { id: lateId, programId: PROGRAM, key: `late-${lateId}`, name: 'П', namePlural: 'П' } });
  } catch {
    timedOut = true;
  }
  delete process.env.BUS_TIMEOUT_MS;
  check('без применителя на сервере 1 приложение не получает ответ (подтверждения нет)', timedOut);
  check(
    'при этом запись уже в БД №2, а в БД №1 её ещё нет',
    (await db2.entityTemplate.findUnique({ where: { id: lateId } })) !== null && (await basePrisma.entityTemplate.findUnique({ where: { id: lateId } })) === null
  );

  a1 = await startAgent1();
  const arrived = await eventually(async () => (await basePrisma.entityTemplate.findUnique({ where: { id: lateId } })) !== null, 45_000);
  check('после возврата применителя неподтверждённая команда доходит до БД №1', arrived);
  check('и в БД №2 она по-прежнему одна (не исполнена повторно)', (await db2.entityTemplate.count({ where: { id: lateId } })) === 1);

  // Даём агенту №2 дойти до ack последней команды, чтобы не оставлять её неподтверждённой
  await sleep(7000);
  await conn.close().catch(() => undefined);
  await db2.$disconnect();
  await kill(a1);
  await kill(a2);

  console.log(failures === 0 ? '\nВсе сквозные проверки пройдены' : `\nПРОВАЛЕНО проверок: ${failures}`);
  console.log(`::${failures === 0 ? 'notice' : 'error'} title=e2e-two-servers итог::${allLines.join('%0A')}`);
  await basePrisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await basePrisma.$disconnect();
  process.exit(1);
});
