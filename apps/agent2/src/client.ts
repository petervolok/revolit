// Собственный сгенерированный клиент (apps/agent2/prisma/generated) — знает про
// SensitivityRule, которого в клиенте сервера №1 нет и быть не может.
import { PrismaClient } from '../prisma/generated';

export type AgentPrismaClient = PrismaClient;

/** Своя база (БД №2) — полные данные, читает и пишет всегда */
export const db2: AgentPrismaClient = new PrismaClient();

/**
 * Прямое подключение к БД №1, в обход шины (решение владельца, docs/08-decisions.md Р-41):
 * пока агент №2 — приоритетный потребитель шины, агент №1 сообщений не получает вообще,
 * переслать ему через очередь нечего. DATABASE_URL_PRIMARY — обычная строка подключения
 * Postgres, отдельный пользователь с правом писать только в доменные таблицы (без доступа
 * к User/Role/Session и прочим учётным — см. entrypoint.sh). Настраивается один раз на
 * уровне сети/файрвола сервера №1, в коде ядра или сервера №1 не упоминается нигде.
 */
export function createPrimaryClient(): AgentPrismaClient | null {
  const url = process.env.DATABASE_URL_PRIMARY;
  if (!url) return null;
  return new PrismaClient({ datasources: { db: { url } } });
}
