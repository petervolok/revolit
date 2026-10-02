/**
 * Смоук-проверка режима `direct` (Р-45, этап 4): приложение пишет в базу само, без шины и агента.
 * Запускается в CI БЕЗ RabbitMQ-переменных — если бы код всё же полез в шину, он упал бы:
 *   DATA_MODE=direct DATABASE_URL=... npx tsx tools/direct-smoke.ts
 * Проверяет: обмен без шины, естественное поведение базы (повтор create даёт P2002 — идемпотентности
 * шины здесь нет), доменные события внутри процесса, атомарный пакет, учётные модели, раздел
 * «Шина» в режиме direct, планировщик внутри приложения.
 */
process.env.DATA_MODE = 'direct';
delete process.env.BUS_URL;

import { getBusHealth } from '../core/bus/health';
import { coreEvents } from '../core/events/coreEvents';
import { newId } from '../core/data/ids';
import { dataMode } from '../core/data/port';
import { startDirectRuntime } from '../core/data/directRuntime';
import { basePrisma, prisma, runBatch } from '../core/data/prisma';

const PROGRAM = 'direct-smoke';
let failures = 0;
const allLines: string[] = [];

function check(name: string, ok: boolean, detail = ''): void {
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`;
  console.log(line);
  allLines.push(line);
  if (!ok) failures++;
}

function waitEvent(name: string, ms = 5000): Promise<Record<string, unknown> | null> {
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
  check('режим direct выбран переменной окружения', dataMode() === 'direct');

  const templateId = newId();
  const template = await prisma.entityTemplate.create({
    data: { id: templateId, programId: PROGRAM, key: 'direct-t', name: 'Т', namePlural: 'Т' },
  });
  check('create без шины возвращает запись, Date остаётся Date', template.key === 'direct-t' && template.createdAt instanceof Date);

  let code = '';
  try {
    await prisma.entityTemplate.create({ data: { id: templateId, programId: PROGRAM, key: 'direct-t2', name: 'Т', namePlural: 'Т' } });
  } catch (e) {
    code = (e as { code?: string }).code ?? '';
  }
  check('повтор create с тем же id даёт P2002 (идемпотентность — свойство шины, не прямого режима)', code === 'P2002', code);

  const created = waitEvent('entity.record.created');
  await prisma.entityRecord.create({ data: { id: newId(), programId: PROGRAM, templateId, data: { a: 1 } } });
  check('доменное событие отправляется внутри процесса', (await created) !== null);

  let atomic = false;
  try {
    await runBatch([
      { model: 'EntityTemplate', operation: 'update', args: { where: { id: templateId }, data: { name: 'Изменено' } } },
      { model: 'EntityTemplate', operation: 'create', args: { data: { id: newId(), programId: PROGRAM, key: 'direct-t', name: 'Дубль', namePlural: 'Дубль' } } },
    ]);
  } catch {
    atomic = true;
  }
  const afterBatch = await prisma.entityTemplate.findUnique({ where: { id: templateId } });
  check('пакет атомарен: при ошибке во второй операции первая откатывается', atomic && afterBatch?.name === 'Т');

  const program = await prisma.program.create({ data: { id: newId(), slug: `direct-${newId()}`, name: 'P' } });
  const user = await prisma.user.create({ data: { id: newId(), programId: program.id, email: `${newId()}@example.test`, name: 'U', passwordHash: 'x' } });
  check('учётные модели тоже пишутся напрямую', (await prisma.user.findUnique({ where: { id: user.id } }))?.programId === program.id);

  const health = await getBusHealth();
  check('раздел «Шина» в режиме direct: шины нет, это не отказ', health.mode === 'direct' && health.reachable);

  // Планировщик внутри приложения: задача, у которой пропущен момент расписания, срабатывает на тике
  process.env.SCHEDULER_TICK_MS = '300';
  await basePrisma.scheduledJob.create({
    data: { id: newId(), programId: PROGRAM, key: 'direct-tick', cronExpression: '* * * * *', lastRunAt: new Date(Date.now() - 120_000) },
  });
  const fired = waitEvent('scheduler.job.fired', 8000);
  const stop = startDirectRuntime();
  const payload = await fired;
  check('планировщик работает внутри приложения без агента', payload?.jobKey === 'direct-tick');
  check('повторный запуск среды не создаёт второй планировщик', startDirectRuntime() === stop);
  stop();

  // Уборка
  await basePrisma.scheduledJob.deleteMany({ where: { programId: PROGRAM } });
  await basePrisma.entityRecord.deleteMany({ where: { programId: PROGRAM } });
  await basePrisma.entityTemplate.deleteMany({ where: { programId: PROGRAM } });
  await basePrisma.user.deleteMany({ where: { programId: program.id } });
  await basePrisma.program.deleteMany({ where: { id: program.id } });

  console.log(failures === 0 ? '\nВсе проверки прямого режима пройдены' : `\nПРОВАЛЕНО проверок: ${failures}`);
  console.log(`::${failures === 0 ? 'notice' : 'error'} title=direct-smoke итог::${allLines.join('%0A')}`);
  await basePrisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await basePrisma.$disconnect();
  process.exit(1);
});
