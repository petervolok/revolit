/**
 * Опубликованный интерфейс ядра — часть, безопасная для браузера.
 *
 * Здесь только то, что можно выполнять и на сервере, и на стороне
 * посетителя: сборка из модулей, события, описания типов, оболочка.
 *
 * Всё, что работает с куками, базой данных, почтой и файлами, лежит
 * в отдельном входе — '@revolit/core/server'. Разделение не косметическое:
 * если серверный код попадёт в браузерную сборку, она откажется собираться.
 *
 * Модули и приложения пользуются только этими двумя входами. Внутреннее
 * устройство ядра можно менять свободно, пока их набор остаётся прежним.
 */

// Сборка системы из модулей
export { createRegistry } from './modules/registry';
export type { Registry } from './modules/registry';
export { setRegistry, getRegistry, hasRegistry } from './modules/current';
export { coreModule, CORE_VERSION } from './modules/coreModule';
export type {
  ModuleManifest,
  ModuleContext,
  MenuContribution,
  MenuChildContribution,
  PermissionContribution,
  SettingsContribution,
} from './modules/types';

// События
export { coreEvents } from './events/coreEvents';
export type { CoreEventMap } from './events/coreEvents';
export { createEventBus } from './events/bus';
export type { EventBus } from './events/bus';

// Сменные части — только описания. Подключение частей серверное.
export type { MailPort, StoragePort, OutgoingMail, StoredFile } from './ports/types';

// Права: перечень и принадлежность. Чистые данные, проверок доступа здесь нет.
export { permissionGroups, allPermissions, isKnownPermission } from './auth/permissions';
export type { Permission, PermissionGroup } from './auth/permissions';
export type { CurrentUser } from './auth/types';

// Оболочка
export { default as AppShell } from './shell/AppShell';
export type { NavSection, NavItem } from './shell/navModel';

// Сущности: описания и сборка пункта меню. Работа с базой — в серверном входе.
export { buildEntityNavSection } from './entities/nav';
export type { EntityNavSource } from './entities/nav';
export { slugify, FIELD_TYPE_LABELS } from './entities/types';
export type {
  FieldType,
  FieldOptions,
  EntityFieldDef,
  EntityTemplateDef,
  EntityRecordDef,
  PresetFieldDef,
  PresetFieldOptions,
  EntityPresetDef,
} from './entities/types';

// Конструктор процессов: описания и сборка пункта меню. Работа с базой — в серверном входе.
export { buildProcessNavSection } from './processes/nav';
export type { ProcessNavSource } from './processes/nav';
export type {
  ChecklistItem,
  ChecklistState,
  ProcessStageDef,
  ProcessTemplateDef,
  ProcessInstanceDef,
  ProcessInstanceWithHistory,
  ProcessHistoryEntryDef,
  ProcessInstanceStatus,
} from './processes/types';
