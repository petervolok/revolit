/**
 * Смоук-проверка протокола трёх потоков шины (Р-45): MAIN, EVENTS, COMPLETIONS. Запускается в CI
 * против настоящих Postgres и RabbitMQ после bus-smoke:
 *   BUS_URL=amqp://... DATABASE_URL=... npx tsx tools/protocol-smoke.ts
 * Собранный агент — apps/agent/dist/agent.js. Внешний издатель шлёт результаты операций в EVENTS
 * по ключу `changes` ровно так, как это будет делать любой участник шины, и ждёт подтверждение
 * в COMPLETIONS. Проверяется: применение, повтор (идемпотентность), защита от устаревшего снимка,
 * удаление, составной ключ, Json-null, ошибка применения, подтверждение за обычную запись в MAIN.
 * ЧЕГО НЕ ПРОВЕРЯЕТ: работу двух баз на разных серверах и обрыв сети — всё на одной машине.
 */
import * as amqp from 'amqplib';
import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import path from 'path';
import { BUS, CHANGES_KEY, fromBuffer, toBuffer } from '../core/bus/protocol';
import type { BusCompletion, DataChange } from '../core/bus/protocol';
import { newId } from '../core/data/ids';
import { basePrisma, prisma } from '../core/data/prisma';

const AGENT = path.resolve(__dirname, '../apps/agent/dist/agent.js');
let failures = 0;
const allLines: string[] = [];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function check(name: string, ok: boolean, detail = ''): void {
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`;
  console.log(line);
  allLines.push(line);
  if (!ok) failures++;
}

async function startAgent(): Promise<{ proc: ChildProcess; logs: string[] }> {
  const logs: string[] = [];
  const proc = spawn('node', [AGENT], {
    env: { ...process.env, AGENT_NAME: 'agent-proto', AGENT_PRIORITY: '0', AGENT_LOG_OPS: '1', BUS_HEARTBEAT: '2' },
  });
  proc.stdout.on('data', (d) => logs.push(...String(d).split('\n').filter(Boolean)));
  proc.stderr.on('data', (d) => logs.push(...String(d).split('\n').filter(Boolean)));
  for (let i = 0; i < 100 && !logs.some((l) => l.includes('готов')); i++) await sleep(100);
  if (!logs.some((l) => l.includes('готов'))) throw new Error(`агент не запустился:\n${logs.join('\n')}`);
  return { proc, logs };
}

const T0 = new Date('2026-01-01T10:00:00Z');
const T1 = new Date('2026-01-01T11:00:00Z');
const T_OLD = new Date('2025-12-31T10:00:00Z');

async function main(): Promise<void> {
  const agent = await startAgent();

  const connection = await amqp.connect(process.env.BUS_URL as string);
  const ch = await connection.createChannel();
  await ch.assertExchange(BUS.eventsExchange, 'topic', { durable: true });
  await ch.assertExchange(BUS.completionsExchange, 'fanout', { durable: true });
  const q = await ch.assertQueue('', { exclusive: true, autoDelete: true });
  await ch.bindQueue(q.queue, BUS.completionsExchange, '');

  const completions = new Map<string, BusCompletion>();
  let completionsTotal = 0;
  await ch.consume(
    q.queue,
    (msg) => {
      if (!msg) return;
      const c = fromBuffer<BusCompletion>(msg.content);
      completions.set(c.operationId, c);
      completionsTotal++;
    },
    { noAck: true }
  );

  /** Публикует результат операции в EVENTS и ждёт подтверждение в COMPLETIONS */
  async function send(changes: DataChange[]): Promise<BusCompletion | null> {
    const operationId = newId();
    ch.publish(BUS.eventsExchange, CHANGES_KEY, toBuffer({ operationId, changes }), { persistent: true });
    for (let i = 0; i < 100; i++) {
      const c = completions.get(operationId);
      if (c) return c;
      await sleep(100);
    }
    return null;
  }

  const tplId = newId();
  const tpl = (name: string, updatedAt: Date): DataChange => ({
    model: 'EntityTemplate',
    op: 'upsert',
    key: { id: tplId },
    row: { id: tplId, programId: 'proto', key: `proto-${tplId}`, name, namePlural: name, createdAt: T0, updatedAt },
  });

  // 1. Применение результата операции
  let c = await send([tpl('Первое', T0)]);
  let row = await basePrisma.entityTemplate.findUnique({ where: { id: tplId } });
  check('результат операции применён к базе, подтверждение пришло', c?.ok === true && row?.name === 'Первое');
  check('updatedAt берётся из снимка, а не пересчитывается', row?.updatedAt.getTime() === T0.getTime());

  // 2. Повтор того же сообщения
  c = await send([tpl('Первое', T0)]);
  const count = await basePrisma.entityTemplate.count({ where: { id: tplId } });
  check('повтор того же результата не создаёт дубль и не падает', c?.ok === true && count === 1);

  // 3. Устаревший снимок не затирает новое состояние
  c = await send([tpl('Старое', T_OLD)]);
  row = await basePrisma.entityTemplate.findUnique({ where: { id: tplId } });
  check('устаревший снимок пропущен, подтверждение всё равно пришло', c?.ok === true && row?.name === 'Первое');

  // 4. Более новый снимок применяется
  c = await send([tpl('Новое', T1)]);
  row = await basePrisma.entityTemplate.findUnique({ where: { id: tplId } });
  check('более новый снимок применён', c?.ok === true && row?.name === 'Новое');

  // 5. Удаление и его повтор
  const del: DataChange = { model: 'EntityTemplate', op: 'delete', key: { id: tplId } };
  c = await send([del]);
  const gone = (await basePrisma.entityTemplate.count({ where: { id: tplId } })) === 0;
  const c2 = await send([del]);
  check('удаление применено, повторное удаление безопасно', c?.ok === true && gone && c2?.ok === true);

  // 6. Цепочка с внешними ключами, составной ключ, Json-null — одной операцией
  const p = newId();
  const r = newId();
  const u = newId();
  const auditId = newId();
  const chain: DataChange[] = [
    { model: 'Program', op: 'upsert', key: { id: p }, row: { id: p, slug: `proto-${p}`, name: 'P', createdAt: T0, updatedAt: T0 } },
    {
      model: 'Role',
      op: 'upsert',
      key: { id: r },
      row: { id: r, programId: p, key: 'r', name: 'R', description: null, permissions: ['a', 'b'], isSystem: false, createdAt: T0, updatedAt: T0 },
    },
    {
      model: 'User',
      op: 'upsert',
      key: { id: u },
      row: { id: u, programId: p, email: `${u}@example.test`, name: 'U', passwordHash: 'x', isActive: true, createdAt: T0, updatedAt: T0 },
    },
    { model: 'UserRole', op: 'upsert', key: { userId: u, roleId: r }, row: { userId: u, roleId: r } },
    {
      model: 'AuditLog',
      op: 'upsert',
      key: { id: auditId },
      row: { id: auditId, programId: p, action: 'auth.login.success', details: null, createdAt: T0 },
    },
  ];
  c = await send(chain);
  const roleRow = await basePrisma.role.findUnique({ where: { id: r } });
  const link = await basePrisma.userRole.count({ where: { userId: u, roleId: r } });
  const audit = await basePrisma.auditLog.findUnique({ where: { id: auditId } });
  check('цепочка с внешними ключами применена одной операцией', c?.ok === true && roleRow?.permissions.length === 2);
  check('составной ключ (UserRole) применяется', link === 1);
  check('null в Json-столбце применяется', audit !== null && audit.details === null);

  c = await send([{ model: 'UserRole', op: 'delete', key: { userId: u, roleId: r } }]);
  check('удаление по составному ключу', c?.ok === true && (await basePrisma.userRole.count({ where: { userId: u, roleId: r } })) === 0);

  // 7. Ошибка применения не зацикливает очередь и доходит до отправителя
  c = await send([{ model: 'UserRole', op: 'upsert', key: { userId: 'net-takogo', roleId: r }, row: { userId: 'net-takogo', roleId: r } }]);
  check('ошибка применения → подтверждение ok=false, очередь не зациклена', c?.ok === false && typeof c.error === 'string');

  // 8. Применение после ошибки продолжает работать (очередь не застряла)
  c = await send([tpl('После ошибки', T1)]);
  check('после ошибки очередь продолжает работать', c?.ok === true);

  // 9. Обычная запись через MAIN тоже приводит к подтверждению в COMPLETIONS
  const before = completionsTotal;
  await prisma.entityTemplate.create({ data: { id: newId(), programId: 'proto', key: `main-${newId()}`, name: 'm', namePlural: 'm' } });
  for (let i = 0; i < 30 && completionsTotal === before; i++) await sleep(100);
  check('запись через MAIN публикует подтверждение в COMPLETIONS', completionsTotal > before);

  // Уборка: удаляем цепочку и шаблоны за собой
  await send([
    { model: 'AuditLog', op: 'delete', key: { id: auditId } },
    { model: 'User', op: 'delete', key: { id: u } },
    { model: 'Role', op: 'delete', key: { id: r } },
    { model: 'Program', op: 'delete', key: { id: p } },
    { model: 'EntityTemplate', op: 'delete', key: { id: tplId } },
  ]);

  await connection.close().catch(() => undefined);
  agent.proc.kill('SIGTERM');

  console.log(failures === 0 ? '\nВсе проверки протокола пройдены' : `\nПРОВАЛЕНО проверок: ${failures}`);
  console.log(`::${failures === 0 ? 'notice' : 'error'} title=protocol-smoke итог::${allLines.join('%0A')}`);
  await basePrisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await basePrisma.$disconnect();
  process.exit(1);
});
