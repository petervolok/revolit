import { startDirectRuntime } from '@revolit/core/data/directRuntime';

/** Фоновые задачи приложения для Node-среды (в режиме bus ничего не делает) */
export function startNodeRuntime(): void {
  startDirectRuntime();
}
