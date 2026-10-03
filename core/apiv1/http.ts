/**
 * Общее для публичного REST API (/api/v1, строка 6 таблицы покрытия): вход по токену, формат ошибок,
 * ограничение частоты. Cookie здесь не принимаются вовсе — по этому адресу работают только токены, поэтому
 * подделка запроса из браузера (CSRF) невозможна по построению.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CurrentUser } from '../auth/types';
import { authenticateApiToken, checkRateLimit } from '../apitokens/service';
import { AccessError } from '../entities/access';
import { EntityError } from '../entities/service';

export interface ApiContext {
  user: CurrentUser;
  tokenId: string;
  headers: Record<string, string>;
}

export function apiError(status: number, code: string, message: string, headers: Record<string, string> = {}): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status, headers });
}

export function apiJson(ctx: Pick<ApiContext, 'headers'>, body: unknown, status = 200, extra: Record<string, string> = {}): NextResponse {
  return NextResponse.json(body, { status, headers: { ...ctx.headers, ...extra } });
}

/** Вход по заголовку Authorization: Bearer <токен>. write — запрос меняет данные (токены «только чтение» не пускаются) */
export async function authenticateRequest(req: NextRequest, opts: { write: boolean }): Promise<ApiContext | NextResponse> {
  const header = req.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match) {
    return apiError(401, 'unauthorized', 'Нужен заголовок Authorization: Bearer <токен>', { 'WWW-Authenticate': 'Bearer' });
  }

  const auth = await authenticateApiToken(match[1]);
  if (!auth) {
    return apiError(401, 'invalid_token', 'Токен не найден, отозван или просрочен', { 'WWW-Authenticate': 'Bearer error="invalid_token"' });
  }

  const limit = checkRateLimit(auth.tokenId);
  const headers = { 'X-RateLimit-Limit': String(limit.limit), 'X-RateLimit-Remaining': String(limit.remaining) };
  if (!limit.ok) {
    return apiError(429, 'rate_limited', `Слишком много запросов: не больше ${limit.limit} в минуту`, {
      ...headers,
      'Retry-After': String(limit.retryAfterSeconds),
    });
  }

  if (opts.write && auth.readOnly) {
    return apiError(403, 'read_only_token', 'Этот токен выпущен только для чтения', headers);
  }
  return { user: auth.user, tokenId: auth.tokenId, headers };
}

export function isFailure(result: ApiContext | NextResponse): result is NextResponse {
  return result instanceof NextResponse;
}

/** Ожидаемые ошибки службы — в ответ API; остальное пробрасывается */
export function mapError(error: unknown, ctx: Pick<ApiContext, 'headers'>): NextResponse | null {
  if (error instanceof AccessError) return apiError(403, 'forbidden', error.message, ctx.headers);
  if (error instanceof EntityError) {
    const notFound = error.message.startsWith('Сущность не найдена') || error.message.startsWith('Запись не найдена');
    return apiError(notFound ? 404 : 400, notFound ? 'not_found' : 'validation_error', error.message, ctx.headers);
  }
  return null;
}
