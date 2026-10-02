/**
 * Права на сущности (строка 5 таблицы покрытия). Доступ роли к сущности — строка EntityAccess:
 * что можно (читать, создавать, менять, удалять), чьи записи видны (все или только свои),
 * какие поля скрыты и какие только для чтения.
 *
 * Право entities.manage (настройка сущностей и все записи) и полный доступ эту проверку обходят —
 * для них resolveAccess возвращает null («без ограничений»). Остальные получают объединение прав
 * всех своих ролей: разрешено то, что разрешает хотя бы одна роль; поле скрыто (только для чтения)
 * лишь если оно скрыто (только для чтения) во всех ролях, которые вообще что-то разрешают.
 */
import { prisma } from '../data/prisma';
import type { EntityRecordDef, EntityTemplateDef } from './types';

export type EntityAction = 'read' | 'create' | 'update' | 'delete';

export class AccessError extends Error {}

export interface ViewerAccess {
  userId: string;
  read: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
  /** Видны и доступны для правки только записи, созданные самим сотрудником */
  own: boolean;
  hidden: string[];
  readonly: string[];
}

export interface ViewerUser {
  id: string;
  programId: string;
  permissions: string[];
}

export interface AccessRule {
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  rowScope: string;
  hiddenFields: string[];
  readonlyFields: string[];
}

export const ACTION_LABELS: Record<EntityAction, string> = {
  read: 'просмотр',
  create: 'создание',
  update: 'изменение',
  delete: 'удаление',
};

/** Без ограничений: право entities.manage или полный доступ */
export function hasFullAccess(user: Pick<ViewerUser, 'permissions'>): boolean {
  return user.permissions.includes('*') || user.permissions.includes('entities.manage');
}

function intersect(lists: string[][]): string[] {
  if (lists.length === 0) return [];
  return lists[0].filter((x) => lists.every((l) => l.includes(x)));
}

/** Объединение правил всех ролей сотрудника по одной сущности */
export function mergeRules(userId: string, rules: AccessRule[]): ViewerAccess {
  const granting = rules.filter((r) => r.canRead || r.canCreate || r.canUpdate || r.canDelete);
  const readers = rules.filter((r) => r.canRead);
  return {
    userId,
    read: readers.length > 0,
    create: rules.some((r) => r.canCreate),
    update: rules.some((r) => r.canUpdate),
    delete: rules.some((r) => r.canDelete),
    // «Все записи» побеждает «только свои»: достаточно одной роли, которая даёт чтение всех
    own: readers.length > 0 && !readers.some((r) => r.rowScope !== 'own'),
    hidden: intersect(granting.map((r) => r.hiddenFields)),
    readonly: intersect(granting.map((r) => r.readonlyFields)),
  };
}

/** Права сотрудника на сущность; null — без ограничений */
export async function resolveAccess(user: ViewerUser, templateId: string): Promise<ViewerAccess | null> {
  if (hasFullAccess(user)) return null;
  const rows = await prisma.entityAccess.findMany({
    where: { templateId, role: { users: { some: { userId: user.id } } } },
  });
  return mergeRules(user.id, rows);
}

export function assertAccess(access: ViewerAccess | null, action: EntityAction): void {
  if (access && !access[action]) throw new AccessError(`Нет права на ${ACTION_LABELS[action]} записей этой сущности`);
}

/** Запись принадлежит сотруднику (для правила «только свои») */
export function ownsRecord(access: ViewerAccess, record: { createdById?: string | null }): boolean {
  return record.createdById === access.userId;
}

export function assertCanTouchRecord(access: ViewerAccess | null, record: { createdById?: string | null }): void {
  if (access && access.own && !ownsRecord(access, record)) throw new AccessError('Эта запись создана другим сотрудником — доступ только к своим записям');
}

/** Запись для сотрудника: без скрытых полей */
export function sanitizeRecord<T extends EntityRecordDef>(record: T, access: ViewerAccess | null): T {
  if (!access || access.hidden.length === 0) return record;
  const data = { ...record.data };
  for (const key of access.hidden) delete data[key];
  return { ...record, data };
}

/** Структура сущности, как её видит сотрудник: без скрытых полей, чужие «только чтение» помечены */
export function viewTemplate(template: EntityTemplateDef, access: ViewerAccess | null): EntityTemplateDef {
  if (!access) return template;
  const hidden = new Set(access.hidden);
  const readonly = new Set(access.readonly);
  return {
    ...template,
    fields: template.fields.filter((f) => !hidden.has(f.key)).map((f) => (readonly.has(f.key) ? { ...f, readonly: true } : f)),
    displayField: template.displayField && hidden.has(template.displayField) ? null : template.displayField,
    access: { create: access.create, update: access.update, delete: access.delete, own: access.own },
  };
}

/** Сущности, которые сотрудник вправе читать (для меню и выбора связей) */
export async function readableTemplateIds(user: ViewerUser): Promise<Set<string> | 'all'> {
  if (hasFullAccess(user)) return 'all';
  const rows = await prisma.entityAccess.findMany({
    where: { canRead: true, template: { programId: user.programId }, role: { users: { some: { userId: user.id } } } },
    select: { templateId: true },
  });
  return new Set(rows.map((r) => r.templateId));
}

/** Есть ли у сотрудника доступ хоть к какой-то сущности (для служебных справочников вроде списка сотрудников) */
export async function hasAnyEntityAccess(user: ViewerUser): Promise<boolean> {
  const ids = await readableTemplateIds(user);
  return ids === 'all' || ids.size > 0;
}
