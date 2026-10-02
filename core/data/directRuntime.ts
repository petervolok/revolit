/**
 * Фоновая работа приложения в режиме `direct` (Р-45, этап 4). С агентом планировщик живёт в нём;
 * без агента его запускает само приложение при старте сервера (apps/crm/src/instrumentation.ts).
 * В режиме `bus` не делает ничего — там планировщик остаётся у агента.
 */
import { coreEvents } from '../events/coreEvents';
import { startScheduler } from '../scheduler/runner';
import { basePrisma } from './prisma';
import { dataMode } from './port';

const globalState = globalThis as unknown as { __revolitDirectRuntime?: () => void };

/** Запускает планировщик внутри приложения. Повторный вызов безопасен. Возвращает функцию остановки. */
export function startDirectRuntime(): () => void {
  if (dataMode() !== 'direct') return () => undefined;
  if (process.env.SCHEDULER_ENABLED === '0') return () => undefined;
  if (globalState.__revolitDirectRuntime) return globalState.__revolitDirectRuntime;

  const stop = startScheduler({
    client: basePrisma,
    tickMs: Number(process.env.SCHEDULER_TICK_MS) || 30_000,
    offsetMinutes: Number(process.env.SCHEDULER_UTC_OFFSET_MINUTES) || 0,
    log: (message) => console.log(`[планировщик] ${message}`),
    emit: (fired) => coreEvents.emit('scheduler.job.fired', fired),
  });
  console.log('[планировщик] включён внутри приложения (режим direct)');

  globalState.__revolitDirectRuntime = stop;
  return stop;
}
