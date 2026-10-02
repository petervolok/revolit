/**
 * Выполняется один раз при старте сервера. В режиме `direct` агента нет, и фоновые задачи
 * (планировщик) запускает само приложение; в режиме `bus` они остаются у агента (Р-45, этап 4).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { startDirectRuntime } = await import('@revolit/core/data/directRuntime');
  startDirectRuntime();
}
