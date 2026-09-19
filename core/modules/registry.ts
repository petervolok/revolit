import { coreEvents } from '../events/coreEvents';
import type { NavSection } from '../shell/navModel';
import type {
  MenuContribution,
  ModuleManifest,
  PermissionContribution,
  SettingsContribution,
} from './types';

export interface Registry {
  modules: ModuleManifest[];
  permissions: PermissionContribution[];
  /**
   * Разделы меню, отфильтрованные по правам сотрудника и, если передан набор
   * выключенных ключей (Р-34), по тому, включён ли приносящий пункт модуль
   * для программы.
   */
  menu(userPermissions: string[], disabledModules?: Set<string>): NavSection[];
  /** Карточки настроек, тем же приёмом */
  settings(userPermissions: string[], disabledModules?: Set<string>): SettingsContribution[];
  has(moduleKey: string): boolean;
}

/** Простая проверка совместимости вида ">=1.2.0" */
function satisfies(version: string, requirement: string): boolean {
  const match = requirement.match(/^(>=|\^|~|=)?\s*(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return true;

  const [, operator = '=', major, minor, patch] = match;
  const need = [Number(major), Number(minor), Number(patch)];
  const have = version.split('.').map(Number);
  if (have.length !== 3 || have.some(Number.isNaN)) return false;

  const compare = () => {
    for (let i = 0; i < 3; i++) {
      if (have[i] !== need[i]) return have[i] - need[i];
    }
    return 0;
  };

  if (operator === '=') return compare() === 0;
  if (operator === '>=') return compare() >= 0;
  // ^ — совместимо в пределах старшей версии, ~ — в пределах средней
  if (operator === '^') return have[0] === need[0] && compare() >= 0;
  if (operator === '~') return have[0] === need[0] && have[1] === need[1] && compare() >= 0;
  return true;
}

const allowed = (userPermissions: string[], permission?: string) =>
  !permission || userPermissions.includes('*') || userPermissions.includes(permission);

/**
 * Собирает систему из описаний модулей.
 * Несовместимый или недоукомплектованный модуль не подключается,
 * но не роняет остальные — сообщение уходит в журнал.
 */
export function createRegistry(manifests: ModuleManifest[], coreVersion: string): Registry {
  const accepted: ModuleManifest[] = [];
  const keys = new Set(manifests.map((m) => m.key));

  for (const manifest of manifests) {
    if (!satisfies(coreVersion, manifest.requiresCore)) {
      console.error(
        `[модули] «${manifest.name}» требует ядро ${manifest.requiresCore}, установлено ${coreVersion} — модуль отключён`
      );
      continue;
    }

    const missing = (manifest.dependsOn ?? []).filter((dep) => !keys.has(dep));
    if (missing.length > 0) {
      console.error(
        `[модули] «${manifest.name}» требует модули: ${missing.join(', ')} — модуль отключён`
      );
      continue;
    }

    accepted.push(manifest);
  }

  // Подписки на события и подмена портов
  for (const manifest of accepted) {
    try {
      manifest.register?.({ events: coreEvents });
    } catch (error) {
      console.error(`[модули] «${manifest.name}» не смог подключиться`, error);
    }
  }

  const permissions = accepted.flatMap((m) => m.permissions ?? []);
  const menuItems = accepted.flatMap((m) => (m.menu ?? []).map((item) => ({ ...item, moduleKey: m.key })));
  const settingsItems = accepted.flatMap((m) => (m.settings ?? []).map((item) => ({ ...item, moduleKey: m.key })));

  return {
    modules: accepted,
    permissions,

    menu(userPermissions, disabledModules) {
      const sections = new Map<string, NavSection & { order: number }>();

      // Порядок пунктов — по order (по умолчанию 100); сортировка устойчивая,
      // поэтому при равных значениях сохраняется порядок модулей в createRegistry
      const ordered = [...menuItems].sort((a, b) => (a.order ?? 100) - (b.order ?? 100));

      for (const item of ordered) {
        if (disabledModules?.has(item.moduleKey)) continue;
        if (!allowed(userPermissions, item.permission)) continue;

        if (!sections.has(item.section)) {
          sections.set(item.section, {
            key: item.section,
            title: item.sectionTitle,
            items: [],
            order: item.sectionOrder ?? 100,
          });
        }

        const section = sections.get(item.section)!;
        if (item.sectionTitle && !section.title) section.title = item.sectionTitle;
        if (item.sectionOrder !== undefined) section.order = item.sectionOrder;

        section.items.push({
          key: item.key,
          label: item.label,
          href: item.href,
          icon: item.icon,
          permission: item.permission,
          children: item.children?.filter((child) => allowed(userPermissions, child.permission)),
        });
      }

      return [...sections.values()]
        .sort((a, b) => a.order - b.order)
        .map(({ order: _order, ...section }) => section)
        .filter((section) => section.items.length > 0);
    },

    settings(userPermissions, disabledModules) {
      return settingsItems
        .filter((item) => !disabledModules?.has(item.moduleKey))
        .filter((item) => allowed(userPermissions, item.permission))
        .sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
    },

    has(moduleKey) {
      return accepted.some((m) => m.key === moduleKey);
    },
  };
}

/** Сортировка пунктов внутри раздела по указанному порядку */
export function sortMenuItems(contributions: MenuContribution[]): MenuContribution[] {
  return [...contributions].sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
}
