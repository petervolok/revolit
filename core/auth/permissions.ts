import { getRegistry, hasRegistry } from '../modules/current';
import type { PermissionContribution } from '../modules/types';

/** Права, которые приносит само ядро. Модули добавляют свои. */
export const CORE_PERMISSIONS: PermissionContribution[] = [
  { key: 'users.view', label: 'Просмотр списка сотрудников', group: 'Сотрудники и доступ' },
  { key: 'users.manage', label: 'Добавление, изменение и отключение сотрудников', group: 'Сотрудники и доступ' },
  { key: 'roles.view', label: 'Просмотр ролей и их прав', group: 'Сотрудники и доступ' },
  { key: 'roles.manage', label: 'Создание и изменение ролей', group: 'Сотрудники и доступ' },
  { key: 'settings.manage', label: 'Изменение настроек программы', group: 'Программа' },
  { key: 'audit.view', label: 'Просмотр журнала действий', group: 'Программа' },
  // Одно право на всё: конструктора ролей ещё нет, право на конкретную
  // сущность выдавать пока некому — см. Р-20.
  { key: 'entities.manage', label: 'Создание сущностей и работа с их записями', group: 'Данные' },
];

export type CorePermission =
  | 'users.view'
  | 'users.manage'
  | 'roles.view'
  | 'roles.manage'
  | 'settings.manage'
  | 'audit.view'
  | 'entities.manage';

/** Право может прийти как из ядра, так и из модуля */
export type Permission = CorePermission | (string & {});

export interface PermissionGroup {
  title: string;
  items: { key: string; label: string }[];
}

/** Все права текущей сборки — ядра и подключённых модулей */
export function allPermissions(): PermissionContribution[] {
  return hasRegistry() ? getRegistry().permissions : CORE_PERMISSIONS;
}

export function isKnownPermission(key: string): boolean {
  return allPermissions().some((p) => p.key === key);
}

/** Права, сгруппированные для показа в настройках роли */
export function permissionGroups(): PermissionGroup[] {
  const groups = new Map<string, PermissionGroup>();

  for (const permission of allPermissions()) {
    if (!groups.has(permission.group)) {
      groups.set(permission.group, { title: permission.group, items: [] });
    }
    groups.get(permission.group)!.items.push({ key: permission.key, label: permission.label });
  }

  return [...groups.values()];
}
