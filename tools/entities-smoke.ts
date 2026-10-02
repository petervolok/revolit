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
  deleteRecord,
  deleteTemplate,
  listRecords,
  listReverse,
  queryRecords,
  removeField,
  renameTemplate,
  reorderFields,
  updateField,
  updateRecord,
} from '../core/entities/service';
import type { FieldInput } from '../core/entities/service';
import { parseRecordQuery, wantsPage } from '../core/entities/query';
import type { FilterOp, RecordQuery } from '../core/entities/query';
import { displayValue, recordLabel } from '../core/entities/types';
import type { EntityTemplateDef } from '../core/entities/types';

const P = 'ents-smoke';
let failures = 0;
const allLines: string[] = [];

function check(name: string, ok: boolean, detail = ''): void {
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`;
  console.log(line);
  allLines.push(line);
  if (!ok) console.log(`::error title=entities-smoke FAIL::${name}${detail ? ` — ${detail}` : ''}`);
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

  const choicesIn = (n: string[], def = 'a') => ({ label: 'Status', type: 'select' as const, required: false, options: { choices: n }, hasDefault: true, defaultValue: def });
  check('удаление используемого значения списка отклонено', (await failsWith(() => updateField(P, KEY, field('Status').id, choicesIn(['b', 'c'], 'b'))))?.includes('используются') === true);
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

  // — Связи «многие ко многим», обратные связи, удаление связанных записей (строка 2) —
  const company = await createTemplate(P, { name: 'Компания', namePlural: 'Компании' });
  await addField(P, company.key, { label: 'Title', type: 'text', required: true });
  const c1 = await createRecord(P, company.key, { title: 'Альфа' });
  const c2 = await createRecord(P, company.key, { title: 'Бета' });
  const c3 = await createRecord(P, company.key, { title: 'Гамма' });

  await add('Firms', 'relations', { options: { targetTemplateId: company.id } });
  await add('Main', 'relation', { options: { targetTemplateId: company.id, onDelete: 'restrict' } });
  const withFirms = async (name: string, ids: unknown, extra: Record<string, unknown> = {}) =>
    createRecord(P, KEY, { name, email: `${Math.random().toString(36).slice(2, 9)}@example.com`, firms: ids, ...extra });

  const m1 = await withFirms('Связный', [c1.id, c2.id, c1.id]);
  check('связь с несколькими записями: значения хранятся списком без повторов', JSON.stringify(m1.data.firms) === JSON.stringify([c1.id, c2.id]));
  check('чужой или несуществующий id в связи отклонён', (await failsWith(() => withFirms('Хх', [c1.id, 'нет-такой'])))?.includes('не найдены') === true);
  check('запись другой сущности нельзя поставить в связь', (await failsWith(() => withFirms('Хх', [m1.id])))?.includes('не найдены') === true);
  check('значение по умолчанию для связи отклонено', (await failsWith(() => addField(P, KEY, { label: 'Bad4', type: 'relations', required: false, options: { targetTemplateId: company.id }, hasDefault: true, defaultValue: [] })))?.includes('по умолчанию не задаётся') === true);
  check('неизвестное правило удаления отклонено', (await failsWith(() => addField(P, KEY, { label: 'Bad5', type: 'relations', required: false, options: { targetTemplateId: company.id, onDelete: 'boom' } as never })))?.includes('правило удаления') === true);

  const m2 = await withFirms('Второй', [c2.id, c3.id]);
  await renameTemplate(P, KEY, { name: 'Контакт', namePlural: 'Контакты', displayField: 'name' });
  const rev = await listReverse(P, company.key, c2.id);
  const revFirms = rev.find((g) => g.field.key === 'firms');
  check('обратная связь: компания видит контакты, которые на неё ссылаются', revFirms !== undefined && revFirms.total === 2 && revFirms.template.key === KEY);
  check('обратная связь: подпись записи берётся по полю-заголовку сущности', revFirms !== undefined && revFirms.records.some((r) => r.label === 'Связный') && revFirms.records.some((r) => r.label === 'Второй'));
  check('у записи без ссылок обратных связей нет', (await listReverse(P, company.key, (await createRecord(P, company.key, { title: 'Одинокая' })).id)).length === 0);

  // правка списка связей
  const upd = await updateRecord(P, KEY, m1.id, { ...m1.data, firms: [c3.id] });
  check('правка меняет набор связанных записей', JSON.stringify(upd.data.firms) === JSON.stringify([c3.id]));
  await updateRecord(P, KEY, m1.id, { ...upd.data, firms: [c1.id, c2.id] });

  // удаление: ссылки убираются
  await deleteRecord(P, company.key, c1.id);
  const afterDel = (await listRecords(P, KEY)).find((r) => r.id === m1.id)!;
  check('удаление записи убирает ссылку на неё из списка связей, остальные остаются', JSON.stringify(afterDel.data.firms) === JSON.stringify([c2.id]));
  await deleteRecord(P, company.key, c2.id);
  const afterDel2 = (await listRecords(P, KEY)).find((r) => r.id === m1.id)!;
  check('когда ссылок не осталось, значение поля убирается целиком', !('firms' in afterDel2.data));

  // удаление: запрет по правилу поля
  const m3 = await createRecord(P, KEY, { name: 'С главной', email: 'main@example.com', main: c3.id });
  const blocked = await failsWith(() => deleteRecord(P, company.key, c3.id));
  check('правило «не давать удалять» блокирует удаление, пока ссылаются', blocked?.includes('нельзя удалить') === true);
  check('при блокировке ничего не изменено', (await listRecords(P, company.key)).some((r) => r.id === c3.id) && Array.isArray((await listRecords(P, KEY)).find((r) => r.id === m2.id)!.data.firms));
  await updateRecord(P, KEY, m3.id, { ...m3.data, main: '' });
  await deleteRecord(P, company.key, c3.id);
  check('после снятия ссылки запись удаляется', !(await listRecords(P, company.key)).some((r) => r.id === c3.id));

  // удаление сущности, на которую ссылаются поля
  check('сущность, на которую ссылаются поля, удалить нельзя', (await failsWith(() => deleteTemplate(P, company.key)))?.includes('ссылаются') === true);

  // смена вида связи при наличии записей
  const firmsId = field('Firms').id;
  const c4 = await createRecord(P, company.key, { title: 'Дельта' });
  const c5 = await createRecord(P, company.key, { title: 'Эпсилон' });
  await updateRecord(P, KEY, m2.id, { ...(await listRecords(P, KEY)).find((r) => r.id === m2.id)!.data, firms: [c4.id, c5.id] });
  const tooMany = await failsWith(() => updateField(P, KEY, firmsId, { label: 'Firms', type: 'relation', required: false, options: { targetTemplateId: company.id } }));
  check('переход к связи с одной записью отклонён, если где-то записей несколько', tooMany?.includes('несколько') === true);
  check('перенаправить связь на другую сущность при записях нельзя', (await failsWith(() => updateField(P, KEY, firmsId, { label: 'Firms', type: 'relations', required: false, options: { targetTemplateId: t.id } })))?.includes('перенаправить') === true);
  await updateRecord(P, KEY, m2.id, { ...(await listRecords(P, KEY)).find((r) => r.id === m2.id)!.data, firms: [c4.id] });
  t = await updateField(P, KEY, firmsId, { label: 'Firms', type: 'relation', required: false, options: { targetTemplateId: company.id } });
  const single = (await listRecords(P, KEY)).find((r) => r.id === m2.id)!;
  check('связь с несколькими → с одной: список превращается в одно значение', field('Firms').type === 'relation' && single.data.firms === c4.id);
  t = await updateField(P, KEY, firmsId, { label: 'Firms', type: 'relations', required: false, options: { targetTemplateId: company.id } });
  const back = (await listRecords(P, KEY)).find((r) => r.id === m2.id)!;
  check('связь с одной → с несколькими: значение превращается в список', field('Firms').type === 'relations' && JSON.stringify(back.data.firms) === JSON.stringify([c4.id]));

  // — Поиск, фильтры, сортировка, страницы на сервере (строка 3) —
  const goods = await createTemplate(P, { name: 'Товар', namePlural: 'Товары' });
  await addField(P, goods.key, { label: 'Title', type: 'text', required: true });
  await addField(P, goods.key, { label: 'Price', type: 'number', required: false });
  await addField(P, goods.key, { label: 'Kind', type: 'select', required: false, options: { choices: ['еда', 'книги', 'техника'] } });
  await addField(P, goods.key, { label: 'Tags', type: 'multiselect', required: false, options: { choices: ['new', 'sale'] } });
  await addField(P, goods.key, { label: 'Active', type: 'boolean', required: false });
  const rows: Record<string, unknown>[] = [
    { title: 'Яблоки', price: 100, kind: 'еда', tags: ['sale'], active: true },
    { title: 'Груши', price: 250, kind: 'еда', active: false },
    { title: 'Роман', price: 400, kind: 'книги', tags: ['new', 'sale'], active: true },
    { title: 'Атлас', price: 1200, kind: 'книги', active: true },
    { title: 'Ноутбук', price: 90000, kind: 'техника', tags: ['new'], active: true },
    { title: 'Кабель', kind: 'техника', active: false },
    { title: 'Яблочный сок', price: 150, kind: 'еда', active: true },
  ];
  for (const row of rows) await createRecord(P, goods.key, row);
  const q = (query: RecordQuery) => queryRecords(P, goods.key, query);
  const titles = (page: { records: { data: Record<string, unknown> }[] }) => page.records.map((r) => r.data.title);
  const f = (field: string, op: FilterOp, value?: unknown) => q({ filters: [{ field, op, value }], pageSize: 100 });

  const all = await q({ pageSize: 100 });
  check('без условий возвращаются все записи с общим числом', all.total === 7 && all.records.length === 7);
  const p1 = await q({ pageSize: 3, page: 1 });
  const p3 = await q({ pageSize: 3, page: 3 });
  check('страницы: размер, число страниц, последняя неполная', p1.records.length === 3 && p1.pages === 3 && p3.records.length === 1 && p3.total === 7);
  check('страница за пределами возвращается как последняя', (await q({ pageSize: 3, page: 99 })).page === 3);
  check('размер страницы ограничен сверху', (await q({ pageSize: 100000 })).pageSize === 200);

  const asc = await q({ sort: { field: 'price', dir: 'asc' }, pageSize: 100 });
  check('сортировка по числу по возрастанию, пустые в конце', titles(asc).join() === 'Яблоки,Яблочный сок,Груши,Роман,Атлас,Ноутбук,Кабель', titles(asc).join());
  const desc = await q({ sort: { field: 'price', dir: 'desc' }, pageSize: 100 });
  check('сортировка по убыванию, пустые всё равно в конце', titles(desc).join() === 'Ноутбук,Атлас,Роман,Груши,Яблочный сок,Яблоки,Кабель', titles(desc).join());
  const byTitle = await q({ sort: { field: 'title', dir: 'asc' }, pageSize: 100 });
  check('сортировка по тексту по алфавиту', titles(byTitle)[0] === 'Атлас' && titles(byTitle)[6] === 'Яблочный сок', titles(byTitle).join());
  const byCreated = await q({ sort: { field: 'createdAt', dir: 'asc' }, pageSize: 100 });
  check('сортировка по служебной дате создания', titles(byCreated)[0] === 'Яблоки' && titles(byCreated)[6] === 'Яблочный сок', titles(byCreated).join());

  check('поиск по подстроке во всех полях без учёта регистра', titles(await q({ q: 'ЯБЛ', pageSize: 100 })).sort().join() === 'Яблоки,Яблочный сок');
  check('поиск по значению списка', (await q({ q: 'техника' })).total === 2);

  check('фильтр «равно» по списку', (await f('kind', 'eq', 'книги')).total === 2);
  check('фильтр «не равно» включает записи без значения', (await f('kind', 'ne', 'еда')).total === 4);
  check('фильтр «больше» по числу не берёт записи без числа', (await f('price', 'gt', 200)).total === 4);
  check('фильтр «не больше» по числу', titles(await f('price', 'lte', 150)).sort().join() === 'Яблоки,Яблочный сок');
  check('фильтр «одно из»', (await f('kind', 'in', ['еда', 'техника'])).total === 5);
  check('фильтр «содержит» по списку с несколькими значениями', (await f('tags', 'contains', 'sale')).total === 2);
  check('фильтр «пусто» и «не пусто»', (await f('price', 'empty')).total === 1 && (await f('price', 'notEmpty')).total === 6);
  check('фильтр по да/нет', (await f('active', 'eq', 'false')).total === 2 && (await f('active', 'eq', true)).total === 5);
  check('несколько условий складываются через «и»', titles(await q({ filters: [{ field: 'kind', op: 'eq', value: 'еда' }, { field: 'price', op: 'gte', value: 150 }], pageSize: 100 })).sort().join() === 'Груши,Яблочный сок');
  check('поиск, фильтр и сортировка вместе', titles(await q({ q: 'я', filters: [{ field: 'kind', op: 'eq', value: 'еда' }], sort: { field: 'price', dir: 'desc' }, pageSize: 100 })).join() === 'Яблочный сок,Яблоки');
  check('фильтр по дате создания «позже» будущей даты ничего не находит', (await f('createdAt', 'gt', '2999-01-01')).total === 0);
  check('неизвестное поле в фильтре — понятная ошибка', (await failsWith(() => f('nope', 'eq', 1)))?.includes('Неизвестное поле') === true);
  check('неизвестное поле сортировки — понятная ошибка', (await failsWith(() => q({ sort: { field: 'nope', dir: 'asc' } })))?.includes('Неизвестное поле') === true);

  const parsed = parseRecordQuery(new URLSearchParams({ filter: '[{"field":"kind","op":"eq","value":"еда"}]', sort: 'price', dir: 'desc', page: '2' }));
  check('параметры адресной строки разбираются в запрос', typeof parsed !== 'string' && parsed.sort?.dir === 'desc' && parsed.filters?.[0].op === 'eq' && parsed.page === 2);
  check('битый фильтр в адресной строке даёт текст ошибки', typeof parseRecordQuery(new URLSearchParams({ filter: '{' })) === 'string' && typeof parseRecordQuery(new URLSearchParams({ filter: '[{"op":"eq"}]' })) === 'string');
  check('постраничный ответ включается только при параметрах', wantsPage(new URLSearchParams({ q: 'а' })) && !wantsPage(new URLSearchParams()));

  // Уборка
  await basePrisma.entityRecord.deleteMany({ where: { programId: P } });
  await basePrisma.entityTemplate.deleteMany({ where: { programId: P } });

  console.log(failures === 0 ? '\nВсе проверки модели данных пройдены' : `\nПРОВАЛЕНО проверок: ${failures}`);
  console.log(`::notice title=entities-smoke итог::проверок ${allLines.length}, провалено ${failures}`);
  await basePrisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  const stack = e instanceof Error ? (e.stack ?? '').split(/\r?\n/).slice(1, 4).join(' ; ') : '';
  const text = e instanceof Error ? `${e.message} | ${stack}` : String(e);
  console.log(`::error title=entities-smoke crash::${text.replace(/[\r\n]+/g, ' ')}`);
  await basePrisma.$disconnect();
  process.exit(1);
});
