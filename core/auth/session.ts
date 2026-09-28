import { cookies, headers } from 'next/headers';
import { prisma } from '../data/prisma';
import { generateToken, hashToken } from './crypto';
import { newId } from '../data/ids';
import { SECURITY, SESSION_COOKIE } from './config';
import { getCached, invalidateCached, setCached } from './sessionCache';
import type { CurrentUser } from './types';

export type { CurrentUser };

/** Создаёт сессию и кладёт токен в httpOnly-cookie. Вызывается только из обработчиков запросов. */
export async function createSession(
  userId: string,
  meta: { ip?: string; userAgent?: string }
): Promise<void> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SECURITY.sessionTtlDays * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: { id: newId(), userId, tokenHash: hashToken(token), expiresAt, ip: meta.ip, userAgent: meta.userAgent },
  });

  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    // Secure-куку браузер не сохраняет по обычному http — вход «молча» не срабатывал.
    // За https-прокси (X-Forwarded-Proto) кука по-прежнему только защищённая.
    secure: process.env.NODE_ENV === 'production' && headers().get('x-forwarded-proto') === 'https',
    path: '/',
    expires: expiresAt,
  });
}

/**
 * Возвращает текущего пользователя по cookie либо null, если сессии нет или она недействительна.
 * Проверенный результат кэшируется в памяти процесса на короткий срок (Р-44, `sessionCache.ts`) —
 * повторные обращения в пределах этого срока не идут ни в базу, ни в шину.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const tokenHash = hashToken(token);
  const cached = getCached(tokenHash);
  if (cached !== undefined) return cached;

  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: { include: { roles: { include: { role: true } } } } },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    setCached(tokenHash, null);
    return null;
  }
  if (!session.user.isActive) {
    setCached(tokenHash, null);
    return null;
  }

  // Отметка активности, но не чаще раза в 5 минут — чтобы не писать в базу на каждый запрос
  if (Date.now() - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
    await prisma.session
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);
  }

  const roles = session.user.roles.map((r) => r.role);

  const user: CurrentUser = {
    id: session.user.id,
    programId: session.user.programId,
    email: session.user.email,
    name: session.user.name,
    roles: roles.map((r) => ({ key: r.key, name: r.name })),
    permissions: Array.from(new Set(roles.flatMap((r) => r.permissions))),
  };
  setCached(tokenHash, user);
  return user;
}

/** Завершает текущую сессию. Кэш снимается сразу — выход не должен ждать протухания. */
export async function destroySession(): Promise<string | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  cookies().delete(SESSION_COOKIE);
  if (!token) return null;

  const tokenHash = hashToken(token);
  invalidateCached(tokenHash);

  const session = await prisma.session.findUnique({ where: { tokenHash } });
  if (!session) return null;

  await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
  return session.userId;
}

export function hasPermission(user: CurrentUser, permission: string): boolean {
  return user.permissions.includes('*') || user.permissions.includes(permission);
}
