import { aiModule, CORE_VERSION, coreModule, createRegistry, reportsModule, setRegistry, tasksModule } from '@revolit/core';
import { crmModule } from './crmModule';

/**
 * Сборка этой программы: какие модули подключены.
 * Добавить возможность = добавить модуль в список.
 *
 * Файл импортируется страницами и обработчиками запросов, чтобы реестр
 * был собран до первого обращения к нему.
 */
export const registry = createRegistry([coreModule, crmModule, aiModule, reportsModule, tasksModule], CORE_VERSION);

setRegistry(registry);
