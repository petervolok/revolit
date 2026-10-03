/**
 * Смоук-проверка публичного REST API (строка 6 таблицы покрытия): токены, вход по токену, язык запросов,
 * создание/чтение/изменение/удаление, права, ограничение частоты, описание OpenAPI. Обработчики
 * вызываются напрямую с настоящими запросами (NextRequest), без поднятого сервера. Режим direct:
 *   DATA_MODE=direct DATABASE_URL=... npx tsx tools/api-smoke.ts
 */
process.env.DATA_MODE = 'direct';
delete process.env.BUS_URL;

import { NextRequest } from 'next/server';
import { basePrisma } from '../core/data/prisma';
import { newId } from '../core/data/ids';
import {
  ApiTokenError,
  authenticateApiToken,
  checkRateLimit,
  createApiToken,
  listApiTokens,
  resetApiTokenCache,
  revokeApiToken,
} from '../core/apitokens/service';
import { addField, createRecord, createTemplate, getTemplateFor } from '../core/entities/service';
import { setRoleEntityAccess } from '../core/roles/entityAccess';
import { buildOpenApi } from '../core/apiv1/openapi';
import { parseApiQuery } from '../core/apiv1/query';
import { GET as getEntities } from '../core/api/v1/entities/route';
import { GET as getEntity } from '../core/api/v1/entities/[key]/route';
import { GET as listRecordsApi, POST as createRecordApi } from '../core/api/v1/entities/[key]/records/route';
import { GET as getRecordApi, PATCH as patchRecordApi, DELETE as deleteRecordApi } from '../core/api/v1/entities/[key]/records/[id]/route';
import { GET as getOpenApi } from '../core/api/v1/openapi.json/route';

let failures = 0;
let total = 0;

function check(name: string, ok: boolean, detail = ''): void {
  total++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) {
    failures++;
    console.log(`::error title=api-smoke FAIL::${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function tokenError(fn: () => Promise<unknown>): Promise<ApiTokenError | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof ApiTokenError ? e : new ApiTokenError(`НЕ ApiTokenError: ${(e as Error).message}`);
  }
}

const BASE = 'http://localhost/api/v1';

function req(path: string, token: string | null, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): NextRequest {
  const headers: Record<string, string> = { ...(init.headers ?? {}) };
  if (token) headers.authorization = `Bearer ${token}`;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  return new NextRequest(`${BASE}${path}`, {
    method: init.method ?? 'GET',
    headers,
    ...(init.body !== undefined ? { body: typeof init.body === 'string' ? init.body : JSON.stringify(init.body) } : {}),
  });
}

async function json(res: Response): Promise<any> {
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function main(): Promise<void> {
  const program = await basePrisma.program.create({ data: { id: newId(), slug: `api-${newId()}`, name: 'Api smoke' } });
  const P = program.id;
  const mkUser = (name: string) => basePrisma.user.create({ data: { id: newId(), programId: P, email: `${newId()}@example.test`, name, passwordHash: 'x' } });
  const [uAdmin, uLimited, uMany] = await Promise.all(['Админ', 'Ограниченный', 'Много токенов'].map(mkUser));
  const roleAdmin = await basePrisma.role.create({ data: { id: newId(), programId: P, key: 'a', name: 'Админ', permissions: ['api.manage', 'entities.manage'] } });
  const roleLimited = await basePrisma.role.create({ data: { id: newId(), programId: P, key: 'l', name: 'Читатель', permissions: ['api.manage'] } });
  await basePrisma.userRole.createMany({ data: [{ userId: uAdmin.id, roleId: roleAdmin.id }, { userId: uLimited.id, roleId: roleLimited.id }] });
  const adminViewer = { id: uAdmin.id, programId: P, permissions: ['entities.manage'] };

  // — Данные —
  const tpl = await createTemplate(P, { name: 'Товар', namePlural: 'Товары' });
  await addField(P, tpl.key, { label: 'Title', type: 'text', required: true });
  await addField(P, tpl.key, { label: 'Price', type: 'number', required: false });
  await addField(P, tpl.key, { label: 'Kind', type: 'select', required: false, options: { choices: ['еда', 'книги', 'техника'] } });
  await addField(P, tpl.key, { label: 'Secret', type: 'text', required: false });
  const t = (await getTemplateFor(P, tpl.key))!;
  const rows = [
    { title: 'Яблоки', price: 100, kind: 'еда', secret: 's1' },
    { title: 'Груши', price: 250, kind: 'еда', secret: 's2' },
    { title: 'Роман', price: 400, kind: 'книги', secret: 's3' },
    { title: 'Атлас', price: 1200, kind: 'книги', secret: 's4' },
    { title: 'Ноутбук', price: 90000, kind: 'техника', secret: 's5' },
    { title: 'Кабель', kind: 'техника', secret: 's6' },
    { title: 'Яблочный сок', price: 150, kind: 'еда', secret: 's7' },
  ];
  for (const r of rows) await createRecord(P, tpl.key, r, adminViewer);
  // Ограниченному выдан только просмотр, поле Secret скрыто
  await setRoleEntityAccess(P, adminViewer, roleLimited.id, [{ templateId: t.id, canRead: true, hiddenFields: ['secret'] }]);

  // — Службы токенов —
  const { token: adminToken, info: adminInfo } = await createApiToken(P, uAdmin.id, { name: 'Админский', expiresInDays: 30 });
  check('токен начинается с rvl_, префикс — его первые знаки', adminToken.startsWith('rvl_') && adminToken.length > 30 && adminInfo.prefix === adminToken.slice(0, 10));
  const stored = await basePrisma.apiToken.findUnique({ where: { id: adminInfo.id } });
  check('в базе только хеш: самого токена там нет', stored!.tokenHash !== adminToken && !JSON.stringify(stored).includes(adminToken) && stored!.tokenHash.length === 64);
  check('срок действия выставлен', Boolean(adminInfo.expiresAt) && new Date(adminInfo.expiresAt!).getTime() > Date.now() + 29 * 86400_000);
  const listed = await listApiTokens(P);
  check('список токенов не содержит ни токена, ни хеша', listed.length === 1 && !JSON.stringify(listed).includes('tokenHash') && !JSON.stringify(listed).includes(adminToken));
  check('слишком короткое название отклонено', (await tokenError(() => createApiToken(P, uAdmin.id, { name: 'а' })))?.message.includes('не короче') === true);
  check('слишком длинное название отклонено', (await tokenError(() => createApiToken(P, uAdmin.id, { name: 'я'.repeat(61) })))?.message.includes('не длиннее') === true);
  for (const bad of [0, 1.5, 4000, 'abc']) {
    if ((await tokenError(() => createApiToken(P, uAdmin.id, { name: 'Срок', expiresInDays: bad })))?.message.includes('Срок') !== true) check(`срок ${String(bad)} отклонён`, false);
  }
  check('неверные сроки (0, 1.5, 4000, abc) отклонены', true);
  check('токен несуществующему сотруднику не выпускается', (await tokenError(() => createApiToken(P, 'нет-такого', { name: 'Тест' })))?.status === 404);

  const auth = await authenticateApiToken(adminToken);
  check('действующий токен даёт сотрудника и его права', auth?.user.id === uAdmin.id && auth.user.permissions.includes('entities.manage') && auth.readOnly === false);
  check('чужой префикс и выдуманный токен не проходят', (await authenticateApiToken('abc')) === null && (await authenticateApiToken('rvl_нет-такого-токена')) === null);

  // отзыв, срок, отключённый сотрудник
  const t2 = await createApiToken(P, uAdmin.id, { name: 'На отзыв' });
  check('токен до отзыва работает', (await authenticateApiToken(t2.token)) !== null);
  await revokeApiToken(P, t2.info.id);
  check('отозванный токен перестаёт работать сразу (в этом процессе)', (await authenticateApiToken(t2.token)) === null);
  check('повторный отзыв — 409, отзыв несуществующего — 404', (await tokenError(() => revokeApiToken(P, t2.info.id)))?.status === 409 && (await tokenError(() => revokeApiToken(P, 'нет')))?.status === 404);
  const t3 = await createApiToken(P, uAdmin.id, { name: 'Просроченный', expiresInDays: 1 });
  await basePrisma.apiToken.update({ where: { id: t3.info.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  resetApiTokenCache();
  check('просроченный токен не работает', (await authenticateApiToken(t3.token)) === null);
  const t4 = await createApiToken(P, uMany.id, { name: 'Временный' });
  await basePrisma.user.update({ where: { id: uMany.id }, data: { isActive: false } });
  resetApiTokenCache();
  check('токен отключённого сотрудника не работает', (await authenticateApiToken(t4.token)) === null);
  check('нельзя выпустить токен отключённому сотруднику', (await tokenError(() => createApiToken(P, uMany.id, { name: 'Ещё' })))?.status === 404);
  await basePrisma.user.update({ where: { id: uMany.id }, data: { isActive: true } });
  let made = 0;
  for (let i = 0; i < 20; i++) {
    if ((await tokenError(() => createApiToken(P, uMany.id, { name: `Токен ${i}` }))) === null) made++;
  }
  check('на сотрудника не больше 20 действующих токенов', made >= 19 && (await tokenError(() => createApiToken(P, uMany.id, { name: 'Лишний' })))?.status === 409, `выпущено ${made}`);

  // ограничение частоты
  process.env.API_RATE_LIMIT_PER_MIN = '3';
  resetApiTokenCache();
  const now = Date.now();
  const seq = [1, 2, 3, 4].map(() => checkRateLimit('rate-token', now));
  check('ограничение частоты: три запроса проходят, четвёртый — нет', seq[0].ok && seq[1].ok && seq[2].ok && !seq[3].ok && seq[3].retryAfterSeconds >= 1 && seq[2].remaining === 0);
  check('ограничение частоты: через минуту счётчик сбрасывается', checkRateLimit('rate-token', now + 61_000).ok);
  process.env.API_RATE_LIMIT_PER_MIN = '1000';
  resetApiTokenCache();

  // — Вход по токену на уровне запросов —
  const noAuth = await getEntities(req('/entities', null));
  const noAuthBody = await json(noAuth);
  check('без заголовка — 401 unauthorized и WWW-Authenticate', noAuth.status === 401 && noAuthBody.error.code === 'unauthorized' && noAuth.headers.get('www-authenticate') === 'Bearer');
  const badAuth = await getEntities(req('/entities', 'rvl_wrong-token'));
  check('неверный токен — 401 invalid_token', badAuth.status === 401 && (await json(badAuth)).error.code === 'invalid_token');
  const cookieOnly = await getEntities(req('/entities', null, { headers: { cookie: 'session=что-угодно' } }));
  check('cookie сессии по этому адресу не принимается', cookieOnly.status === 401);

  // — Сущности —
  const ents = await json(await getEntities(req('/entities', adminToken)));
  check('список сущностей с полями и типами', ents.data.length === 1 && ents.data[0].key === tpl.key && ents.data[0].fields.map((f: { key: string }) => f.key).join() === 'title,price,kind,secret' && ents.data[0].permissions === undefined);
  const one = await getEntity(req(`/entities/${tpl.key}`, adminToken), { params: { key: tpl.key } });
  check('одна сущность по ключу; несуществующая — 404', one.status === 200 && (await getEntity(req('/entities/нет', adminToken), { params: { key: 'нет' } })).status === 404);

  // — Ограниченный сотрудник —
  const lim = await createApiToken(P, uLimited.id, { name: 'Ограниченный' });
  const limEnts = await json(await getEntities(req('/entities', lim.token)));
  check('у ограниченного нет скрытого поля, права видны', limEnts.data[0].fields.every((f: { key: string }) => f.key !== 'secret') && limEnts.data[0].permissions.create === false);
  const limList = await json(await listRecordsApi(req(`/entities/${tpl.key}/records?pageSize=100`, lim.token), { params: { key: tpl.key } }));
  check('у ограниченного записи без скрытого поля', limList.meta.total === 7 && limList.data.every((r: { data: Record<string, unknown> }) => !('secret' in r.data)));
  const limPost = await createRecordApi(req(`/entities/${tpl.key}/records`, lim.token, { method: 'POST', body: { data: { title: 'Взлом' } } }), { params: { key: tpl.key } });
  check('ограниченному запись создавать нельзя — 403 forbidden', limPost.status === 403 && (await json(limPost)).error.code === 'forbidden');
  const limFilter = await listRecordsApi(req(`/entities/${tpl.key}/records?filter[secret]=s1`, lim.token), { params: { key: tpl.key } });
  check('по скрытому полю фильтровать нельзя — 400', limFilter.status === 400);
  check('поиск не находит по значению скрытого поля', (await json(await listRecordsApi(req(`/entities/${tpl.key}/records?q=s3`, lim.token), { params: { key: tpl.key } }))).meta.total === 0);

  // — Список: язык запросов —
  const list = (qs: string, token = adminToken) => listRecordsApi(req(`/entities/${tpl.key}/records${qs}`, token), { params: { key: tpl.key } });
  const titles = async (qs: string) => (await json(await list(qs))).data.map((r: { data: { title: string } }) => r.data.title);
  const def = await json(await list(''));
  check('по умолчанию: страница 1 по 25, метаданные', def.meta.total === 7 && def.meta.page === 1 && def.meta.pageSize === 25 && def.data.length === 7 && def.data[0].id && def.data[0].createdAt);
  const p3 = await json(await list('?pageSize=3&page=3'));
  check('страницы: третья по три — одна запись, всего три страницы', p3.data.length === 1 && p3.meta.pages === 3);
  check('сортировка по убыванию цены, пустые в конце', (await titles('?sort=-price&pageSize=100')).join() === 'Ноутбук,Атлас,Роман,Груши,Яблочный сок,Яблоки,Кабель');
  check('фильтр gte', (await titles('?filter[price][gte]=250&sort=price')).join() === 'Груши,Роман,Атлас,Ноутбук');
  check('фильтр без операции — «равно»', (await titles('?filter[kind]=книги&sort=title')).join() === 'Атлас,Роман');
  check('фильтр in', (await json(await list('?filter[kind][in]=еда,книги'))).meta.total === 5);
  check('фильтр empty', (await titles('?filter[price][empty]=true')).join() === 'Кабель');
  check('условия складываются через «и»', (await titles('?filter[kind]=еда&filter[price][lt]=200&sort=price')).join() === 'Яблоки,Яблочный сок');
  check('поиск', (await titles('?q=ябл&sort=title')).join() === 'Яблоки,Яблочный сок');
  check('неизвестное поле в фильтре — 400 validation_error', (await list('?filter[нет]=1')).status === 400 && (await json(await list('?filter[нет]=1'))).error.code === 'validation_error');
  const badOp = await list('?filter[price][around]=5');
  check('неизвестная операция — 400 bad_query', badOp.status === 400 && (await json(badOp)).error.code === 'bad_query');
  check('неверные page и pageSize — 400', (await list('?page=0')).status === 400 && (await list('?pageSize=500')).status === 400 && (await list('?page=abc')).status === 400);
  check('неверный синтаксис фильтра — 400', (await list('?filter=1')).status === 400);
  check('сортировка по неизвестному полю — 400', (await list('?sort=нет')).status === 400);
  check('разбор запроса: одно поле сортировки', typeof parseApiQuery(new URLSearchParams('sort=a,b')) === 'string');
  check('сущность не найдена в списке — 404', (await listRecordsApi(req('/entities/нет/records', adminToken), { params: { key: 'нет' } })).status === 404);

  // — Создание, чтение, изменение, удаление —
  const created = await createRecordApi(req(`/entities/${tpl.key}/records`, adminToken, { method: 'POST', body: { data: { title: 'Новый', price: 10, kind: 'еда' } } }), { params: { key: tpl.key } });
  const createdBody = await json(created);
  const id = createdBody.data.id as string;
  check('создание: 201, Location, запись в data', created.status === 201 && created.headers.get('location') === `/api/v1/entities/${tpl.key}/records/${id}` && createdBody.data.data.title === 'Новый');
  const rec = (token = adminToken, rid = id) => ({ req: (m = 'GET', body?: unknown) => req(`/entities/${tpl.key}/records/${rid}`, token, { method: m, body }), params: { params: { key: tpl.key, id: rid } } });
  const got = await getRecordApi(rec().req(), rec().params);
  check('чтение записи по id', got.status === 200 && (await json(got)).data.data.price === 10);
  const patched = await patchRecordApi(rec().req('PATCH', { data: { price: 20 } }), rec().params);
  const patchedBody = await json(patched);
  check('изменение: меняется только переданное поле', patched.status === 200 && patchedBody.data.data.price === 20 && patchedBody.data.data.title === 'Новый' && patchedBody.data.data.kind === 'еда');
  const cleared = await json(await patchRecordApi(rec().req('PATCH', { data: { price: null } }), rec().params));
  check('null очищает поле, остальное остаётся', cleared.data.data.price === undefined && cleared.data.data.title === 'Новый');
  const invalid = await patchRecordApi(rec().req('PATCH', { data: { price: 'abc' } }), rec().params);
  check('неверное значение — 400 validation_error', invalid.status === 400 && (await json(invalid)).error.code === 'validation_error');
  check('после неудачной правки запись не изменилась', (await json(await getRecordApi(rec().req(), rec().params))).data.data.title === 'Новый');
  check('создание без обязательного поля — 400', (await createRecordApi(req(`/entities/${tpl.key}/records`, adminToken, { method: 'POST', body: { data: { price: 1 } } }), { params: { key: tpl.key } })).status === 400);
  check('тело без data — 400 bad_body', (await createRecordApi(req(`/entities/${tpl.key}/records`, adminToken, { method: 'POST', body: { title: 'x' } }), { params: { key: tpl.key } })).status === 400 && (await patchRecordApi(rec().req('PATCH', 'не json'), rec().params)).status === 400);
  check('несуществующая запись — 404 not_found', (await getRecordApi(rec(adminToken, 'нет').req(), rec(adminToken, 'нет').params)).status === 404 && (await patchRecordApi(rec(adminToken, 'нет').req('PATCH', { data: { price: 1 } }), rec(adminToken, 'нет').params)).status === 404 && (await deleteRecordApi(rec(adminToken, 'нет').req('DELETE'), rec(adminToken, 'нет').params)).status === 404);
  const del = await deleteRecordApi(rec().req('DELETE'), rec().params);
  check('удаление: 204 без тела', del.status === 204 && (await del.text()) === '');
  check('после удаления запись не найдена, повторное удаление — 404', (await getRecordApi(rec().req(), rec().params)).status === 404 && (await deleteRecordApi(rec().req('DELETE'), rec().params)).status === 404);
  const audit = await basePrisma.auditLog.findFirst({ where: { programId: P, action: 'entity_record.deleted', targetId: id } });
  check('удаление через API попало в журнал с отметкой «через API»', (audit?.details as { via?: string } | null)?.via === 'api');

  // — Токен «только чтение» —
  const ro = await createApiToken(P, uAdmin.id, { name: 'Только чтение', readOnly: true });
  check('токен только для чтения читает', (await list('?pageSize=1', ro.token)).status === 200);
  const roPost = await createRecordApi(req(`/entities/${tpl.key}/records`, ro.token, { method: 'POST', body: { data: { title: 'x' } } }), { params: { key: tpl.key } });
  const keep = (await json(await list('?pageSize=1'))).data[0].id as string;
  const roDelete = await deleteRecordApi(req(`/entities/${tpl.key}/records/${keep}`, ro.token, { method: 'DELETE' }), { params: { key: tpl.key, id: keep } });
  check('токен только для чтения не создаёт и не удаляет — 403 read_only_token', roPost.status === 403 && (await json(roPost)).error.code === 'read_only_token' && roDelete.status === 403);

  // — Ограничение частоты в запросах —
  process.env.API_RATE_LIMIT_PER_MIN = '3';
  resetApiTokenCache();
  const spam = await createApiToken(P, uAdmin.id, { name: 'Частый' });
  const answers: Response[] = [];
  for (let i = 0; i < 4; i++) answers.push(await getEntities(req('/entities', spam.token)));
  check('четвёртый запрос за минуту — 429 с Retry-After', answers[2].status === 200 && answers[3].status === 429 && Number(answers[3].headers.get('retry-after')) >= 1 && (await json(answers[3])).error.code === 'rate_limited');
  check('в ответах видны остаток и лимит', answers[0].headers.get('x-ratelimit-limit') === '3' && answers[0].headers.get('x-ratelimit-remaining') === '2');
  process.env.API_RATE_LIMIT_PER_MIN = '1000';
  resetApiTokenCache();

  // — Описание OpenAPI —
  const spec = await json(await getOpenApi(req('/openapi.json', adminToken)));
  const recPath = spec.paths[`/entities/${tpl.key}/records`];
  const itemPath = spec.paths[`/entities/${tpl.key}/records/{id}`];
  check('OpenAPI: версия, адрес, схема доступа', spec.openapi === '3.0.3' && spec.servers[0].url === 'http://localhost/api/v1' && spec.components.securitySchemes.bearerAuth.scheme === 'bearer');
  check('OpenAPI: пути записей и все методы у владельца полных прав', Boolean(recPath.get && recPath.post && itemPath.get && itemPath.patch && itemPath.delete));
  const dataSchema = spec.components.schemas.TovarData;
  check('OpenAPI: схема данных с типами, перечислением и обязательными полями', dataSchema.properties.price.type === 'number' && dataSchema.properties.kind.enum.join() === 'еда,книги,техника' && dataSchema.required.join() === 'title' && 'secret' in dataSchema.properties);
  const limSpec = await json(await getOpenApi(req('/openapi.json', lim.token)));
  check('OpenAPI для ограниченного: нет скрытого поля, нет методов записи', !('secret' in limSpec.components.schemas.TovarData.properties) && !limSpec.paths[`/entities/${tpl.key}/records`].post && !limSpec.paths[`/entities/${tpl.key}/records/{id}`].patch && !limSpec.paths[`/entities/${tpl.key}/records/{id}`].delete && Boolean(limSpec.paths[`/entities/${tpl.key}/records`].get));
  check('OpenAPI: сборка из пустого набора сущностей', Object.keys(buildOpenApi([], 'http://x').paths as object).join() === '/entities');

  // Уборка
  await basePrisma.program.delete({ where: { id: P } });

  console.log(failures === 0 ? '\nВсе проверки API пройдены' : `\nПРОВАЛЕНО проверок: ${failures}`);
  console.log(`::notice title=api-smoke итог::проверок ${total}, провалено ${failures}`);
  await basePrisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  const stack = e instanceof Error ? (e.stack ?? '').split(/\r?\n/).slice(1, 4).join(' ; ') : '';
  const text = e instanceof Error ? `${e.message} | ${stack}` : String(e);
  console.log(`::error title=api-smoke crash::${text.replace(/[\r\n]+/g, ' ')}`);
  await basePrisma.$disconnect();
  process.exit(1);
});
