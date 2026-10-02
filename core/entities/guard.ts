import { NextResponse } from 'next/server';
import { getCurrentUser, type CurrentUser } from '../auth/session';
import { AccessError } from './access';
import { EntityError } from './service';

type UserResult = { user: CurrentUser } | { response: NextResponse };

/**
 * Для маршрутов записей: достаточно войти. Что именно разрешено с этой сущностью, решает
 * служба по правам ролей (entities/access.ts) — право entities.manage их обходит.
 */
export async function requireSignedIn(): Promise<UserResult> {
  const user = await getCurrentUser();
  if (!user) return { response: NextResponse.json({ error: 'Требуется вход' }, { status: 401 }) };
  return { user };
}

export function isUserDenied(result: UserResult): result is { response: NextResponse } {
  return 'response' in result;
}

/** Ответ на ожидаемую ошибку: нет доступа — 403, нарушено правило — status (по умолчанию 400); иное — null */
export function entityErrorResponse(error: unknown, status = 400): NextResponse | null {
  if (error instanceof AccessError) return NextResponse.json({ error: error.message }, { status: 403 });
  if (error instanceof EntityError) return NextResponse.json({ error: error.message }, { status });
  return null;
}
