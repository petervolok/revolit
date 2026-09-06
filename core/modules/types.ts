import type { LucideIcon } from 'lucide-react';
import type { EventBus } from '../events/bus';
import type { CoreEventMap } from '../events/coreEvents';

/** Право доступа, которое приносит модуль */
export interface PermissionContribution {
  key: string;
  label: string;
  /** Группа для показа в настройках роли */
  group: string;
}

export interface MenuChildContribution {
  key: string;
  label: string;
  href: string;
  permission?: string;
}

/** Пункт левого меню */
export interface MenuContribution {
  /** Ключ раздела меню: main | data | admin либо свой */
  section: string;
  sectionTitle?: string;
  /** Порядок раздела; меньше — выше */
  sectionOrder?: number;
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  permission?: string;
  order?: number;
  children?: MenuChildContribution[];
}

/** Карточка в разделе «Настройки» */
export interface SettingsContribution {
  key: string;
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  permission: string;
  order?: number;
}

/** Что модуль получает при подключении */
export interface ModuleContext {
  events: EventBus<CoreEventMap>;
}

/**
 * Описание модуля: что он приносит в систему.
 * Ядро читает описание и подключает модуль само —
 * ручной проводки в коде ядра не требуется.
 */
export interface ModuleManifest {
  key: string;
  name: string;
  version: string;
  /** С какими версиями ядра совместим, например ">=1.0.0" */
  requiresCore: string;
  description?: string;
  /** Ключи модулей, без которых этот не работает */
  dependsOn?: string[];

  permissions?: PermissionContribution[];
  menu?: MenuContribution[];
  settings?: SettingsContribution[];

  /** Подписки на события и подмена портов. Вызывается один раз при запуске. */
  register?: (context: ModuleContext) => void;
}
