/**
 * Смоук-проверка шины и агентов (ТЗ переработки ядра, этап 5; ТЗ 11b, раздел 8).
 * Запускается в CI против настоящих Postgres и RabbitMQ:
 *   DATA_MODE=bus BUS_URL=amqp://... DATABASE_URL=... npx tsx tools/bus-smoke.ts
 * Собранный агент — apps/agent/dist/agent.js. Что проверяется: обмен и восстановление Date,
 * повтор create по id, коды ошибок Prisma, атомарный пакет, доменные события через шину,
 * приоритет потребителя, аварийное падение агента (kill -9), возврат и штатная остановка.
 * ЧЕГО НЕ ПРОВЕРЯЕТ: разрыв сети между серверами (здесь всё на одной машине) и работу
 * между двумя разными серверами.
 */
import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import path from 'path';
import { coreEvents } from '../core/events/coreEvents';
import { newId } from '../core/data/ids';
import { prisma, runBatch, basePrisma } from '../core/data/prisma';

const AGENT = path.resolve(__dirname, '../apps/agent/dist/agent.js');
const PROGRAM = 'smoke';
let failures = 0;
const allLines: string[] = [];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function check(name: string, ok: boolean, detail = ''): void {
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`;
  console.log(line);
  allLines.push(line);
  if (!ok) failures++;
}

interface Agent {
  name: string;
  proc: ChildProcess;
  logs: string[];
}

async function startAgent(name: string, priority: number): Promise<Agent> {
  const logs: string[] = [];
  const proc = spawn('node', [AGENT], {
    env: {
      ...process.env,
      DATA_MODE: 'direct',
      AGENT_NAME: name,
      AGENT_PRIORITY: String(priority),
      AGENT_LOG_OPS: '1',
      BUS_HEARTBEAT: '2',
    },
  });
  proc.stdout.on('data', (d) => logs.push(...String(d).split('\n').filter(Boolean)));
  proc.stderr.on('data', (d) => logs.push(...String(d).split('\n').filter(Boolean)));

  for (let i = 0; i < 100 && !logs.some((l) => l.includes('готов')); i++) await sleep(100);
  if (!logs.some((l) => l.includes('готов'))) throw new Error(`агент ${name} не запустился:\n${logs.join('\n')}`);
  return { name, proc, logs };
}

const opsHandled = (a: Agent) => a.logs.filter((l) => l.includes(' op ')).length;

async function createTemplate(key: string) {
  return prisma.entityTemplate.create({
    data: { id: newId(), programId: PROGRAM, key, name: key, namePlural: key },
  });
}

async function waitEvent(name: string, ms = 4000): Promise<Record<string, unknown> | null> {
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
  const a1 = await startAgent('agent-1', 0);

  // 1. Обмен и восстановление типов
  const t = await createTemplate('t1');
  check('create через шину возвращает запись', t.key === 't1');
  check('Date восстанавливается после передачи по шине', t.createdAt instanceof Date);

  // 2. Идемпотентность повторной доставки
  const replayId = newId();
  const data = { id: replayId, programId: PROGRAM, key: 'replay', name: 'r', namePlural: 'r' };
  await prisma.entityTemplate.create({ data });
  let replayOk = true;
  try {
    await prisma.entityTemplate.create({ data });
  } catch {
    replayOk = false;
  }
  const replayCount = await prisma.entityTemplate.count({ where: { id: replayId } });
  check('повтор create с тем же id не даёт ошибку и дубликат', replayOk && replayCount === 1);

  // 3. Коды ошибок Prisma доходят до приложения
  let code = '';
  try {
    await prisma.entityTemplate.create({ data: { id: newId(), programId: PROGRAM, key: 't1', name: 'x', namePlural: 'x' } });
  } catch (e) {
    code = (e as { code?: string }).code ?? '';
  }
  check('настоящее нарушение уникальности → P2002', code === 'P2002', code);
  code = '';
  try {
    await prisma.entityTemplate.update({ where: { id: 'net-takogo' }, data: { name: 'x' } });
  } catch (e) {
    code = (e as { code?: string }).code ?? '';
  }
  check('обновление несуществующей записи → P2025', code === 'P2025', code);

  // 4. Пакет одним блоком
  const fields = [];
  for (let i = 0; i < 3; i++) {
    fields.push(
      await prisma.entityField.create({
        data: { id: newId(), templateId: t.id, key: `f${i}`, label: `f${i}`, type: 'text', order: i },
      })
    );
  }
  await runBatch(fields.map((f, i) => ({ model: 'EntityField', operation: 'update', args: { where: { id: f.id }, data: { order: 2 - i } } })));
  const reordered = await prisma.entityField.findMany({ where: { templateId: t.id }, orderBy: { key: 'asc' } });
  check('пакет переставил порядок полей', reordered.map((f) => f.order).join() === '2,1,0', reordered.map((f) => f.order).join());

  // 5. Доменные события через шину
  const created = waitEvent('entity.record.created');
  const record = await prisma.entityRecord.create({ data: { id: newId(), programId: PROGRAM, templateId: t.id, data: { a: 1 } } });
  const ev1 = await created;
  check('entity.record.created дошло до приложения', ev1?.recordId === record.id);

  const updated = waitEvent('entity.record.updated');
  await prisma.entityRecord.update({ where: { id: record.id }, data: { data: { a: 2 } } });
  check('entity.record.updated', (await updated)?.recordId === record.id);

  const deleted = waitEvent('entity.record.deleted');
  await prisma.entityRecord.deleteMany({ where: { id: record.id, templateId: t.id, programId: PROGRAM } });
  check('entity.record.deleted (deleteMany)', (await deleted)?.recordId === record.id);

  const taskCreated = waitEvent('task.created');
  const task = await prisma.task.create({ data: { id: newId(), programId: PROGRAM, title: 'smoke' } });
  check('task.created', (await taskCreated)?.taskId === task.id);
  const taskDone = waitEvent('task.completed');
  await prisma.task.update({ where: { id: task.id }, data: { status: 'done', doneAt: new Date() } });
  check('task.completed', (await taskDone)?.taskId === task.id);

  const pt = await prisma.processTemplate.create({ data: { id: newId(), programId: PROGRAM, key: 'p1', name: 'p' } });
  const s1 = await prisma.processStage.create({ data: { id: newId(), templateId: pt.id, name: 's1', order: 0 } });
  const s2 = await prisma.processStage.create({ data: { id: newId(), templateId: pt.id, name: 's2', order: 1 } });
  const inst = await prisma.processInstance.create({
    data: { id: newId(), programId: PROGRAM, templateId: pt.id, title: 'i', currentStageId: s1.id },
  });
  const moved = waitEvent('process.instance.moved');
  await prisma.processInstance.update({ where: { id: inst.id }, data: { currentStageId: s2.id } });
  const ev2 = await moved;
  check('process.instance.moved', ev2?.toStageId === s2.id);

  // 6. Приоритет потребителя: агент с бо́льшим приоритетом получает всё
  const before1 = opsHandled(a1);
  const a2 = await startAgent('agent-2', 5);
  await sleep(500);
  for (let i = 0; i < 5; i++) await createTemplate(`prio${i}`);
  check('при агенте с большим приоритетом все операции идут ему', opsHandled(a2) >= 5 && opsHandled(a1) === before1, `a2=${opsHandled(a2)} a1 новых=${opsHandled(a1) - before1}`);

  // 7. Аварийное падение (kill -9): поток возвращается агенту с меньшим приоритетом
  const t0 = Date.now();
  a2.proc.kill('SIGKILL');
  const beforeFail = opsHandled(a1);
  let lostAfterKill = 0;
  for (let i = 0; i < 5; i++) {
    try {
      await createTemplate(`crash${i}`);
    } catch {
      lostAfterKill++;
    }
  }
  const failoverMs = Date.now() - t0;
  check('после kill -9 операции продолжают выполняться агентом №1', opsHandled(a1) - beforeFail >= 5 && lostAfterKill === 0, `${failoverMs} мс, потеряно ${lostAfterKill}`);
  check('переключение при kill -9 быстрее 15 с', failoverMs < 15_000, `${failoverMs} мс`);

  // 8. Возврат агента №2
  const a2b = await startAgent('agent-2', 5);
  await sleep(500);
  const before1b = opsHandled(a1);
  for (let i = 0; i < 5; i++) await createTemplate(`back${i}`);
  check('после возврата приоритетный агент снова получает поток', opsHandled(a2b) >= 5 && opsHandled(a1) === before1b, `a2=${opsHandled(a2b)}`);

  // 9. Штатная остановка под нагрузкой: ничего не потеряно и не задвоено
  const burst = Array.from({ length: 30 }, (_, i) => ({ id: newId(), key: `burst${i}` }));
  const sends = burst.map((b) =>
    prisma.entityTemplate.create({ data: { id: b.id, programId: PROGRAM, key: b.key, name: b.key, namePlural: b.key } }).then(
      () => true,
      () => false
    )
  );
  a2b.proc.kill('SIGTERM');
  const results = await Promise.all(sends);
  const stored = await basePrisma.entityTemplate.count({ where: { id: { in: burst.map((b) => b.id) } } });
  check('штатная остановка под нагрузкой: 30 из 30 записаны, без потерь и дублей', results.every(Boolean) && stored === 30, `успешно ${results.filter(Boolean).length}, в базе ${stored}`);

  a1.proc.kill('SIGTERM');
  await sleep(300);
  console.log(failures === 0 ? '\nВсе проверки шины пройдены' : `\nПРОВАЛЕНО проверок: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
