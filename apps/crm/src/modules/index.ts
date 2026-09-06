import { CORE_VERSION, coreModule, createRegistry, setRegistry } from '@revolit/core';
import { crmModule } from './crmModule';

/**
 * Сборка этой программы: какие модули подключены.
 * Добавить возможность = добавить модуль в список.
 *
 * Файл импортируется страницами и обработчиками запросов, чтобы реестр
 * был собран до первого обращения к нему.
 */
export const registry = createRegistry([coreModule, crmModule], CORE_VERSION);

setRegistry(registry);
