/**
 * Смоук-проверка ролей (строка 4 таблицы покрытия): правила названий и прав, запрет «выдать больше,
 * чем есть у самого», копирование, удаление, назначение сотрудникам. Режим direct, настоящая база:
 *   DATA_MODE=direct DATABASE_URL=... npx tsx tools/roles-smoke.ts
 */
process.env.DATA_MODE = 'direct';
delete process.env.BUS_URL;

import { basePrisma } from '../core/data/prisma';
import { newId } from '../core/data/ids';
import {
  RoleError,
  assertCanAssignRoles,
  createRole,
  deleteRole,
  duplicateRole,
  listRoleUsers,
  listRoles,
  normalizePermissions,
  updateRole,
} from '../core/roles/service';

let failures = 0;
const total = { n: 0 };

function check(name: string, ok: boolean, detail = ''): void {
  total.n++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) {
    failures++;
    console.log(`::error title=roles-smoke FAIL::${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Текст ошибки RoleError (и статус) или null, если операция прошла */
async function failsWith(fn: () => Promise<unknown>): Promise<{ message: string; status: number } | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof RoleError ? { message: e.message, status: e.status } : { message: `НЕ RoleError: ${(e as Error).message}`, status: 0 };
  }
}

async function main(): Promise<void> {
  const program = await basePrisma.program.create({ data: { id: newId(), slug: `roles-${newId()}`, name: 'Roles smoke' } });
  const P = program.id;
  const adminRole = await basePrisma.role.create({
    data: { id: newId(), programId: P, key: 'admin', name: 'Администратор', permissions: ['*'], isSystem: true },
  });
  const boss = { permissions: ['*'] };
  const lead = { permissions: ['roles.view', 'roles.manage', 'users.view', 'users.manage', 'entities.manage'] };

  // — Нормализация прав —
  check('права приводятся к порядку реестра, без повторов', normalizePermissions(['entities.manage', 'users.view', 'users.view']).join() === 'users.view,entities.manage');
  check('«управлять» тянет за собой «смотреть»', normalizePermissions(['roles.manage']).join() === 'roles.view,roles.manage');
  check('право без «управлять» ничего не добавляет', normalizePermissions(['audit.view']).join() === 'audit.view');
  const unknownErr = (() => { try { normalizePermissions(['nope.manage']); return ''; } catch (e) { return (e as Error).message; } })();
  check('неизвестное право — ошибка, а не тихое отбрасывание', unknownErr.includes('Неизвестное право'));
  const starErr = (() => { try { normalizePermissions(['*']); return ''; } catch (e) { return (e as Error).message; } })();
  check('полный доступ нельзя дать обычной роли', starErr.includes('системной роли администратора'));
  const notArray = (() => { try { normalizePermissions('users.view'); return ''; } catch (e) { return (e as Error).message; } })();
  check('права не списком — ошибка', notArray.includes('списком'));

  // — Создание —
  const sales = await createRole(P, boss, { name: '  Менеджер   по продажам ', description: 'Работает с клиентами', permissions: ['entities.manage'] });
  check('роль создаётся, пробелы в названии схлопываются', sales.name === 'Менеджер по продажам' && sales.permissions.join() === 'entities.manage' && sales.userCount === 0);
  check('слишком короткое название отклонено', (await failsWith(() => createRole(P, boss, { name: 'А' })))?.message.includes('не короче') === true);
  check('слишком длинное название отклонено', (await failsWith(() => createRole(P, boss, { name: 'я'.repeat(61) })))?.message.includes('не длиннее') === true);
  check('слишком длинное описание отклонено', (await failsWith(() => createRole(P, boss, { name: 'Длинное', description: 'я'.repeat(301) })))?.message.includes('Описание') === true);
  const dup = await failsWith(() => createRole(P, boss, { name: 'менеджер по ПРОДАЖАМ' }));
  check('повтор названия (в другом регистре) отклонён статусом 409', dup?.status === 409 && dup.message.includes('уже есть'));
  const sameKey = await createRole(P, boss, { name: 'Менеджер по продажам!' });
  check('разные названия с одинаковым ключом получают разные ключи', sameKey.key !== sales.key);

  // — «Нельзя выдать больше, чем есть у самого» —
  const esc = await failsWith(() => createRole(P, lead, { name: 'Настройщик', permissions: ['settings.manage'] }));
  check('нельзя создать роль с правом, которого нет у создающего', esc?.status === 409 && esc.message.includes('Нельзя выдать'));
  const okLead = await createRole(P, lead, { name: 'Помощник', permissions: ['entities.manage', 'users.view'] });
  check('права, которые есть у создающего, выдать можно', okLead.permissions.includes('entities.manage'));
  const escManage = await failsWith(() => createRole(P, { permissions: ['roles.view', 'roles.manage'] }, { name: 'Кадровик', permissions: ['users.manage'] }));
  check('проверяется и право, подтянутое автоматически (users.view)', escManage?.status === 409);

  // — Правка —
  const rn = await updateRole(P, boss, sales.id, { name: 'Старший менеджер' });
  check('роль переименовывается', rn.name === 'Старший менеджер' && rn.permissions.join() === 'entities.manage');
  check('переименование в занятое название отклонено', (await failsWith(() => updateRole(P, boss, sales.id, { name: 'помощник' })))?.status === 409);
  check('переименование в своё же название (регистр) проходит', (await failsWith(() => updateRole(P, boss, sales.id, { name: 'старший менеджер' }))) === null);
  const keepOwn = await updateRole(P, lead, okLead.id, { permissions: ['entities.manage', 'users.view', 'users.manage'] });
  check('права, которые есть у правящего, добавить можно', keepOwn.permissions.includes('users.manage'));
  const lowActor = { permissions: ['roles.view', 'roles.manage', 'entities.manage'] };
  const keepHeld = await failsWith(() => updateRole(P, lowActor, okLead.id, { permissions: ['entities.manage', 'users.view', 'users.manage', 'audit.view'] }));
  check('добавить право, которого нет у правящего, нельзя', keepHeld?.status === 409 && keepHeld.message.includes('Просмотр журнала'));
  const keepOnly = await failsWith(() => updateRole(P, lowActor, okLead.id, { permissions: ['entities.manage', 'users.view', 'users.manage'] }));
  check('оставить уже выданные права можно и без них самому', keepOnly === null);
  check('системной роли права менять нельзя', (await failsWith(() => updateRole(P, boss, adminRole.id, { permissions: ['users.view'] })))?.status === 409);
  const renameSys = await updateRole(P, boss, adminRole.id, { description: 'Полный доступ' });
  check('у системной роли можно менять описание', renameSys.description === 'Полный доступ' && renameSys.permissions.includes('*'));
  check('правка несуществующей роли — 404', (await failsWith(() => updateRole(P, boss, 'нет-такой', { name: 'Тест' })))?.status === 404);
  check('роль другой программы недоступна', (await failsWith(() => updateRole('чужая-программа', boss, sales.id, { name: 'Тест' })))?.status === 404);

  // — Копирование —
  const copy1 = await duplicateRole(P, boss, sales.id);
  const copy2 = await duplicateRole(P, boss, sales.id);
  check('копия получает название «Копия: …», вторая копия — с номером', copy1.name === 'Копия: Старший менеджер' && copy2.name === 'Копия: Старший менеджер 2');
  check('копия повторяет права и описание, не повторяя сотрудников', copy1.permissions.join() === sales.permissions.join() && copy1.userCount === 0);
  check('роль с полным доступом копировать нельзя', (await failsWith(() => duplicateRole(P, boss, adminRole.id)))?.status === 409);
  check('копировать нельзя то, что у копирующего отсутствует', (await failsWith(() => duplicateRole(P, { permissions: ['roles.manage'] }, sales.id)))?.status === 409);

  // — Сотрудники роли и назначение —
  const u1 = await basePrisma.user.create({ data: { id: newId(), programId: P, email: `${newId()}@example.test`, name: 'Борис', passwordHash: 'x' } });
  const u2 = await basePrisma.user.create({ data: { id: newId(), programId: P, email: `${newId()}@example.test`, name: 'Аня', passwordHash: 'x', isActive: false } });
  await basePrisma.userRole.createMany({ data: [{ userId: u1.id, roleId: sales.id }, { userId: u2.id, roleId: sales.id }] });
  const users = await listRoleUsers(P, sales.id);
  check('список сотрудников роли отсортирован по имени и показывает отключённых', users.map((u) => u.name).join() === 'Аня,Борис' && users[0].isActive === false);
  check('число сотрудников в списке ролей', (await listRoles(P)).find((r) => r.id === sales.id)?.userCount === 2);
  check('системные роли идут первыми', (await listRoles(P))[0].isSystem === true);

  check('нельзя назначить роль с правами сверх своих', (await failsWith(() => assertCanAssignRoles(P, { permissions: ['users.manage'] }, [sales.id])))?.status === 409);
  check('роль, уже имевшаяся у сотрудника, не проверяется', (await failsWith(() => assertCanAssignRoles(P, { permissions: ['users.manage'] }, [sales.id], [sales.id]))) === null);
  check('роль с правами в пределах своих назначить можно', (await failsWith(() => assertCanAssignRoles(P, lead, [sales.id]))) === null);
  check('роль администратора может выдать только администратор', (await failsWith(() => assertCanAssignRoles(P, lead, [adminRole.id])))?.status === 409 && (await failsWith(() => assertCanAssignRoles(P, boss, [adminRole.id]))) === null);

  // — Удаление —
  check('роль с сотрудниками удалить нельзя', (await failsWith(() => deleteRole(P, sales.id)))?.message.includes('Сначала снимите') === true);
  check('системную роль удалить нельзя', (await failsWith(() => deleteRole(P, adminRole.id)))?.status === 409);
  const gone = await deleteRole(P, copy1.id);
  check('свободная роль удаляется', gone.name === copy1.name && !(await listRoles(P)).some((r) => r.id === copy1.id));
  check('повторное удаление — 404', (await failsWith(() => deleteRole(P, copy1.id)))?.status === 404);

  // Уборка
  await basePrisma.program.delete({ where: { id: P } });

  console.log(failures === 0 ? '\nВсе проверки ролей пройдены' : `\nПРОВАЛЕНО проверок: ${failures}`);
  console.log(`::notice title=roles-smoke итог::проверок ${total.n}, провалено ${failures}`);
  await basePrisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  const stack = e instanceof Error ? (e.stack ?? '').split(/\r?\n/).slice(1, 4).join(' ; ') : '';
  const text = e instanceof Error ? `${e.message} | ${stack}` : String(e);
  console.log(`::error title=roles-smoke crash::${text.replace(/[\r\n]+/g, ' ')}`);
  await basePrisma.$disconnect();
  process.exit(1);
});
