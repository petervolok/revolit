import { startDirectRuntime } from '@revolit/core/data/directRuntime';
import { startAutomationEngine } from '@revolit/core/automations/engine';

/**
 * Фоновые задачи приложения для Node-среды. Планировщик внутри приложения — только в режиме direct;
 * исполнитель автоматизаций слушает события ядра в любом режиме.
 */
export function startNodeRuntime(): void {
  startDirectRuntime();
  startAutomationEngine();
}
