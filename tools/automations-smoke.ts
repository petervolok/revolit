/**
 * Смоук-проверка автоматизаций (строка 8 таблицы покрытия): проверка описаний, подстановки, события
 * записей, условия, действия (изменить поля, создать запись и задачу, письмо, вебхук), защита от
 * зацикливания и лавины, расписание, ручной запуск, журнал. Режим direct: события эмитятся сразу
 * после записи, поэтому результат виден, когда await createRecord(...) вернулся.
 *   DATA_MODE=direct DATABASE_URL=... npx tsx tools/automations-smoke.ts
 */
process.env.DATA_MODE = 'direct';
delete process.env.BUS_URL;
delete process.env.AUTOMATION_ALLOW_PRIVATE_URLS;

import http from 'http';
import type { AddressInfo } from 'net';
import { basePrisma } from '../core/data/prisma';
import { newId } from '../core/data/ids';
import { setMailPort } from '../core/ports/registry';
import type { OutgoingMail } from '../core/ports/types';
import { addField, createRecord, createTemplate, deleteRecord, getTemplateFor, updateRecord } from '../core/entities/service';
import {
  AutomationError,
  createAutomation,
  deleteAutomation,
  getAutomation,
  listAutomations,
  listRuns,
  scheduleJobKey,
  updateAutomation,
} from '../core/automations/service';
import {
  invalidateAutomationCache,
  processSchedule,
  resetEngineState,
  runAutomation,
  runManually,
  startAutomationEngine,
} from '../core/automations/engine';
import { render, renderText, withClock } from '../core/automations/template';
import { assertSafeUrl, isPrivateAddress, signBody, WebhookError } from '../core/automations/webhook';

let failures = 0;
let total = 0;

function check(name: string, ok: boolean, detail = ''): void {
  total++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) {
    failures++;
    console.log(`::error title=automations-smoke FAIL::${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function errorOf(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof AutomationError || e instanceof WebhookError ? e.message : `НЕ ожидаемая ошибка: ${(e as Error).message}`;
  }
}

async function main(): Promise<void> {
  // — Подстановки —
  const ctx = withClock({ record: { id: 'r1', title: 'Заказ', total: 500, tags: ['a', 'b'] }, event: 'record.created' }, new Date('2026-10-03T10:00:00Z'));
  check('подстановка: целиком сохраняет тип, внутри текста — строка', render('{{record.total}}', ctx) === 500 && renderText('Сумма {{record.total}} руб.', ctx) === 'Сумма 500 руб.');
  check('подстановка: объект и массив в тексте — JSON, неизвестный путь — пусто', renderText('{{record.tags}}', ctx) === '["a","b"]' && renderText('[{{record.нет}}]', ctx) === '[]' && render('{{record.нет}}', ctx) === null);
  check('подстановка: часы и дата', renderText('{{today}} {{event}}', ctx) === '2026-10-03 record.created');
  check('подстановка: служебные свойства недоступны', renderText('{{record.constructor}}|{{__proto__}}|{{record.__proto__.x}}', ctx) === '||');
  check('подстановка: рекурсивно в объектах и массивах', JSON.stringify(render({ a: ['{{record.id}}', 1], b: { c: '{{record.title}}!' } }, ctx)) === '{"a":["r1",1],"b":{"c":"Заказ!"}}');

  // — Адреса вебхуков —
  check('внутренние адреса распознаются', ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1', '100.64.0.1'].every(isPrivateAddress));
  check('публичные адреса не считаются внутренними', !isPrivateAddress('8.8.8.8') && !isPrivateAddress('172.32.0.1') && !isPrivateAddress('2606:4700:4700::1111'));
  const blocked = async (u: string) => (await errorOf(() => assertSafeUrl(u))) !== null;
  check('вебхук: localhost, внутренние адреса, логин в адресе и чужие схемы запрещены', (await blocked('http://localhost/x')) && (await blocked('http://127.0.0.1/x')) && (await blocked('http://10.0.0.5/')) && (await blocked('http://[::1]/')) && (await blocked('http://169.254.169.254/latest/meta-data')) && (await blocked('http://user:pass@8.8.8.8/')) && (await blocked('ftp://8.8.8.8/')) && (await blocked('не адрес')));
  check('вебхук: публичный адрес по IP допускается', (await errorOf(() => assertSafeUrl('https://8.8.8.8/hook'))) === null);

  // — Окружение —
  const program = await basePrisma.program.create({ data: { id: newId(), slug: `auto-${newId()}`, name: 'Auto smoke' } });
  const P = program.id;
  const user = await basePrisma.user.create({ data: { id: newId(), programId: P, email: `${newId()}@example.test`, name: 'Менеджер', passwordHash: 'x' } });
  const sent: OutgoingMail[] = [];
  setMailPort({ send: async (m) => { sent.push(m); } });

  const order = await createTemplate(P, { name: 'Заказ', namePlural: 'Заказы' });
  await addField(P, order.key, { label: 'Title', type: 'text', required: true });
  await addField(P, order.key, { label: 'Status', type: 'select', required: false, options: { choices: ['new', 'in_work'] } });
  await addField(P, order.key, { label: 'Total', type: 'number', required: false });
  await addField(P, order.key, { label: 'Email', type: 'email', required: false });
  await addField(P, order.key, { label: 'Note', type: 'text', required: false });
  await addField(P, order.key, { label: 'Flag', type: 'text', required: false });
  const journal = await createTemplate(P, { name: 'Запись журнала', namePlural: 'Журнал' });
  await addField(P, journal.key, { label: 'Text', type: 'text', required: false });
  const tOrder = (await getTemplateFor(P, order.key))!;
  const tJournal = (await getTemplateFor(P, journal.key))!;

  const make = async (input: Record<string, unknown>) => {
    const a = await createAutomation(P, user.id, input);
    invalidateAutomationCache(P);
    return a;
  };
  const reset = async () => {
    for (const a of await listAutomations(P)) await deleteAutomation(P, a.id);
    invalidateAutomationCache(P);
    resetEngineState();
  };
  const orderData = async (id: string) => (await basePrisma.entityRecord.findUnique({ where: { id } }))!.data as Record<string, unknown>;
  const journalTexts = async () => (await basePrisma.entityRecord.findMany({ where: { templateId: tJournal.id } })).map((r) => (r.data as { text?: string }).text).sort();
  const created = { type: 'record.created', templateKey: order.key };

  // — Проверка описаний —
  const bad = async (patch: Record<string, unknown>) => errorOf(() => createAutomation(P, user.id, { name: 'Тест', trigger: created, actions: [{ type: 'create_record', templateKey: journal.key, fields: { text: 'x' } }], ...patch }));
  check('название слишком короткое отклонено', (await bad({ name: 'а' }))?.includes('не короче') === true);
  check('неизвестное событие отклонено', (await bad({ trigger: { type: 'что-то' } }))?.includes('событие') === true);
  check('событие записи без сущности и с несуществующей сущностью отклонено', (await bad({ trigger: { type: 'record.created' } }))?.includes('укажите сущность') === true && (await bad({ trigger: { type: 'record.created', templateKey: 'нет' } }))?.includes('не найдена') === true);
  check('расписание не cron отклонено', (await bad({ trigger: { type: 'schedule', cron: 'каждый день' } }))?.includes('cron') === true);
  check('условия у удаления записи отклонены', (await bad({ trigger: { type: 'record.deleted', templateKey: order.key }, conditions: [{ field: 'total', op: 'gt', value: 1 }] }))?.includes('Условия по данным записи') === true);
  check('условие по несуществующему полю и с неверной операцией отклонено', (await bad({ conditions: [{ field: 'нет', op: 'eq', value: 1 }] }))?.includes('нет поля') === true && (await bad({ conditions: [{ field: 'total', op: 'около' }] }))?.includes('поле и операцию') === true);
  check('без действий и с лишними действиями отклонено', (await bad({ actions: [] }))?.includes('хотя бы одно') === true && (await bad({ actions: Array(11).fill({ type: 'create_record', templateKey: journal.key, fields: {} }) }))?.includes('не больше 10') === true);
  check('неизвестное действие отклонено', (await bad({ actions: [{ type: 'взорвать' }] }))?.includes('неизвестный тип') === true);
  check('изменение полей по расписанию и без полей отклонено', (await bad({ trigger: { type: 'schedule', cron: '0 9 * * *' }, actions: [{ type: 'set_fields', fields: { flag: 'x' } }] }))?.includes('изменять поля') === true && (await bad({ actions: [{ type: 'set_fields', fields: {} }] }))?.includes('какие поля') === true);
  check('изменение несуществующего поля отклонено', (await bad({ actions: [{ type: 'set_fields', fields: { нет: 'x' } }] }))?.includes('нет поля') === true);
  check('создание записи в несуществующей сущности отклонено', (await bad({ actions: [{ type: 'create_record', templateKey: 'нет', fields: {} }] }))?.includes('не найдена') === true);
  check('задача без названия, с плохим сроком и несуществующим исполнителем отклонена', (await bad({ actions: [{ type: 'create_task', title: '' }] }))?.includes('название задачи') === true && (await bad({ actions: [{ type: 'create_task', title: 'х', dueInDays: -1 }] }))?.includes('срок') === true && (await bad({ actions: [{ type: 'create_task', title: 'х', assigneeId: 'нет' }] }))?.includes('исполнитель') === true);
  check('письмо без получателя отклонено', (await bad({ actions: [{ type: 'send_email', to: '', subject: 'x', body: 'y' }] }))?.includes('получателя') === true);
  check('вебхук во внутреннюю сеть и с чужой схемой отклонён при сохранении', (await bad({ actions: [{ type: 'webhook', url: 'http://127.0.0.1:1/x' }] }))?.includes('внутреннюю сеть') === true && (await bad({ actions: [{ type: 'webhook', url: 'ftp://8.8.8.8/' }] }))?.includes('http') === true);
  await basePrisma.automation.createMany({ data: Array.from({ length: 50 }, (_, i) => ({ id: newId(), programId: P, name: `Заглушка ${i}`, trigger: created, actions: [] })) });
  check('не больше 50 автоматизаций в программе', (await bad({}))?.includes('Не больше 50') === true);
  await basePrisma.automation.deleteMany({ where: { programId: P } });

  // — Основной сценарий: создание заказа —
  const stop = startAutomationEngine();
  const a1 = await make({
    name: 'Новый крупный заказ',
    trigger: created,
    conditions: [{ field: 'total', op: 'gte', value: 100 }],
    actions: [
      { type: 'set_fields', fields: { status: 'new', note: 'Заказ {{record.title}} на {{record.total}}' } },
      { type: 'create_task', title: 'Позвонить: {{record.title}}', assigneeId: user.id, dueInDays: 2 },
      { type: 'create_record', templateKey: journal.key, fields: { text: 'создан {{record.title}}' } },
      { type: 'send_email', to: '{{record.email}}', subject: 'Заказ принят', body: 'Спасибо за {{record.title}}' },
    ],
  });
  const o1 = await createRecord(P, order.key, { title: 'Первый', total: 500, email: 'client@example.com' });
  const d1 = await orderData(o1.id);
  check('создание заказа: поля изменены с подстановкой', d1.status === 'new' && d1.note === 'Заказ Первый на 500');
  const task = await basePrisma.task.findFirst({ where: { programId: P, entityRecordId: o1.id } });
  check('создана задача: название, исполнитель, срок, привязка к записи', task?.title === 'Позвонить: Первый' && task.assigneeId === user.id && task.createdById === user.id && Boolean(task.dueAt));
  check('создана запись в другой сущности', (await journalTexts()).join() === 'создан Первый');
  check('отправлено письмо по адресу из записи', sent.length === 1 && sent[0].to === 'client@example.com' && sent[0].subject === 'Заказ принят' && sent[0].text === 'Спасибо за Первый');
  const runs1 = await listRuns(P, a1.id);
  check('журнал: одно срабатывание, четыре шага, все выполнены', runs1.length === 1 && runs1[0].status === 'ok' && runs1[0].steps.length === 4 && runs1[0].steps.every((s) => s.ok) && runs1[0].recordId === o1.id);
  check('счётчик и статус последнего запуска обновились', (await getAutomation(P, a1.id)).runCount === 1 && (await getAutomation(P, a1.id)).lastStatus === 'ok');

  await createRecord(P, order.key, { title: 'Мелкий', total: 50 });
  check('условие не выполнено: правило не срабатывает и в журнал не пишет', (await listRuns(P, a1.id)).length === 1 && (await journalTexts()).length === 1);
  await createRecord(P, order.key, { title: 'Без суммы' });
  check('условие по пустому полю не выполнено', (await listRuns(P, a1.id)).length === 1);

  await updateAutomation(P, a1.id, { enabled: false });
  invalidateAutomationCache(P);
  await createRecord(P, order.key, { title: 'Выключено', total: 900 });
  check('выключенная автоматизация не срабатывает', (await listRuns(P, a1.id)).length === 1);

  // — Защита от зацикливания —
  await reset();
  const a2 = await make({ name: 'Отметить изменённое', trigger: { type: 'record.updated', templateKey: order.key }, actions: [{ type: 'set_fields', fields: { flag: 'обработано' } }] });
  const o2 = await createRecord(P, order.key, { title: 'Второй', total: 10 });
  check('создание не запускает правило на «изменена»', (await listRuns(P, a2.id)).length === 0);
  await updateRecord(P, order.key, o2.id, { title: 'Второй (изм.)', total: 10 });
  const runs2 = await listRuns(P, a2.id);
  check('изменение записи: правило срабатывает один раз, собственная правка его не запускает повторно', runs2.length === 1 && (await orderData(o2.id)).flag === 'обработано' && runs2[0].status === 'ok');
  await updateRecord(P, order.key, o2.id, { title: 'Второй (ещё раз)', total: 10, flag: 'обработано' });
  const runs2b = await listRuns(P, a2.id);
  check('значения уже такие: запись не переписывается', runs2b.length === 2 && runs2b[0].steps[0].message.includes('уже такие'));

  // — Ошибка действия останавливает цепочку —
  await reset();
  const a3 = await make({ name: 'С ошибкой', trigger: created, actions: [{ type: 'set_fields', fields: { total: 'не число' } }, { type: 'create_record', templateKey: journal.key, fields: { text: 'не должно появиться' } }] });
  await createRecord(P, order.key, { title: 'Для ошибки' });
  const runs3 = await listRuns(P, a3.id);
  check('ошибка в действии: статус «ошибка», следующие действия не выполняются', runs3.length === 1 && runs3[0].status === 'error' && runs3[0].steps.length === 1 && !runs3[0].steps[0].ok && !(await journalTexts()).includes('не должно появиться'));
  check('статус последнего запуска — ошибка', (await getAutomation(P, a3.id)).lastStatus === 'error');
  check('ошибка автоматизации не срывает создание самой записи', (await basePrisma.entityRecord.count({ where: { templateId: tOrder.id } })) >= 3);

  // — Лавина —
  await reset();
  const a4 = await make({ name: 'Частое', trigger: { type: 'schedule', cron: '0 9 * * *' }, actions: [{ type: 'create_record', templateKey: journal.key, fields: { text: 'тик' } }] });
  const loaded = { ...(await getAutomation(P, a4.id)), createdById: user.id };
  let last = null;
  for (let i = 0; i < 61; i++) last = await runAutomation(loaded, { event: 'schedule' }, P);
  check('не больше 60 срабатываний в минуту: 61-е пропущено и записано в журнал', last?.status === 'skipped' && last.message.includes('в минуту') && (await listRuns(P, a4.id, 200)).some((r) => r.status === 'skipped'));

  // — Расписание —
  await reset();
  const a5 = await make({ name: 'Утренняя', trigger: { type: 'schedule', cron: '0 9 * * *' }, actions: [{ type: 'create_record', templateKey: journal.key, fields: { text: 'по расписанию {{today}}' } }] });
  const job = await basePrisma.scheduledJob.findUnique({ where: { programId_key: { programId: P, key: scheduleJobKey(a5.id) } } });
  check('расписание: заведена задача планировщика с нужным cron', job?.cronExpression === '0 9 * * *' && job.enabled);
  const before = (await journalTexts()).length;
  await processSchedule({ programId: P, jobKey: scheduleJobKey(a5.id) });
  const texts = await journalTexts();
  check('срабатывание задачи выполняет действия', texts.length === before + 1 && texts.some((t) => t?.startsWith('по расписанию 20')));
  await processSchedule({ programId: P, jobKey: 'чужая-задача' });
  check('чужая задача планировщика игнорируется', (await journalTexts()).length === before + 1);
  await updateAutomation(P, a5.id, { enabled: false });
  invalidateAutomationCache(P);
  check('выключение снимает задачу планировщика', (await basePrisma.scheduledJob.count({ where: { programId: P, key: scheduleJobKey(a5.id) } })) === 0);
  await processSchedule({ programId: P, jobKey: scheduleJobKey(a5.id) });
  check('выключенное расписание не выполняется', (await journalTexts()).length === before + 1);
  await updateAutomation(P, a5.id, { enabled: true, trigger: { type: 'schedule', cron: '30 8 * * 1' } });
  check('включение возвращает задачу с новым расписанием', (await basePrisma.scheduledJob.findUnique({ where: { programId_key: { programId: P, key: scheduleJobKey(a5.id) } } }))?.cronExpression === '30 8 * * 1');
  await deleteAutomation(P, a5.id);
  check('удаление автоматизации убирает задачу и журнал', (await basePrisma.scheduledJob.count({ where: { programId: P, key: scheduleJobKey(a5.id) } })) === 0 && (await basePrisma.automationRun.count({ where: { automationId: a5.id } })) === 0);

  // — Удаление записи —
  await reset();
  await make({ name: 'След удаления', trigger: { type: 'record.deleted', templateKey: order.key }, actions: [{ type: 'create_record', templateKey: journal.key, fields: { text: 'удалён {{record.id}}' } }] });
  const o3 = await createRecord(P, order.key, { title: 'На удаление' });
  await deleteRecord(P, order.key, o3.id);
  check('удаление записи запускает правило с идентификатором записи', (await journalTexts()).includes(`удалён ${o3.id}`));

  // — Вебхук —
  await reset();
  const received: { headers: http.IncomingHttpHeaders; body: string; url: string }[] = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      received.push({ headers: req.headers, body, url: req.url ?? '' });
      res.statusCode = req.url === '/fail' ? 500 : 200;
      res.end('ok');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  process.env.AUTOMATION_ALLOW_PRIVATE_URLS = '1';
  const a7 = await make({ name: 'Вебхук', trigger: created, actions: [{ type: 'webhook', url: `http://127.0.0.1:${port}/hook`, secret: 's3cret' }] });
  const a7b = await make({ name: 'Вебхук с ошибкой', trigger: created, actions: [{ type: 'webhook', url: `http://127.0.0.1:${port}/fail` }, { type: 'create_record', templateKey: journal.key, fields: { text: 'после ошибки' } }] });
  const a7c = await make({ name: 'Вебхук со своим телом', trigger: created, actions: [{ type: 'webhook', url: `http://127.0.0.1:${port}/custom`, body: '{"заказ":"{{record.title}}"}' }] });
  const o4 = await createRecord(P, order.key, { title: 'Для вебхука', total: 7 });
  const hook = received.find((r) => r.url === '/hook');
  const parsed = hook ? JSON.parse(hook.body) : null;
  check('вебхук доставлен: событие, автоматизация, данные записи', parsed?.event === 'record.created' && parsed.automation.id === a7.id && parsed.record.id === o4.id && parsed.record.data.title === 'Для вебхука' && hook?.headers['x-revolit-event'] === 'record.created');
  check('вебхук подписан HMAC-SHA256 по секрету', hook?.headers['x-revolit-signature'] === signBody('s3cret', hook!.body) && String(hook?.headers['x-revolit-signature']).startsWith('sha256='));
  check('ответ 500 — ошибка шага, дальнейшие действия не выполняются', (await listRuns(P, a7b.id))[0]?.status === 'error' && (await listRuns(P, a7b.id))[0].message?.includes('500') === true && !(await journalTexts()).includes('после ошибки'));
  check('своё тело вебхука с подстановкой', received.find((r) => r.url === '/custom')?.body === '{"заказ":"Для вебхука"}');
  check('сбой вебхука не мешает создать запись', Boolean(await basePrisma.entityRecord.findUnique({ where: { id: o4.id } })));
  void a7c;
  delete process.env.AUTOMATION_ALLOW_PRIVATE_URLS;
  const blockedRun = await (async () => {
    const auto = { ...(await getAutomation(P, a7.id)), createdById: user.id };
    return runAutomation(auto, { event: 'schedule' }, P);
  })();
  check('при исполнении адрес проверяется заново: внутренний запрещён, когда разрешение снято', blockedRun?.status === 'error' && blockedRun.message.includes('внутреннюю сеть'));
  await new Promise<void>((resolve) => server.close(() => resolve()));

  // — Ручной запуск —
  await reset();
  const a8 = await make({ name: 'Ручной', trigger: created, conditions: [{ field: 'total', op: 'gte', value: 1000 }], actions: [{ type: 'set_fields', fields: { flag: 'ручной' } }] });
  const o5 = await createRecord(P, order.key, { title: 'Для ручного', total: 5 });
  const skipped = await runManually(P, a8.id, o5.id);
  check('ручной запуск: условия не выполнены — «пропущено»', skipped.status === 'skipped' && skipped.message.includes('Условия'));
  await basePrisma.entityRecord.update({ where: { id: o5.id }, data: { data: { title: 'Для ручного', total: 5000 } } });
  const ran = await runManually(P, a8.id, o5.id);
  check('ручной запуск: выполняется и пишется в журнал', ran.status === 'ok' && (await orderData(o5.id)).flag === 'ручной' && (await listRuns(P, a8.id)).length === 1);
  check('ручной запуск без записи и по несуществующей записи — ошибка', (await errorOf(() => runManually(P, a8.id)))?.includes('укажите запись') === true && (await errorOf(() => runManually(P, a8.id, 'нет')))?.includes('Запись не найдена') === true);

  // — Журнал и правка —
  const upd = await updateAutomation(P, a8.id, { name: 'Ручной (правка)' });
  check('частичная правка: меняется только указанное', upd.name === 'Ручной (правка)' && upd.conditions.length === 1 && upd.actions.length === 1);
  check('правка с неверным описанием отклоняется, прежнее остаётся', (await errorOf(() => updateAutomation(P, a8.id, { actions: [] })))?.includes('хотя бы одно') === true && (await getAutomation(P, a8.id)).actions.length === 1);
  check('чужая и несуществующая автоматизация — 404', (await errorOf(() => getAutomation('чужая', a8.id)))?.includes('не найдена') === true && (await errorOf(() => deleteAutomation(P, 'нет')))?.includes('не найдена') === true);
  check('автоматизация удаляется', (await deleteAutomation(P, a8.id)).name === 'Ручной (правка)' && (await listAutomations(P)).length === 0);

  stop();
  await basePrisma.program.delete({ where: { id: P } });

  console.log(failures === 0 ? '\nВсе проверки автоматизаций пройдены' : `\nПРОВАЛЕНО проверок: ${failures}`);
  console.log(`::notice title=automations-smoke итог::проверок ${total}, провалено ${failures}`);
  await basePrisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  const stack = e instanceof Error ? (e.stack ?? '').split(/\r?\n/).slice(1, 4).join(' ; ') : '';
  const text = e instanceof Error ? `${e.message} | ${stack}` : String(e);
  console.log(`::error title=automations-smoke crash::${text.replace(/[\r\n]+/g, ' ')}`);
  await basePrisma.$disconnect();
  process.exit(1);
});
