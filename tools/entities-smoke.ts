/**
 * Смоук-проверка модели данных (строка 1 таблицы покрытия): типы полей, правила проверки, значения
 * по умолчанию, уникальность, «только чтение», правка полей при наличии записей. Идёт в режиме direct
 * (без шины), против настоящей базы:
 *   DATA_MODE=direct DATABASE_URL=... npx tsx tools/entities-smoke.ts
 */
process.env.DATA_MODE = 'direct';
delete process.env.BUS_URL;

import { basePrisma } from '../core/data/prisma';
import {
  EntityError,
  addField,
  createRecord,
  createTemplate,
  getTemplate,
  listRecords,
  removeField,
  renameTemplate,
  reorderFields,
  updateField,
  updateRecord,
} from '../core/entities/service';
import type { FieldInput } from '../core/entities/service';
import { displayValue, recordLabel } from '../core/entities/types';
import type { EntityTemplateDef } from '../core/entities/types';

const P = 'ents-smoke';
let failures = 0;
const allLines: string[] = [];

function check(name: string, ok: boolean, detail = ''): void {
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`;
  console.log(line);
  allLines.push(line);
  if (!ok) failures++;
}

/** Текст ошибки EntityError или null, если операция прошла; чужая ошибка — тоже сбой проверки */
async function failsWith(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof EntityError ? e.message : `НЕ EntityError: ${(e as Error).message}`;
  }
}

async function main(): Promise<void> {
  let t: EntityTemplateDef = await createTemplate(P, { name: 'Контакт', namePlural: 'Контакты' });
  const KEY = t.key;
  const add = async (label: string, type: FieldInput['type'], extra: Partial<FieldInput> = {}) => {
    t = await addField(P, KEY, { label, type, required: false, ...extra });
  };
  const field = (label: string) => t.fields.find((f) => f.label === label)!;

  await add('Name', 'text', { required: true, validation: { minLength: 2, maxLength: 20 } });
  await add('Email', 'email', { unique: true });
  await add('Phone', 'phone');
  await add('Site', 'url');
  await add('Age', 'number', { validation: { integer: true, min: 0, max: 150 } });
  await add('Vip', 'boolean', { hasDefault: true, defaultValue: false });
  await add('Born', 'date', { validation: { min: '1900-01-01', max: '2100-01-01' } });
  await add('Visit', 'datetime');
  await add('Notes', 'longtext');
  await add('Meta', 'json');
  await add('Code', 'text', { validation: { pattern: '^[A-Z]{2}-[0-9]{3}$', message: 'Код вида AB-123' } });
  await add('Status', 'select', { options: { choices: ['a', 'b', 'c'] }, hasDefault: true, defaultValue: 'a' });
  await add('Tags', 'multiselect', { options: { choices: ['t1', 't2'] } });
  await add('Author', 'text', { readonly: true });
  check('созданы поля всех новых типов', t.fields.length === 14 && field('Vip').hasDefault && field('Vip').defaultValue === false);

  const base = {
    name: 'Иван', email: 'Ivan@Example.COM', phone: '+7 (900) 123-45-67', site: 'https://example.com', age: '30',
    born: '1990-05-17', visit: '2026-01-01T10:00:00Z', notes: 'a\r\nb', meta: '{"x":[1,2]}', code: 'AB-123', tags: ['t1'], author: 'Иван',
  };
  const r1 = await createRecord(P, KEY, base);
  const d = r1.data;
  check('запись создана: почта в нижнем регистре, число — числом, значения по умолчанию подставлены', d.email === 'ivan@example.com' && d.age === 30 && d.vip === false && d.status === 'a');
  check('json из строки разобран, длинный текст приведён к \\n', JSON.stringify(d.meta) === '{"x":[1,2]}' && d.notes === 'a\nb');
  check('дата и дата-время хранятся в ISO', typeof d.born === 'string' && String(d.born).endsWith('Z') && d.visit === '2026-01-01T10:00:00.000Z');

  // — Отказы по правилам —
  const bad = async (patch: Record<string, unknown>) => failsWith(() => createRecord(P, KEY, { ...base, email: `x${Math.random().toString(36).slice(2, 8)}@example.com`, ...patch }));
  check('слишком короткое имя отклонено', (await bad({ name: 'И' }))?.includes('не короче') === true);
  check('обязательное поле без значения отклонено', (await bad({ name: '' }))?.includes('Заполните') === true);
  check('некорректная почта отклонена', (await bad({ email: 'не-почта' }))?.includes('почты') === true);
  check('повтор уникальной почты (в другом регистре) отклонён', (await failsWith(() => createRecord(P, KEY, { ...base, email: 'IVAN@example.com' })))?.includes('уже используется') === true);
  check('некорректный телефон отклонён', (await bad({ phone: 'abc' }))?.includes('телефоном') === true);
  check('ссылка не http/https отклонена', (await bad({ site: 'ftp://example.com' }))?.includes('http') === true);
  check('дробное число там, где нужно целое, отклонено', (await bad({ age: '3.5' }))?.includes('целым') === true);
  check('число выше верхней границы отклонено', (await bad({ age: 200 }))?.includes('не больше') === true);
  check('значение не «да/нет» в булевом поле отклонено', (await bad({ vip: 'возможно' }))?.includes('«да» или «нет»') === true);
  check('не дата в поле даты и времени отклонена', (await bad({ visit: 'не дата' }))?.includes('датой') === true);
  check('битый JSON отклонён', (await bad({ meta: '{bad' }))?.includes('JSON') === true);
  check('нарушение формата даёт своё сообщение', (await bad({ code: 'x' })) === 'Код вида AB-123');
  check('значение вне списка отклонено', (await bad({ status: 'z' }))?.includes('Недопустимое') === true);
  check('дата ниже нижней границы отклонена', (await bad({ born: '1800-01-01' }))?.includes('не меньше') === true);

  // — Допустимые варианты —
  const r2 = await createRecord(P, KEY, { name: 'Пётр', email: 'second@example.com', vip: 'да', meta: { a: 1 }, phone: '+7 (900) 123-45-67' });
  check('«да» принимается как true, объект принимается как JSON', r2.data.vip === true && JSON.stringify(r2.data.meta) === '{"a":1}');

  // — Уникальность при правке и «только чтение» —
  const keepOwn = await failsWith(() => updateRecord(P, KEY, r1.id, { ...r1.data }));
  check('правка записи с её же уникальной почтой проходит', keepOwn === null);
  const steal = await failsWith(() => updateRecord(P, KEY, r1.id, { ...r1.data, email: 'second@example.com' }));
  check('правка на чужую уникальную почту отклонена', steal?.includes('уже используется') === true);
  await updateRecord(P, KEY, r1.id, { ...r1.data, author: 'Пётр', name: 'Иван Иванов' });
  const after = (await listRecords(P, KEY)).find((r) => r.id === r1.id)!;
  check('поле «только чтение» при правке не меняется, остальные меняются', after.data.author === 'Иван' && after.data.name === 'Иван Иванов');

  // — Описание поля сущности —
  const noField = await failsWith(() => renameTemplate(P, KEY, { name: 'Контакт', namePlural: 'Контакты', displayField: 'net' }));
  check('несуществующее поле-заголовок отклонено', noField?.includes('не найдено') === true);
  t = await renameTemplate(P, KEY, { name: 'Контакт', namePlural: 'Контакты', description: 'Люди', icon: 'Users', displayField: 'email' });
  check('настройки сущности сохраняются', t.description === 'Люди' && t.icon === 'Users' && t.displayField === 'email');
  check('запись показывается по выбранному полю', recordLabel({ id: 'x', data: { email: 'a@b.co', name: 'Н' }, createdAt: '', updatedAt: '' }, t.fields, t.displayField) === 'a@b.co');
  check('значение «да/нет» и JSON показываются читаемо', displayValue({ type: 'boolean' }, true) === 'да' && displayValue({ type: 'json' }, { a: 1 }) === '{"a":1}');

  // — Правки самого поля —
  const e1 = await failsWith(() => addField(P, KEY, { label: 'Flag', type: 'boolean', required: false, unique: true }));
  check('уникальность булева поля отклонена', e1?.includes('Уникальность') === true);
  check('некорректное регулярное выражение отклонено', (await failsWith(() => addField(P, KEY, { label: 'Bad', type: 'text', required: false, validation: { pattern: '(' } })))?.includes('регулярное') === true);
  check('нижняя граница больше верхней отклонена', (await failsWith(() => addField(P, KEY, { label: 'Bad2', type: 'number', required: false, validation: { min: 5, max: 1 } })))?.includes('Нижняя') === true);
  check('значение по умолчанию не по правилам поля отклонено', (await failsWith(() => addField(P, KEY, { label: 'Bad3', type: 'number', required: false, hasDefault: true, defaultValue: 'abc' })))?.includes('числом') === true);

  // — Добавление поля при наличии записей —
  const hasRecords = (await getTemplate(P, KEY))!.hasRecords;
  await add('Optional', 'text');
  check('необязательное поле добавляется в сущность с записями', hasRecords && field('Optional') !== undefined);
  const mustErr = await failsWith(() => addField(P, KEY, { label: 'Must', type: 'text', required: true }));
  check('обязательное поле без значения по умолчанию отклонено, пока есть записи', mustErr?.includes('по умолчанию') === true);
  await add('Level', 'number', { required: true, hasDefault: true, defaultValue: 5 });
  const withLevel = await listRecords(P, KEY);
  check('обязательное поле со значением по умолчанию проставлено во всех существующих записях', withLevel.length === 2 && withLevel.every((r) => r.data.level === 5));

  // — Изменение поля при наличии записей —
  check('тип нельзя менять с числа на текст, пока есть записи', (await failsWith(() => updateField(P, KEY, field('Age').id, { label: 'Age', type: 'text', required: false })))?.includes('Тип поля нельзя') === true);
  t = await updateField(P, KEY, field('Site').id, { label: 'Web', type: 'text', required: false });
  check('тип меняется между текстовыми, название меняется, ключ остаётся', field('Web').key === 'site' && field('Web').type === 'text');

  const choicesIn = (n: string[]) => ({ label: 'Status', type: 'select' as const, required: false, options: { choices: n }, hasDefault: true, defaultValue: 'a' });
  check('удаление используемого значения списка отклонено', (await failsWith(() => updateField(P, KEY, field('Status').id, choicesIn(['b', 'c']))))?.includes('используются') === true);
  t = await updateField(P, KEY, field('Status').id, choicesIn(['a', 'b', 'd']));
  check('неиспользуемое значение списка убирается, новое добавляется', (field('Status').options as { choices: string[] }).choices.join() === 'a,b,d');

  check('уникальность при повторах в записях включить нельзя', (await failsWith(() => updateField(P, KEY, field('Phone').id, { label: 'Phone', type: 'phone', required: false, unique: true })))?.includes('повторяющиеся') === true);
  await updateRecord(P, KEY, r2.id, { ...(await listRecords(P, KEY)).find((r) => r.id === r2.id)!.data, phone: '+7 (900) 555-55-55' });
  t = await updateField(P, KEY, field('Phone').id, { label: 'Phone', type: 'phone', required: false, unique: true });
  check('после устранения повторов уникальность включается', field('Phone').unique);

  check('«обязательное» при пустых значениях без значения по умолчанию отклонено', (await failsWith(() => updateField(P, KEY, field('Notes').id, { label: 'Notes', type: 'longtext', required: true })))?.includes('пусто') === true);
  t = await updateField(P, KEY, field('Notes').id, { label: 'Notes', type: 'longtext', required: true, hasDefault: true, defaultValue: 'нет' });
  const withNotes = await listRecords(P, KEY);
  check('«обязательное» со значением по умолчанию заполняет пустые', withNotes.every((r) => typeof r.data.notes === 'string' && r.data.notes !== ''));

  // — Порядок и удаление при наличии записей —
  const reversed = [...t.fields].reverse().map((f) => f.id);
  t = await reorderFields(P, KEY, reversed);
  check('порядок полей меняется и при наличии записей', t.fields[0].id === reversed[0]);

  t = await renameTemplate(P, KEY, { name: 'Контакт', namePlural: 'Контакты', displayField: 'code' });
  t = await removeField(P, KEY, field('Meta').id);
  const stripped = await listRecords(P, KEY);
  check('удаление поля стирает его значения во всех записях', stripped.every((r) => !('meta' in r.data)) && stripped.every((r) => 'email' in r.data));
  t = await removeField(P, KEY, field('Code').id);
  check('удаление поля-заголовка сбрасывает заголовок', t.displayField === null);

  // Уборка
  await basePrisma.entityRecord.deleteMany({ where: { programId: P } });
  await basePrisma.entityTemplate.deleteMany({ where: { programId: P } });

  console.log(failures === 0 ? '\nВсе проверки модели данных пройдены' : `\nПРОВАЛЕНО проверок: ${failures}`);
  console.log(`::${failures === 0 ? 'notice' : 'error'} title=entities-smoke итог::${allLines.join('%0A')}`);
  await basePrisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await basePrisma.$disconnect();
  process.exit(1);
});
