import type { Registry } from './registry';

/**
 * Текущая сборка системы. Приложение собирает реестр из своих модулей
 * и кладёт его сюда при запуске — код ядра дальше обращается к нему,
 * не зная, какие именно модули подключены.
 */
let current: Registry | null = null;

export function setRegistry(registry: Registry): void {
  current = registry;
}

export function getRegistry(): Registry {
  if (!current) {
    throw new Error(
      'Реестр модулей не собран. Приложение должно вызвать setRegistry() при запуске.'
    );
  }
  return current;
}

export function hasRegistry(): boolean {
  return current !== null;
}
