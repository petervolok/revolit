/**
 * Токены доступа к REST API (строка 6 таблицы покрытия). Токен действует от имени сотрудника, который
 * его выпустил, и с его правами на момент запроса: отнять у сотрудника роль — значит отнять доступ и у
 * его токенов. Выше своих прав токен выпустить нельзя по построению. В базе лежит только хеш.
 */
import { prisma } from '../data/prisma';
import { newId } from '../data/ids';
import { generateToken, hashToken } from '../auth/crypto';
import type { CurrentUser } from '../auth/types';

export class ApiTokenError extends Error {
  constructor(message: string, public status: 400 | 404 | 409 = 400) {
    super(message);
  }
}

export const TOKEN_PREFIX = 'rvl_';
const NAME_MIN = 2;
const NAME_MAX = 60;
const MAX_ACTIVE_PER_USER = 20;
const MAX_LIFETIME_DAYS = 3650;
/** Отметка «использован» пишется не чаще раза в 5 минут — не писать в базу на каждый запрос */
const LAST_USED_EVERY_MS = 5 * 60 * 1000;
/** Проверенный токен помнится в памяти процесса недолго: отзыв вступает в силу не позже чем через это время */
const CACHE_TTL_MS = 15_000;

export interface ApiTokenInfo {
  id: string;
  name: string;
  prefix: string;
  readOnly: boolean;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
  user: { id: string; name: string; email: string };
}

export interface CreateTokenInput {
  name?: unknown;
  readOnly?: unknown;
  /** Срок действия в днях; пусто — без срока */
  expiresInDays?: unknown;
}

function toInfo(row: {
  id: string; name: string; prefix: string; readOnly: boolean; expiresAt: Date | null; lastUsedAt: Date | null;
  createdAt: Date; revokedAt: Date | null; user: { id: string; name: string; email: string };
}): ApiTokenInfo {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    readOnly: row.readOnly,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
    user: row.user,
  };
}

const userSelect = { select: { id: true, name: true, email: true } } as const;

/** Выпускает токен от имени userId. Сам токен возвращается один раз — потом его не восстановить */
export async function createApiToken(
  programId: string,
  userId: string,
  input: CreateTokenInput
): Promise<{ token: string; info: ApiTokenInfo }> {
  const name = typeof input.name === 'string' ? input.name.trim().replace(/\s+/g, ' ') : '';
  if (name.length < NAME_MIN) throw new ApiTokenError(`Название токена — не короче ${NAME_MIN} знаков`);
  if (name.length > NAME_MAX) throw new ApiTokenError(`Название токена — не длиннее ${NAME_MAX} знаков`);

  let expiresAt: Date | null = null;
  if (input.expiresInDays !== undefined && input.expiresInDays !== null && input.expiresInDays !== '') {
    const days = Number(input.expiresInDays);
    if (!Number.isInteger(days) || days < 1 || days > MAX_LIFETIME_DAYS) {
      throw new ApiTokenError(`Срок действия — целое число дней от 1 до ${MAX_LIFETIME_DAYS}`);
    }
    expiresAt = new Date(Date.now() + days * 24 * 3600 * 1000);
  }

  const user = await prisma.user.findFirst({ where: { id: userId, programId, isActive: true } });
  if (!user) throw new ApiTokenError('Сотрудник не найден', 404);

  const active = await prisma.apiToken.count({
    where: { userId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
  });
  if (active >= MAX_ACTIVE_PER_USER) throw new ApiTokenError(`Не больше ${MAX_ACTIVE_PER_USER} действующих токенов на сотрудника — отзовите ненужные`, 409);

  const token = `${TOKEN_PREFIX}${generateToken()}`;
  const row = await prisma.apiToken.create({
    data: {
      id: newId(),
      programId,
      userId,
      name,
      tokenHash: hashToken(token),
      prefix: token.slice(0, TOKEN_PREFIX.length + 6),
      readOnly: input.readOnly === true,
      expiresAt,
    },
    include: { user: userSelect },
  });
  return { token, info: toInfo(row) };
}

/** Токены программы; own — только выпущенные этим сотрудником */
export async function listApiTokens(programId: string, own?: string): Promise<ApiTokenInfo[]> {
  const rows = await prisma.apiToken.findMany({
    where: { programId, ...(own ? { userId: own } : {}) },
    include: { user: userSelect },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(toInfo);
}

/** Отзыв: сразу в базе, в памяти процессов — не позже чем через CACHE_TTL_MS */
export async function revokeApiToken(programId: string, id: string): Promise<ApiTokenInfo> {
  const row = await prisma.apiToken.findFirst({ where: { id, programId }, include: { user: userSelect } });
  if (!row) throw new ApiTokenError('Токен не найден', 404);
  if (row.revokedAt) throw new ApiTokenError('Токен уже отозван', 409);
  const updated = await prisma.apiToken.update({ where: { id }, data: { revokedAt: new Date() }, include: { user: userSelect } });
  cache.delete(row.tokenHash);
  return toInfo(updated);
}

export interface AuthenticatedToken {
  user: CurrentUser;
  tokenId: string;
  readOnly: boolean;
}

const cache = new Map<string, { at: number; value: AuthenticatedToken | null }>();

/** Проверяет токен из заголовка; null — токена нет, он отозван, просрочен или сотрудник отключён */
export async function authenticateApiToken(plain: string): Promise<AuthenticatedToken | null> {
  if (!plain.startsWith(TOKEN_PREFIX) || plain.length > 200) return null;
  const tokenHash = hashToken(plain);

  const hit = cache.get(tokenHash);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const row = await prisma.apiToken.findUnique({
    where: { tokenHash },
    include: { user: { include: { roles: { include: { role: true } } } } },
  });

  let value: AuthenticatedToken | null = null;
  if (row && !row.revokedAt && (!row.expiresAt || row.expiresAt > new Date()) && row.user.isActive) {
    const roles = row.user.roles.map((r) => r.role);
    value = {
      tokenId: row.id,
      readOnly: row.readOnly,
      user: {
        id: row.user.id,
        programId: row.user.programId,
        email: row.user.email,
        name: row.user.name,
        roles: roles.map((r) => ({ key: r.key, name: r.name })),
        permissions: Array.from(new Set(roles.flatMap((r) => r.permissions))),
      },
    };
    if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > LAST_USED_EVERY_MS) {
      await prisma.apiToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
    }
  }

  if (cache.size > 1000) cache.clear();
  cache.set(tokenHash, { at: Date.now(), value });
  return value;
}

/** Только для проверок: сбросить память процесса, чтобы изменения вступили в силу сразу */
export function resetApiTokenCache(): void {
  cache.clear();
  windows.clear();
}

// ─── Ограничение частоты ───

const windows = new Map<string, { start: number; count: number }>();
const WINDOW_MS = 60_000;

function limitPerMinute(): number {
  const fromEnv = Number(process.env.API_RATE_LIMIT_PER_MIN);
  return Number.isInteger(fromEnv) && fromEnv > 0 ? fromEnv : 120;
}

/** Не больше N запросов в минуту на токен (по умолчанию 120, переменная API_RATE_LIMIT_PER_MIN) */
export function checkRateLimit(tokenId: string, now = Date.now()): { ok: boolean; limit: number; remaining: number; retryAfterSeconds: number } {
  const limit = limitPerMinute();
  let w = windows.get(tokenId);
  if (!w || now - w.start >= WINDOW_MS) {
    w = { start: now, count: 0 };
    windows.set(tokenId, w);
    if (windows.size > 5000) windows.clear();
  }
  w.count++;
  const retryAfterSeconds = Math.max(1, Math.ceil((w.start + WINDOW_MS - now) / 1000));
  return { ok: w.count <= limit, limit, remaining: Math.max(0, limit - w.count), retryAfterSeconds };
}
