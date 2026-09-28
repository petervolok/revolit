import type { CurrentUser } from './types';

/**
 * Кэш проверенной сессии в памяти процесса (Р-44). Проверка сессии/прав происходит на
 * каждой странице — без кэша это означало бы обращение к БД (и в режиме шины —
 * сообщение в очередь) на каждый переход. Срок жизни короткий и настраиваемый:
 * это осознанная уступка мгновенности отключения/смены роли ради нагрузки, не ошибка.
 *
 * Кэш локален для процесса: при нескольких запущенных экземплярах приложения каждый
 * держит свой — это не влияет на корректность, только на то, насколько экземпляр
 * может отставать от базы в пределах срока жизни записи.
 */

interface Entry {
  user: CurrentUser | null;
  expiresAt: number;
}

const cache = new Map<string, Entry>();

function ttlMs(): number {
  const raw = Number(process.env.SESSION_CACHE_TTL_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 15000;
}

export function getCached(tokenHash: string): CurrentUser | null | undefined {
  const entry = cache.get(tokenHash);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    cache.delete(tokenHash);
    return undefined;
  }
  return entry.user;
}

export function setCached(tokenHash: string, user: CurrentUser | null): void {
  const ttl = ttlMs();
  if (ttl === 0) return; // 0 — кэш выключен, каждый запрос идёт в базу
  cache.set(tokenHash, { user, expiresAt: Date.now() + ttl });
}

/** Выход из системы — не ждём протухания кэша, снимаем запись сразу */
export function invalidateCached(tokenHash: string): void {
  cache.delete(tokenHash);
}

// Периодическая уборка протухших записей — процесс сервера долгоживущий (Next.js standalone)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache) if (entry.expiresAt < now) cache.delete(key);
}, 60_000).unref();
