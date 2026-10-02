/**
 * Смоук-проверка логики агента №2 (docs/08-decisions.md Р-41, Р-45): правила чувствительности и сбор
 * изменений для БД №1. Проверяет apps/agent2/src/sensitivity.ts и changes.ts напрямую против
 * настоящей БД №2 — без шины и без запущенного агента, теми же вызовами, которыми пользуется агент
 * (runWrites внутри настоящей транзакции). Запускается в CI:
 *   DATABASE_URL=postgresql://... npx tsx tools/agent2-smoke.ts
 * ЧЕГО НЕ ПРОВЕРЯЕТ: передачу по шине, ожидание подтверждения и повторную доставку — это сквозная
 * проверка этапа 3 плана Р-45.
 */
import { newId } from '../core/data/ids';
import { decode, encode } from '../core/data/serialize';
import type { DataOperation } from '../core/data/port';
import type { DataChange } from '../core/bus/protocol';
import { db2 } from '../apps/agent2/src/client';
import type { AgentPrismaClient } from '../apps/agent2/src/client';
import { rowIsSensitive, runWrites } from '../apps/agent2/src/changes';

const PROGRAM = 'smoke-agent2';
let failures = 0;
const allLines: string[] = [];

function check(name: string, ok: boolean, detail = ''): void {
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`;
  console.log(line);
  allLines.push(line);
  if (!ok) failures++;
}

const id = (p: string) => `${p}-${Math.random().toString(36).slice(2, 10)}`;

/** Исполняет операции так же, как агент: в транзакции, через runWrites */
async function write(...ops: DataOperation[]): Promise<DataChange[]> {
  return db2.$transaction(async (tx) => (await runWrites(tx as unknown as AgentPrismaClient, ops)).changes);
}

const upserts = (changes: DataChange[]) => changes.filter((c) => c.op === 'upsert');
const deletes = (changes: DataChange[]) => changes.filter((c) => c.op === 'delete');

async function main(): Promise<void> {
  const template = await db2.entityTemplate.create({
    data: { id: id('t'), programId: PROGRAM, key: 'zakaz', name: 'Заказ', namePlural: 'Заказы' },
  });

  await db2.sensitivityRule.create({
    data: { id: id('r'), programId: PROGRAM, templateKey: 'zakaz', name: 'Наличные', conditions: [{ field: 'oplata', op: 'eq', value: 'nalichnye' }] },
  });
  await db2.sensitivityRule.create({
    data: { id: id('r'), programId: PROGRAM, templateKey: 'zakaz', name: 'Выключенное', enabled: false, conditions: [{ field: 'oplata', op: 'eq', value: 'karta' }] },
  });

  const rec = (oplata: string, extra: Record<string, unknown> = {}) => ({
    id: id('e'),
    programId: PROGRAM,
    templateId: template.id,
    data: { oplata, summa: 5000, ...extra },
  });
  const createRec = (data: ReturnType<typeof rec>): DataOperation => ({ model: 'EntityRecord', operation: 'create', args: { data } });

  // — Чувствительность строки —
  const sensitiveRow = { ...rec('nalichnye') };
  check('строка с наличной оплатой чувствительна', await rowIsSensitive(db2, 'EntityRecord', sensitiveRow));
  check('строка с оплатой картой не чувствительна (правило выключено)', !(await rowIsSensitive(db2, 'EntityRecord', rec('karta'))));
  check('строка с переводом не чувствительна', !(await rowIsSensitive(db2, 'EntityRecord', rec('perevod'))));
  check('шаблон сущности (структура) не чувствителен', !(await rowIsSensitive(db2, 'EntityTemplate', { id: template.id })));

  // — Создание —
  const normal = rec('perevod');
  let changes = await write(createRec(normal));
  check('create обычной записи → одно изменение upsert с итоговой строкой', upserts(changes).length === 1 && changes[0].key.id === normal.id && (changes[0].row?.data as { oplata?: string })?.oplata === 'perevod');

  const hidden = rec('nalichnye');
  changes = await write(createRec(hidden));
  const stored = await db2.entityRecord.findUnique({ where: { id: hidden.id } });
  check('create чувствительной записи → в изменениях пусто, в БД №2 запись есть', changes.length === 0 && stored !== null);

  // — Изменение —
  changes = await write({ model: 'EntityRecord', operation: 'update', args: { where: { id: normal.id }, data: { data: { oplata: 'nalichnye' } } } });
  check('update: запись стала чувствительной → в БД №1 не передаётся', changes.length === 0);

  changes = await write({ model: 'EntityRecord', operation: 'update', args: { where: { id: hidden.id }, data: { data: { oplata: 'perevod' } } } });
  check('update: запись перестала быть чувствительной → передаётся итоговое состояние', upserts(changes).length === 1 && (changes[0].row?.data as { oplata?: string })?.oplata === 'perevod');

  // — Удаление —
  changes = await write({ model: 'EntityRecord', operation: 'delete', args: { where: { id: normal.id } } });
  check('delete чувствительной записи → в БД №1 о ней не сообщается', changes.length === 0);

  changes = await write({ model: 'EntityRecord', operation: 'delete', args: { where: { id: hidden.id } } });
  check('delete обычной записи → удаление по ключу', deletes(changes).length === 1 && changes[0].key.id === hidden.id);

  // — Операции над несколькими строками —
  const a = rec('perevod');
  const b = rec('perevod');
  await write(createRec(a), createRec(b));
  changes = await write({
    model: 'EntityRecord',
    operation: 'updateMany',
    args: { where: { id: { in: [a.id, b.id] } }, data: { data: { oplata: 'perevod', pometka: 1 } } },
  });
  check('updateMany: каждая затронутая строка передаётся своим итоговым состоянием', upserts(changes).length === 2);

  const c1 = rec('perevod');
  const c2 = rec('nalichnye');
  changes = await write({ model: 'EntityRecord', operation: 'createMany', args: { data: [c1, c2] } });
  check('createMany: чувствительные строки отсеиваются по одной', upserts(changes).length === 1 && changes[0].key.id === c1.id);

  changes = await write({ model: 'EntityRecord', operation: 'deleteMany', args: { where: { id: { in: [a.id, b.id, c1.id, c2.id] } } } });
  check('deleteMany: удаляются только обычные строки (3 из 4)', deletes(changes).length === 3);

  // — Связанные объекты —
  const linkedHidden = rec('nalichnye');
  const linkedNormal = rec('perevod');
  await write(createRec(linkedHidden), createRec(linkedNormal));
  const task = (entityRecordId: string | null) => ({ model: 'Task', operation: 'create', args: { data: { id: id('k'), programId: PROGRAM, title: 'Задача', entityRecordId } } }) as DataOperation;

  changes = await write(task(linkedHidden.id));
  check('задача по чувствительному заказу не передаётся', changes.length === 0);
  changes = await write(task(linkedNormal.id));
  check('задача по обычному заказу передаётся', upserts(changes).length === 1);
  changes = await write(task(null));
  check('задача без привязки к записи передаётся (нечего скрывать)', upserts(changes).length === 1);

  // — Структура —
  changes = await write({ model: 'EntityTemplate', operation: 'update', args: { where: { id: template.id }, data: { namePlural: 'Заказы 2' } } });
  check('шаблон сущности (структура) передаётся всегда', upserts(changes).length === 1);

  // — Пакет с составным ключом: замена ролей сотрудника —
  const program = await db2.program.create({ data: { id: id('p'), slug: id('smoke'), name: 'P' } });
  const r1 = await db2.role.create({ data: { id: id('ro'), programId: program.id, key: 'r1', name: 'R1' } });
  const r2 = await db2.role.create({ data: { id: id('ro'), programId: program.id, key: 'r2', name: 'R2' } });
  const user = await db2.user.create({ data: { id: id('u'), programId: program.id, email: `${id('m')}@example.test`, name: 'U', passwordHash: 'x' } });
  await db2.userRole.create({ data: { userId: user.id, roleId: r1.id } });

  changes = await write(
    { model: 'UserRole', operation: 'deleteMany', args: { where: { userId: user.id } } },
    { model: 'UserRole', operation: 'createMany', args: { data: [{ userId: user.id, roleId: r2.id }] } }
  );
  check(
    'пакет замены ролей: старая связь удаляется, новая передаётся (составной ключ)',
    deletes(changes).some((c) => c.key.roleId === r1.id) && upserts(changes).some((c) => c.key.roleId === r2.id)
  );

  // — Журнал операций и сериализация —
  const logId = id('log');
  await db2.operationLog.create({ data: { id: logId, response: encode({ ok: true, result: { at: new Date('2026-01-01T10:00:00Z') } }), changes: [], events: [] } });
  const log = await db2.operationLog.findUnique({ where: { id: logId } });
  const restored = decode(log?.response) as { result?: { at?: Date } };
  check('журнал операций: запись сохраняется, Date восстанавливается', restored.result?.at instanceof Date && restored.result.at.getTime() === new Date('2026-01-01T10:00:00Z').getTime());

  // Уборка
  await db2.operationLog.deleteMany({ where: { id: logId } });
  await db2.task.deleteMany({ where: { programId: PROGRAM } });
  await db2.entityRecord.deleteMany({ where: { programId: PROGRAM } });
  await db2.sensitivityRule.deleteMany({ where: { programId: PROGRAM } });
  await db2.entityTemplate.deleteMany({ where: { programId: PROGRAM } });
  await db2.userRole.deleteMany({ where: { userId: user.id } });
  await db2.user.deleteMany({ where: { programId: program.id } });
  await db2.role.deleteMany({ where: { programId: program.id } });
  await db2.program.deleteMany({ where: { id: program.id } });

  console.log(failures === 0 ? '\nВсе проверки агента №2 пройдены' : `\nПРОВАЛЕНО проверок: ${failures}`);
  console.log(`::${failures === 0 ? 'notice' : 'error'} title=agent2-smoke итог::${allLines.join('%0A')}`);
  await db2.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await db2.$disconnect();
  process.exit(1);
});
