import { prisma } from './prisma';

export type UserNames = Map<string, { id: string; name: string }>;

/**
 * Имена сотрудников по id — отдельным запросом к User в локальной БД (решение F2
 * переработки ядра). Доменные запросы больше не делают `include` на User: через
 * шину их выполнил бы агент №2 в БД, где учётных таблиц нет. User — учётная модель,
 * она всегда идёт напрямую, в любом режиме.
 */
export async function resolveUserNames(ids: (string | null | undefined)[]): Promise<UserNames> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Map();

  const users = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u]));
}
