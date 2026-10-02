/**
 * Доступ роли к сущностям (строка 5 таблицы покрытия) — настройка. Сам доступ применяется
 * в entities/access.ts. Правило безопасности то же, что и для прав роли: выдать можно только то,
 * что есть у самого выдающего, — иначе тот, кто может править роли, поднял бы себе доступ.
 */
import { prisma, runBatch } from '../data/prisma';
import { hasFullAccess, resolveAccess } from '../entities/access';
import type { ViewerUser } from '../entities/access';
import { RoleError } from './service';

export interface EntityAccessRuleDto {
  templateId: string;
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  rowScope: 'all' | 'own';
  hiddenFields: string[];
  readonlyFields: string[];
}

export interface EntityAccessTemplateDto {
  id: string;
  key: string;
  name: string;
  namePlural: string;
  fields: { key: string; label: string; required: boolean; hasDefault: boolean }[];
}

async function loadRole(programId: string, roleId: string) {
  const role = await prisma.role.findFirst({ where: { id: roleId, programId } });
  if (!role) throw new RoleError('Роль не найдена', 404);
  return role;
}

async function loadTemplates(programId: string): Promise<EntityAccessTemplateDto[]> {
  const rows = await prisma.entityTemplate.findMany({ where: { programId }, include: { fields: true }, orderBy: { createdAt: 'asc' } });
  return rows.map((t) => ({
    id: t.id,
    key: t.key,
    name: t.name,
    namePlural: t.namePlural,
    fields: [...t.fields]
      .sort((a, b) => a.order - b.order)
      .map((f) => ({ key: f.key, label: f.label, required: f.required, hasDefault: 'v' in ((f.defaultValue ?? {}) as object) })),
  }));
}

export async function getRoleEntityAccess(
  programId: string,
  roleId: string
): Promise<{ templates: EntityAccessTemplateDto[]; rules: EntityAccessRuleDto[]; fullAccess: boolean }> {
  const role = await loadRole(programId, roleId);
  const templates = await loadTemplates(programId);
  const rows = await prisma.entityAccess.findMany({ where: { roleId } });
  const byTemplate = new Map(templates.map((t) => [t.id, t]));
  return {
    templates,
    fullAccess: role.permissions.includes('*') || role.permissions.includes('entities.manage'),
    rules: rows
      .filter((r) => byTemplate.has(r.templateId))
      .map((r) => {
        const keys = new Set(byTemplate.get(r.templateId)!.fields.map((f) => f.key));
        return {
          templateId: r.templateId,
          canRead: r.canRead,
          canCreate: r.canCreate,
          canUpdate: r.canUpdate,
          canDelete: r.canDelete,
          rowScope: r.rowScope === 'own' ? 'own' : 'all',
          hiddenFields: r.hiddenFields.filter((k) => keys.has(k)),
          readonlyFields: r.readonlyFields.filter((k) => keys.has(k)),
        };
      }),
  };
}

function bool(v: unknown): boolean {
  return v === true;
}

function keyList(v: unknown): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) throw new RoleError('Списки полей должны быть списками ключей');
  return [...new Set(v as string[])];
}

/** Заменяет правила роли целиком: что не передано, то снято */
export async function setRoleEntityAccess(
  programId: string,
  actor: ViewerUser,
  roleId: string,
  input: unknown
): Promise<EntityAccessRuleDto[]> {
  const role = await loadRole(programId, roleId);
  if (role.permissions.includes('*') || role.permissions.includes('entities.manage')) {
    throw new RoleError('У роли с полным доступом к сущностям настраивать нечего', 409);
  }
  if (!Array.isArray(input)) throw new RoleError('Правила доступа должны быть списком');

  const templates = new Map((await loadTemplates(programId)).map((t) => [t.id, t]));
  const seen = new Set<string>();
  const rules: EntityAccessRuleDto[] = [];

  for (const raw of input as Record<string, unknown>[]) {
    const templateId = typeof raw?.templateId === 'string' ? raw.templateId : '';
    const template = templates.get(templateId);
    if (!template) throw new RoleError('Сущность в правилах доступа не найдена');
    if (seen.has(templateId)) throw new RoleError(`Сущность «${template.namePlural}» указана дважды`);
    seen.add(templateId);

    const canCreate = bool(raw.canCreate);
    const canUpdate = bool(raw.canUpdate);
    const canDelete = bool(raw.canDelete);
    // Нельзя создавать, менять или удалять то, чего не видишь
    const canRead = bool(raw.canRead) || canCreate || canUpdate || canDelete;
    if (!canRead) continue; // ничего не разрешено — правила нет

    if (raw.rowScope !== undefined && raw.rowScope !== 'all' && raw.rowScope !== 'own') throw new RoleError('Неизвестная область записей');
    const rowScope = raw.rowScope === 'own' ? 'own' : 'all';

    const fieldKeys = new Set(template.fields.map((f) => f.key));
    const hidden = keyList(raw.hiddenFields);
    let readonly = keyList(raw.readonlyFields);
    for (const key of [...hidden, ...readonly]) {
      if (!fieldKeys.has(key)) throw new RoleError(`Поле «${key}» не найдено в сущности «${template.namePlural}»`);
    }
    readonly = readonly.filter((k) => !hidden.includes(k)); // скрытое сильнее «только чтения»

    if (canCreate) {
      const blocking = template.fields.find((f) => f.required && !f.hasDefault && (hidden.includes(f.key) || readonly.includes(f.key)));
      if (blocking) {
        throw new RoleError(
          `Поле «${blocking.label}» обязательное и без значения по умолчанию: пока роль может создавать записи «${template.namePlural}», его нельзя скрыть или сделать только для чтения`
        );
      }
    }

    rules.push({ templateId, canRead, canCreate, canUpdate, canDelete, rowScope, hiddenFields: hidden, readonlyFields: readonly });
  }

  // Выдать можно только то, что есть у самого выдающего (право entities.manage и полный доступ обходят проверку)
  if (!hasFullAccess(actor)) {
    for (const rule of rules) {
      const mine = await resolveAccess(actor, rule.templateId);
      const name = templates.get(rule.templateId)!.namePlural;
      const over =
        !mine ||
        (rule.canRead && !mine.read) ||
        (rule.canCreate && !mine.create) ||
        (rule.canUpdate && !mine.update) ||
        (rule.canDelete && !mine.delete) ||
        (rule.rowScope === 'all' && mine.own) ||
        mine.hidden.some((k) => !rule.hiddenFields.includes(k)) ||
        mine.readonly.some((k) => !rule.readonlyFields.includes(k) && !rule.hiddenFields.includes(k));
      if (over) throw new RoleError(`Нельзя выдать по сущности «${name}» больше, чем есть у вас`, 409);
    }
  }

  await runBatch([
    { model: 'EntityAccess', operation: 'deleteMany', args: { where: { roleId } } },
    ...(rules.length > 0
      ? [{ model: 'EntityAccess', operation: 'createMany', args: { data: rules.map((r) => ({ roleId, ...r })) } }]
      : []),
  ]);
  return rules;
}
