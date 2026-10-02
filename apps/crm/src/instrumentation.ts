/**
 * Выполняется один раз при старте сервера. В режиме `direct` агента нет, и фоновые задачи
 * (планировщик) запускает само приложение; в режиме `bus` они остаются у агента (Р-45, этап 4).
 *
 * Условие именно положительное и импорт в отдельный файл: Next собирает этот файл ещё и для
 * edge-среды, где нет Node-модулей (crypto, amqplib), и вырезает только ветку `=== 'nodejs'`.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startNodeRuntime } = await import('./instrumentationNode');
    startNodeRuntime();
  }
}
