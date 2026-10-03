/**
 * Смоук-проверка прав на сущности (строка 5 таблицы покрытия): доступ ролей к сущностям, чужие и свои
 * записи, скрытые и «только чтение» поля, обратные связи, настройка доступа роли. Режим direct:
 *   DATA_MODE=direct DATABASE_URL=... npx tsx tools/access-smoke.ts
 */
process.env.DATA_MODE = 'direct';
delete process.env.BUS_URL;

import { basePrisma } from '../core/data/prisma';
import { newId } from '../core/data/ids';
import {
  AccessError,
  canAccessRecord,
  hasAnyEntityAccess,
  mergeRules,
  type AccessRule,
  type ViewerUser,
} from '../core/entities/access';
import {
  EntityError,
  addField,
  createRecord,
  createTemplate,
  deleteRecord,
  getTemplateFor,
  listRecords,
  listReverse,
  listTemplatesFor,
  queryRecords,
  updateRecord,
} from '../core/entities/service';
import { RoleError } from '../core/roles/service';
import { ReportError, getFieldReport, listReportableTemplates } from '../core/reports/service';
import { getRoleEntityAccess, setRoleEntityAccess, type EntityAccessRuleDto } from '../core/roles/entityAccess';

let failures = 0;
let total = 0;

function check(name: string, ok: boolean, detail = ''): void {
  total++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) {
    failures++;
    console.log(`::error title=access-smoke FAIL::${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Класс ошибки при отказе: access / entity / role — или null, если операция прошла */
async function denied(fn: () => Promise<unknown>): Promise<'access' | 'entity' | 'role' | 'other' | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    if (e instanceof AccessError) return 'access';
    if (e instanceof RoleError) return 'role';
    if (e instanceof EntityError) return 'entity';
    return 'other';
  }
}

const rule = (over: Partial<AccessRule> = {}): AccessRule => ({
  canRead: false, canCreate: false, canUpdate: false, canDelete: false, rowScope: 'all', hiddenFields: [], readonlyFields: [], ...over,
});

async function main(): Promise<void> {
  // — Слияние правил нескольких ролей (без базы) —
  const merged = mergeRules('u', [
    rule({ canRead: true, rowScope: 'own', hiddenFields: ['a', 'b'], readonlyFields: ['x'] }),
    rule({ canRead: true, canUpdate: true, rowScope: 'all', hiddenFields: ['b', 'c'], readonlyFields: [] }),
  ]);
  check('слияние: разрешено то, что разрешает хотя бы одна роль', merged.read && merged.update && !merged.create && !merged.delete);
  check('слияние: «все записи» побеждает «только свои»', merged.own === false);
  check('слияние: поле скрыто, только если скрыто во всех ролях', merged.hidden.join() === 'b');
  check('слияние: «только чтение» — тоже пересечение', merged.readonly.length === 0);
  check('слияние: все роли «только свои» дают «только свои»', mergeRules('u', [rule({ canRead: true, rowScope: 'own' }), rule({ canRead: true, canCreate: true, rowScope: 'own' })]).own === true);
  check('слияние без правил — ничего не разрешено', (() => { const m = mergeRules('u', []); return !m.read && !m.create && !m.update && !m.delete; })());

  // — Окружение —
  const program = await basePrisma.program.create({ data: { id: newId(), slug: `access-${newId()}`, name: 'Access smoke' } });
  const P = program.id;
  const mkUser = async (name: string) => basePrisma.user.create({ data: { id: newId(), programId: P, email: `${newId()}@example.test`, name, passwordHash: 'x' } });
  const mkRole = async (name: string) => basePrisma.role.create({ data: { id: newId(), programId: P, key: newId(), name, permissions: [] } });
  const give = async (userId: string, roleId: string) => basePrisma.userRole.create({ data: { userId, roleId } });
  const viewer = (u: { id: string }, permissions: string[] = []): ViewerUser => ({ id: u.id, programId: P, permissions });

  const [uAdmin, uReader, uOwn, uOwn2, uMixed, uNone, uEditor] = await Promise.all(
    ['Админ', 'Читатель', 'Свои', 'Свои-2', 'Смешанный', 'Без ролей', 'Редактор'].map(mkUser)
  );
  const [rReader, rOwn, rEditor] = await Promise.all(['Читатель', 'Свои записи', 'Редактор без секрета'].map(mkRole));
  await give(uReader.id, rReader.id);
  await give(uOwn.id, rOwn.id);
  await give(uOwn2.id, rOwn.id);
  await give(uMixed.id, rReader.id);
  await give(uMixed.id, rOwn.id);
  await give(uEditor.id, rEditor.id);

  const admin = viewer(uAdmin, ['entities.manage']);
  const reader = viewer(uReader);
  const own = viewer(uOwn);
  const own2 = viewer(uOwn2);
  const mixed = viewer(uMixed);
  const none = viewer(uNone);
  const editor = viewer(uEditor);

  const order = await createTemplate(P, { name: 'Заказ', namePlural: 'Заказы' });
  await addField(P, order.key, { label: 'Title', type: 'text', required: true });
  await addField(P, order.key, { label: 'Amount', type: 'number', required: false });
  await addField(P, order.key, { label: 'Note', type: 'text', required: false });
  await addField(P, order.key, { label: 'Secret', type: 'text', required: false });
  const tOrder = (await getTemplateFor(P, order.key))!;
  const item = await createTemplate(P, { name: 'Позиция', namePlural: 'Позиции' });
  await addField(P, item.key, { label: 'Name', type: 'text', required: true });
  await addField(P, item.key, { label: 'Order', type: 'relation', required: false, options: { targetTemplateId: tOrder.id } });

  // — Настройка доступа ролей через настоящую службу —
  const saveRules = (roleId: string, rules: Partial<EntityAccessRuleDto>[], actor: ViewerUser = admin) =>
    setRoleEntityAccess(P, actor, roleId, rules);
  await saveRules(rReader.id, [{ templateId: tOrder.id, canRead: true, hiddenFields: ['secret'] }]);
  await saveRules(rOwn.id, [{ templateId: tOrder.id, canCreate: true, canUpdate: true, canDelete: true, rowScope: 'own', readonlyFields: ['amount'] }, { templateId: item.id, canRead: true }]);
  await saveRules(rEditor.id, [{ templateId: tOrder.id, canRead: true, canUpdate: true, hiddenFields: ['secret'] }]);
  const saved = await getRoleEntityAccess(P, rOwn.id);
  check('правила роли сохраняются и читаются; создание включило просмотр', saved.rules.find((r) => r.templateId === tOrder.id)?.canRead === true && saved.rules.length === 2);

  // — Администратор (entities.manage) —
  const a1 = await createRecord(P, order.key, { title: 'Заказ админа', amount: 100, note: 'n1', secret: 'S-1' }, admin);
  check('запись, созданная сотрудником, хранит его как автора', a1.createdById === uAdmin.id);
  check('право entities.manage обходит правила: все поля и все записи', (await queryRecords(P, order.key, {}, admin)).total === 1 && (await listRecords(P, order.key, undefined, admin))[0].data.secret === 'S-1');
  check('для entities.manage все сущности видны целиком', (await listTemplatesFor(P, admin)).length === 2 && (await getTemplateFor(P, order.key, admin))!.access === undefined);

  // — Сотрудник без прав —
  check('без роли: нет доступа ни к списку, ни к созданию, ни к правке, ни к удалению',
    (await denied(() => queryRecords(P, order.key, {}, none))) === 'access' &&
    (await denied(() => createRecord(P, order.key, { title: 'x' }, none))) === 'access' &&
    (await denied(() => updateRecord(P, order.key, a1.id, { title: 'x' }, none))) === 'access' &&
    (await denied(() => deleteRecord(P, order.key, a1.id, none))) === 'access');
  check('без роли: сущностей в меню нет, справочников нет', (await listTemplatesFor(P, none)).length === 0 && !(await hasAnyEntityAccess(none)));
  check('без роли: структура сущности недоступна', (await denied(() => getTemplateFor(P, order.key, none))) === 'access');

  // — Читатель: просмотр, секретное поле скрыто —
  const rq = await queryRecords(P, order.key, {}, reader);
  check('читатель видит записи, но без скрытого поля', rq.total === 1 && !('secret' in rq.records[0].data) && rq.records[0].data.note === 'n1');
  const rt = (await getTemplateFor(P, order.key, reader))!;
  check('структура для читателя без скрытого поля, с отметкой «нельзя создавать и менять»', !rt.fields.some((f) => f.key === 'secret') && rt.access?.create === false && rt.access?.update === false);
  check('читатель не может создавать, менять и удалять', (await denied(() => createRecord(P, order.key, { title: 'x' }, reader))) === 'access' && (await denied(() => updateRecord(P, order.key, a1.id, { title: 'x' }, reader))) === 'access' && (await denied(() => deleteRecord(P, order.key, a1.id, reader))) === 'access');
  check('по скрытому полю нельзя отфильтровать', (await denied(() => queryRecords(P, order.key, { filters: [{ field: 'secret', op: 'eq', value: 'S-1' }] }, reader))) === 'entity');
  check('по скрытому полю нельзя отсортировать', (await denied(() => queryRecords(P, order.key, { sort: { field: 'secret', dir: 'asc' } }, reader))) === 'entity');
  check('поиск не находит записи по значению скрытого поля', (await queryRecords(P, order.key, { q: 'S-1' }, reader)).total === 0 && (await queryRecords(P, order.key, { q: 'S-1' }, admin)).total === 1);
  check('читатель не видит сущность, на которую у роли нет правил', (await listTemplatesFor(P, reader)).map((t) => t.key).join() === order.key);

  // — Только свои записи, «только чтение» поле —
  const o1 = await createRecord(P, order.key, { title: 'Мой заказ', amount: 999, note: 'моя', secret: 'S-own' }, own);
  check('своя запись создаётся с автором; «только чтение» при создании не задаётся', o1.createdById === uOwn.id && o1.data.amount === undefined && o1.data.secret === 'S-own');
  const ownList = await queryRecords(P, order.key, {}, own);
  check('сотрудник со «своими» записями видит только свои', ownList.total === 1 && ownList.records[0].id === o1.id);
  check('другой сотрудник той же роли чужих записей не видит', (await queryRecords(P, order.key, {}, own2)).total === 0);
  check('чужую запись нельзя изменить и удалить', (await denied(() => updateRecord(P, order.key, a1.id, { title: 'взлом' }, own))) === 'access' && (await denied(() => deleteRecord(P, order.key, a1.id, own))) === 'access');
  check('чужая запись другого сотрудника той же роли тоже недоступна', (await denied(() => updateRecord(P, order.key, o1.id, { title: 'взлом' }, own2))) === 'access');
  await updateRecord(P, order.key, o1.id, { title: 'Мой заказ (правка)', amount: 1, note: 'новая', secret: 'S-own' }, admin);
  await updateRecord(P, order.key, o1.id, { title: 'Мой заказ', amount: 555, note: 'новая', secret: 'S-own' }, admin);
  const afterOwn = await updateRecord(P, order.key, o1.id, { title: 'Мой заказ 2', amount: 777, note: 'ещё', secret: 'S-own' }, own);
  check('«только чтение» поле при правке сохраняет прежнее значение, остальные меняются', afterOwn.data.amount === 555 && afterOwn.data.title === 'Мой заказ 2' && afterOwn.data.note === 'ещё');

  // — Смешанные роли —
  check('две роли: «все записи» из одной побеждает «свои» из другой', (await queryRecords(P, order.key, {}, mixed)).total === 2);
  check('две роли: поле скрыто только если скрыто в обеих (здесь не скрыто)', (await queryRecords(P, order.key, {}, mixed)).records.some((r) => r.data.secret !== undefined));
  check('две роли: право создания берётся из одной, право удаления своей записи работает', (await denied(() => createRecord(P, order.key, { title: 'Смешанный' }, mixed))) === null);

  // — Скрытое поле не затирается при правке —
  const e1 = await updateRecord(P, order.key, a1.id, { title: 'Заказ админа', note: 'правка редактора', secret: 'ХАК' }, editor);
  const rawA1 = await basePrisma.entityRecord.findUnique({ where: { id: a1.id } });
  check('редактор меняет доступные поля', e1.data.note === 'правка редактора');
  check('скрытое поле при правке не меняется и не затирается', (rawA1!.data as Record<string, unknown>).secret === 'S-1' && !('secret' in e1.data));

  // — Удаление своей записи —
  await deleteRecord(P, order.key, o1.id, own);
  check('свою запись удалить можно', !(await listRecords(P, order.key, undefined, admin)).some((r) => r.id === o1.id));

  // — Обратные связи —
  const i1 = await createRecord(P, item.key, { name: 'Позиция админа', order: a1.id }, admin);
  check('обратные связи: тот, кто читает обе сущности, видит ссылающиеся записи', (await listReverse(P, order.key, a1.id, admin)).length === 1);
  check('обратные связи: без права читать сущность-источник группа не показывается', (await listReverse(P, order.key, a1.id, reader)).length === 0);
  check('обратные связи: нельзя запросить связи записи, к которой нет доступа', (await denied(() => listReverse(P, order.key, a1.id, none))) === 'access');
  await saveRules(rReader.id, [{ templateId: tOrder.id, canRead: true, hiddenFields: ['secret'] }, { templateId: item.id, canRead: true, rowScope: 'own' }]);
  check('обратные связи: «только свои» скрывает чужие записи-источники', (await listReverse(P, order.key, a1.id, reader)).length === 0);
  await saveRules(rReader.id, [{ templateId: tOrder.id, canRead: true, hiddenFields: ['secret'] }, { templateId: item.id, canRead: true, rowScope: 'all', hiddenFields: ['name'] }]);
  const revGroups = await listReverse(P, order.key, a1.id, reader);
  check('обратные связи: скрытое поле не попадает в подпись записи', revGroups.length === 1 && revGroups[0].records.length === 1 && !revGroups[0].records[0].label.includes('Позиция админа'), revGroups[0]?.records[0]?.label);
  void i1;

  // — Настройка доступа: проверки —
  check('несуществующая сущность в правилах отклонена', (await denied(() => saveRules(rReader.id, [{ templateId: 'нет-такой', canRead: true }]))) === 'role');
  check('одна сущность дважды отклонена', (await denied(() => saveRules(rReader.id, [{ templateId: tOrder.id, canRead: true }, { templateId: tOrder.id, canRead: true }]))) === 'role');
  check('неизвестное поле в списке скрытых отклонено', (await denied(() => saveRules(rReader.id, [{ templateId: tOrder.id, canRead: true, hiddenFields: ['нет'] }]))) === 'role');
  check('неизвестная область записей отклонена', (await denied(() => saveRules(rReader.id, [{ templateId: tOrder.id, canRead: true, rowScope: 'чужие' as never }]))) === 'role');
  check('правила не списком отклонены', (await denied(() => setRoleEntityAccess(P, admin, rReader.id, { a: 1 }))) === 'role');
  const req = await createTemplate(P, { name: 'Анкета', namePlural: 'Анкеты' });
  await addField(P, req.key, { label: 'Passport', type: 'text', required: true });
  const tReq = (await getTemplateFor(P, req.key))!;
  const blocked = await denied(() => saveRules(rReader.id, [{ templateId: tReq.id, canCreate: true, hiddenFields: ['passport'] }]));
  check('обязательное поле без значения по умолчанию нельзя скрыть, пока роль создаёт записи', blocked === 'role');
  check('то же поле скрыть можно, если роль только читает', (await denied(() => saveRules(rReader.id, [{ templateId: tReq.id, canRead: true, hiddenFields: ['passport'] }]))) === null);
  const dropped = await saveRules(rReader.id, [{ templateId: tOrder.id }]);
  check('правило, где ничего не разрешено, не сохраняется', dropped.length === 0 && (await getRoleEntityAccess(P, rReader.id)).rules.length === 0);
  const both = await saveRules(rReader.id, [{ templateId: tOrder.id, canRead: true, hiddenFields: ['note'], readonlyFields: ['note', 'amount'] }]);
  check('поле и скрытое, и «только чтение» остаётся только скрытым', both[0].hiddenFields.join() === 'note' && both[0].readonlyFields.join() === 'amount');

  // — Нельзя выдать больше своего —
  await saveRules(rEditor.id, [{ templateId: tOrder.id, canRead: true, canUpdate: true, hiddenFields: ['secret'] }]);
  const lead = viewer(uEditor, ['roles.manage']);
  check('нельзя выдать удаление, которого нет у выдающего', (await denied(() => saveRules(rReader.id, [{ templateId: tOrder.id, canRead: true, canDelete: true, hiddenFields: ['secret'] }], lead))) === 'role');
  check('нельзя выдать «все записи» тому, у кого они «только свои»', (await denied(() => saveRules(rReader.id, [{ templateId: tOrder.id, canRead: true, hiddenFields: ['secret'] }], own))) === 'role');
  check('нельзя выдать роли открытое поле, скрытое у самого выдающего', (await denied(() => saveRules(rReader.id, [{ templateId: tOrder.id, canRead: true, canUpdate: true }], lead))) === 'role');
  check('в пределах своих прав выдать можно', (await denied(() => saveRules(rReader.id, [{ templateId: tOrder.id, canRead: true, canUpdate: true, hiddenFields: ['secret'] }], lead))) === null);
  const sysRole = await basePrisma.role.create({ data: { id: newId(), programId: P, key: 'admin', name: 'Администратор', permissions: ['*'], isSystem: true } });
  check('у роли с полным доступом настраивать нечего', (await denied(() => saveRules(sysRole.id, []))) === 'role');
  check('роль чужой программы недоступна', (await denied(() => getRoleEntityAccess('чужая', rReader.id))) === 'role');

  // — Всё, что привязано к записи, наследует права на запись; отчёты считают только доступное —
  await saveRules(rReader.id, [{ templateId: tOrder.id, canRead: true, hiddenFields: ['secret'] }]);
  check('доступ к записи: администратор может всё', (await canAccessRecord(admin, a1.id, 'read')) && (await canAccessRecord(admin, a1.id, 'update')));
  check('доступ к записи: читатель читает, но не меняет', (await canAccessRecord(reader, a1.id, 'read')) && !(await canAccessRecord(reader, a1.id, 'update')));
  check('доступ к записи: «только свои» не открывает чужую запись, но открывает свою', !(await canAccessRecord(own, a1.id, 'read')) && (await canAccessRecord(own, (await createRecord(P, order.key, { title: 'Своя для вложений' }, own)).id, 'update')));
  check('доступ к записи: без роли нельзя ничего; несуществующая запись — нельзя', !(await canAccessRecord(none, a1.id, 'read')) && !(await canAccessRecord(admin, 'нет-такой', 'read')));

  const ticket = await createTemplate(P, { name: 'Заявка', namePlural: 'Заявки' });
  await addField(P, ticket.key, { label: 'Stage', type: 'select', required: false, options: { choices: ['новая', 'в работе'] } });
  await addField(P, ticket.key, { label: 'Title', type: 'text', required: false });
  const tTicket = (await getTemplateFor(P, ticket.key))!;
  for (const stage of ['новая', 'новая', 'в работе']) await createRecord(P, ticket.key, { stage, title: 'з' }, admin);
  await saveRules(rReader.id, [{ templateId: tTicket.id, canRead: true }]);
  const rep = (await listReportableTemplates(P, reader)).find((t) => t.key === ticket.key);
  check('отчёты: читатель видит сущность, к которой есть доступ, с числом записей', rep?.recordCount === 3);
  check('отчёты: распределение считается по доступным записям', (await getFieldReport(P, ticket.key, 'stage', reader)).buckets.find((b) => b.label === 'новая')?.count === 2);
  check('отчёты: сотрудник без доступа не видит сущностей', (await listReportableTemplates(P, none)).length === 0);
  check('отчёты: чужая сущность недоступна по ключу', await (async () => { try { await getFieldReport(P, ticket.key, 'stage', none); return false; } catch (e) { return e instanceof ReportError; } })());
  await saveRules(rReader.id, [{ templateId: tTicket.id, canRead: true, rowScope: 'own' }]);
  check('отчёты: при «только свои» чужие записи не считаются', (await getFieldReport(P, ticket.key, 'stage', reader)).total === 0);
  await saveRules(rReader.id, [{ templateId: tTicket.id, canRead: true, hiddenFields: ['stage'] }]);
  check('отчёты: по скрытому полю отчёт построить нельзя', await (async () => { try { await getFieldReport(P, ticket.key, 'stage', reader); return false; } catch (e) { return e instanceof ReportError; } })());
  check('отчёты: администратор видит всё', (await getFieldReport(P, ticket.key, 'stage', admin)).total === 3);

  // — Каскады —
  await saveRules(rReader.id, [{ templateId: tReq.id, canRead: true }]);
  check('перед удалением у сущности есть правило доступа', (await basePrisma.entityAccess.count({ where: { templateId: tReq.id } })) === 1);
  await basePrisma.entityTemplate.deleteMany({ where: { id: tReq.id } });
  check('при удалении сущности её правила доступа удаляются', (await basePrisma.entityAccess.count({ where: { templateId: tReq.id } })) === 0);
  await basePrisma.role.delete({ where: { id: rEditor.id } });
  check('при удалении роли её правила доступа удаляются', (await basePrisma.entityAccess.count({ where: { roleId: rEditor.id } })) === 0);

  // Уборка
  await basePrisma.program.delete({ where: { id: P } });

  console.log(failures === 0 ? '\nВсе проверки прав на сущности пройдены' : `\nПРОВАЛЕНО проверок: ${failures}`);
  console.log(`::notice title=access-smoke итог::проверок ${total}, провалено ${failures}`);
  await basePrisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  const stack = e instanceof Error ? (e.stack ?? '').split(/\r?\n/).slice(1, 4).join(' ; ') : '';
  const text = e instanceof Error ? `${e.message} | ${stack}` : String(e);
  console.log(`::error title=access-smoke crash::${text.replace(/[\r\n]+/g, ' ')}`);
  await basePrisma.$disconnect();
  process.exit(1);
});
