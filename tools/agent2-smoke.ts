/**
 * Смоук-проверка логики чувствительности (этап 6, docs/08-decisions.md Р-41). Проверяет
 * apps/agent2/src/sensitivity.ts и dualWrite.ts напрямую против настоящей БД №2 — без
 * шины и без второго агента, чтобы проверка была быстрой и не зависела от их исправности
 * (та зависимость уже покрыта bus-smoke.ts). Запускается в CI:
 *   DATABASE_URL=postgresql://... npx tsx tools/agent2-smoke.ts
 * ЧЕГО НЕ ПРОВЕРЯЕТ: настоящее дублирование по сети в БД №1, работу внутри полного
 * агента №2 (очередь, приоритет, ack) — это должен закрыть отдельный сквозной прогон
 * при появлении второго сервера.
 */
import { db2 } from '../apps/agent2/src/client';
import { evaluateRecordSensitivity, isRecordSensitive } from '../apps/agent2/src/sensitivity';
import { shouldMirrorToPrimary } from '../apps/agent2/src/dualWrite';

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

  check(
    'запись с наличной оплатой подходит под включённое правило',
    await evaluateRecordSensitivity(db2, PROGRAM, 'zakaz', { oplata: 'nalichnye' })
  );
  check(
    'запись с оплатой картой не подходит (правило под неё выключено)',
    !(await evaluateRecordSensitivity(db2, PROGRAM, 'zakaz', { oplata: 'karta' }))
  );
  check('сущность без совпадающих полей — не чувствительна', !(await evaluateRecordSensitivity(db2, PROGRAM, 'zakaz', { oplata: 'perevod' })));

  const sensitiveRecord = await db2.entityRecord.create({
    data: { id: id('e'), programId: PROGRAM, templateId: template.id, data: { oplata: 'nalichnye', summa: 5000 } },
  });
  const normalRecord = await db2.entityRecord.create({
    data: { id: id('e'), programId: PROGRAM, templateId: template.id, data: { oplata: 'perevod', summa: 5000 } },
  });

  check('isRecordSensitive: null entityRecordId — нечего скрывать', !(await isRecordSensitive(db2, PROGRAM, null)));
  check('isRecordSensitive: чувствительная запись', await isRecordSensitive(db2, PROGRAM, sensitiveRecord.id));
  check('isRecordSensitive: обычная запись', !(await isRecordSensitive(db2, PROGRAM, normalRecord.id)));

  // shouldMirrorToPrimary — по операции create над EntityRecord
  const createSensitiveOp = { model: 'EntityRecord', operation: 'create', args: { data: { programId: PROGRAM, templateId: template.id, data: { oplata: 'nalichnye' } } } };
  check('create чувствительной записи — НЕ дублировать в БД №1', !(await shouldMirrorToPrimary(db2, createSensitiveOp, null, null)));
  const createNormalOp = { model: 'EntityRecord', operation: 'create', args: { data: { programId: PROGRAM, templateId: template.id, data: { oplata: 'perevod' } } } };
  check('create обычной записи — дублировать', await shouldMirrorToPrimary(db2, createNormalOp, null, null));

  // update — решение принимается по РЕЗУЛЬТАТУ (обновлённой строке)
  const updatedToSensitive = { id: normalRecord.id, templateId: template.id, programId: PROGRAM, data: { oplata: 'nalichnye' } };
  check(
    'update: запись стала чувствительной по новым данным — не дублировать',
    !(await shouldMirrorToPrimary(db2, { model: 'EntityRecord', operation: 'update', args: {} }, updatedToSensitive, null))
  );
  const updatedToNormal = { id: sensitiveRecord.id, templateId: template.id, programId: PROGRAM, data: { oplata: 'perevod' } };
  check(
    'update: запись перестала быть чувствительной — снова дублировать',
    await shouldMirrorToPrimary(db2, { model: 'EntityRecord', operation: 'update', args: {} }, updatedToNormal, null)
  );

  // delete — решение по снимку ДО удаления (captureBeforeState передаёт template.key)
  const beforeSensitiveDelete = { programId: PROGRAM, template: { key: 'zakaz' }, data: { oplata: 'nalichnye' } };
  check(
    'delete чувствительной записи — не дублировать удаление в БД №1',
    !(await shouldMirrorToPrimary(db2, { model: 'EntityRecord', operation: 'deleteMany', args: {} }, null, beforeSensitiveDelete))
  );

  // Каскад на связанные объекты — через entityRecordId
  const taskOnSensitive = { model: 'Task', operation: 'create', args: { data: { programId: PROGRAM, entityRecordId: sensitiveRecord.id } } };
  check('задача по чувствительному заказу — не дублировать', !(await shouldMirrorToPrimary(db2, taskOnSensitive, null, null)));
  const taskOnNormal = { model: 'Task', operation: 'create', args: { data: { programId: PROGRAM, entityRecordId: normalRecord.id } } };
  check('задача по обычному заказу — дублировать', await shouldMirrorToPrimary(db2, taskOnNormal, null, null));
  const taskUnlinked = { model: 'Task', operation: 'create', args: { data: { programId: PROGRAM, entityRecordId: null } } };
  check('задача без привязки к записи — дублировать (нечего скрывать)', await shouldMirrorToPrimary(db2, taskUnlinked, null, null));

  const taskUpdateOnSensitive = { model: 'Task', operation: 'update', args: {} };
  check(
    'обновление задачи (по before-снимку) на чувствительный заказ — не дублировать',
    !(await shouldMirrorToPrimary(db2, taskUpdateOnSensitive, null, { programId: PROGRAM, entityRecordId: sensitiveRecord.id }))
  );

  // Структурные модели — зеркалятся всегда
  check(
    'шаблон сущности (структура, не бизнес-данные) — дублируется всегда',
    await shouldMirrorToPrimary(db2, { model: 'EntityTemplate', operation: 'update', args: {} }, null, null)
  );

  console.log(failures === 0 ? '\nВсе проверки чувствительности пройдены' : `\nПРОВАЛЕНО проверок: ${failures}`);
  console.log(`::${failures === 0 ? 'notice' : 'error'} title=agent2-smoke итог::${allLines.join('%0A')}`);
  await db2.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await db2.$disconnect();
  process.exit(1);
});
