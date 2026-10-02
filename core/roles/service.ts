/**
 * Роли — серверная часть (строка 4 таблицы покрытия). Правила держатся здесь, а не в обработчиках
 * запросов, чтобы их можно было проверить без сервера и чтобы все пути (экран ролей, экран
 * сотрудников, начальная настройка) соблюдали одни и те же ограничения.
 *
 * Главное правило безопасности: нельзя выдать то, чего нет у самого выдающего. Иначе сотрудник
 * с правом «управлять ролями» или «управлять сотрудниками» мог бы поднять себе доступ до полного.
 */
import { prisma } from '../data/prisma';
import { newId } from '../data/ids';
import { allPermissions } from '../auth/permissions';

export class RoleError extends Error {
  constructor(message: string, public status: 400 | 404 | 409 = 400) {
    super(message);
  }
}

/** Права того, кто выдаёт: нужны для проверки «нельзя выдать больше, чем есть у самого» */
export interface Actor {
  permissions: string[];
}

export interface RoleInput {
  name?: string;
  description?: string | null;
  permissions?: unknown;
}

export interface RoleRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  permissions: string[];
  isSystem: boolean;
  userCount: number;
}

const NAME_MIN = 2;
const NAME_MAX = 60;
const DESCRIPTION_MAX = 300;

function holds(actor: Actor, permission: string): boolean {
  return actor.permissions.includes('*') || actor.permissions.includes(permission);
}

function permissionLabel(key: string): string {
  return allPermissions().find((p) => p.key === key)?.label ?? key;
}

/**
 * Приводит список прав к хранимому виду: только известные права, без повторов, в порядке реестра;
 * «управлять» тянет за собой «смотреть», если такое право есть. Неизвестное право — ошибка,
 * а не тихое отбрасывание: иначе опечатка в запросе выглядела бы как успех.
 */
export function normalizePermissions(input: unknown): string[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input) || input.some((p) => typeof p !== 'string')) {
    throw new RoleError('Права должны быть списком строк');
  }
  const known = allPermissions().map((p) => p.key);
  const wanted = new Set<string>(input as string[]);
  for (const key of wanted) {
    if (key === '*') throw new RoleError('Полный доступ есть только у системной роли администратора');
    if (!known.includes(key)) throw new RoleError(`Неизвестное право: ${key}`);
  }
  for (const key of [...wanted]) {
    if (key.endsWith('.manage')) {
      const view = `${key.slice(0, -'.manage'.length)}.view`;
      if (known.includes(view)) wanted.add(view);
    }
  }
  return known.filter((k) => wanted.has(k));
}

/** Из добавляемых прав актору можно выдать только те, что есть у него самого */
export function assertCanGrant(actor: Actor, added: string[]): void {
  const missing = added.filter((p) => !holds(actor, p));
  if (missing.length > 0) {
    throw new RoleError(
      `Нельзя выдать права, которых нет у вас: ${missing.map(permissionLabel).join(', ')}`,
      409
    );
  }
}

function cleanName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  if (name.length < NAME_MIN) throw new RoleError(`Название роли — не короче ${NAME_MIN} знаков`);
  if (name.length > NAME_MAX) throw new RoleError(`Название роли — не длиннее ${NAME_MAX} знаков`);
  return name;
}

function cleanDescription(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') throw new RoleError('Описание должно быть текстом');
  const text = raw.trim();
  if (text.length > DESCRIPTION_MAX) throw new RoleError(`Описание — не длиннее ${DESCRIPTION_MAX} знаков`);
  return text || null;
}

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-zа-я0-9]+/gi, '-')
      .replace(/(^-|-$)/g, '') || `role-${Date.now()}`
  );
}

async function assertNameFree(programId: string, name: string, exceptId?: string): Promise<void> {
  const roles = await prisma.role.findMany({ where: { programId }, select: { id: true, name: true } });
  if (roles.some((r) => r.id !== exceptId && r.name.trim().toLowerCase() === name.toLowerCase())) {
    throw new RoleError('Роль с таким названием уже есть', 409);
  }
}

function toRow(r: {
  id: string; key: string; name: string; description: string | null; permissions: string[]; isSystem: boolean;
  _count: { users: number };
}): RoleRow {
  return { id: r.id, key: r.key, name: r.name, description: r.description, permissions: r.permissions, isSystem: r.isSystem, userCount: r._count.users };
}

export async function listRoles(programId: string): Promise<RoleRow[]> {
  const roles = await prisma.role.findMany({
    where: { programId },
    orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    include: { _count: { select: { users: true } } },
  });
  return roles.map(toRow);
}

async function getRole(programId: string, id: string) {
  const role = await prisma.role.findFirst({ where: { id, programId }, include: { _count: { select: { users: true } } } });
  if (!role) throw new RoleError('Роль не найдена', 404);
  return role;
}

export async function createRole(programId: string, actor: Actor, input: RoleInput): Promise<RoleRow> {
  const name = cleanName(input.name);
  const description = cleanDescription(input.description);
  const permissions = normalizePermissions(input.permissions);
  assertCanGrant(actor, permissions);
  await assertNameFree(programId, name);

  let key = slug(name);
  if (await prisma.role.findUnique({ where: { programId_key: { programId, key } } })) key = `${key}-${newId().slice(-5)}`;

  const role = await prisma.role.create({
    data: { id: newId(), programId, key, name, description, permissions },
    include: { _count: { select: { users: true } } },
  });
  return toRow(role);
}

export async function updateRole(programId: string, actor: Actor, id: string, input: RoleInput): Promise<RoleRow> {
  const role = await getRole(programId, id);
  const data: { name?: string; description?: string | null; permissions?: string[] } = {};

  if (input.name !== undefined) {
    data.name = cleanName(input.name);
    await assertNameFree(programId, data.name, role.id);
  }
  if (input.description !== undefined) data.description = cleanDescription(input.description);

  if (input.permissions !== undefined) {
    // У системной роли администратора права менять нельзя — иначе можно закрыть себе доступ
    if (role.isSystem) throw new RoleError('Права системной роли изменить нельзя', 409);
    const next = normalizePermissions(input.permissions);
    // Проверяются только добавляемые права: оставить уже выданное можно и без них
    assertCanGrant(actor, next.filter((p) => !role.permissions.includes(p)));
    data.permissions = next;
  }

  const updated = await prisma.role.update({ where: { id: role.id }, data, include: { _count: { select: { users: true } } } });
  return toRow(updated);
}

/** Копия роли: те же права, название «Копия: …» (уникальное) */
export async function duplicateRole(programId: string, actor: Actor, id: string): Promise<RoleRow> {
  const source = await getRole(programId, id);
  if (source.permissions.includes('*')) throw new RoleError('Роль с полным доступом копировать нельзя', 409);

  const base = `Копия: ${source.name}`.slice(0, NAME_MAX - 4);
  let name = base;
  for (let n = 2; ; n++) {
    try {
      await assertNameFree(programId, name);
      break;
    } catch (error) {
      if (!(error instanceof RoleError) || n > 50) throw error;
      name = `${base} ${n}`;
    }
  }
  return createRole(programId, actor, { name, description: source.description, permissions: source.permissions });
}

export async function deleteRole(programId: string, id: string): Promise<RoleRow> {
  const role = await getRole(programId, id);
  if (role.isSystem) throw new RoleError('Системную роль удалить нельзя', 409);
  if (role._count.users > 0) throw new RoleError('Сначала снимите эту роль со всех сотрудников', 409);
  await prisma.role.delete({ where: { id: role.id } });
  return toRow(role);
}

export interface RoleUser {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
}

export async function listRoleUsers(programId: string, id: string): Promise<RoleUser[]> {
  const role = await getRole(programId, id);
  const links = await prisma.userRole.findMany({
    where: { roleId: role.id },
    include: { user: { select: { id: true, name: true, email: true, isActive: true } } },
  });
  return links.map((l) => l.user).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

/**
 * Назначение ролей сотруднику: роль можно выдать, только если все её права есть у выдающего.
 * Роли, которые у сотрудника уже были, не проверяются — снять или оставить их можно всегда.
 */
export async function assertCanAssignRoles(
  programId: string,
  actor: Actor,
  roleIds: string[],
  alreadyHeld: string[] = []
): Promise<void> {
  const roles = await prisma.role.findMany({ where: { id: { in: roleIds }, programId } });
  for (const role of roles) {
    if (alreadyHeld.includes(role.id)) continue;
    if (role.permissions.includes('*')) {
      if (!actor.permissions.includes('*')) throw new RoleError(`Роль «${role.name}» с полным доступом может выдать только администратор`, 409);
      continue;
    }
    assertCanGrant(actor, role.permissions);
  }
}
