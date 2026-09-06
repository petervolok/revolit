import { NextResponse } from 'next/server';
import { getCurrentUser, hasPermission, type CurrentUser } from './session';
import type { Permission } from './permissions';

type GuardResult = { user: CurrentUser } | { response: NextResponse };

/**
 * Проверка доступа для обработчиков запросов.
 * Возвращает либо пользователя, либо готовый ответ с отказом.
 */
export async function requirePermission(permission: Permission): Promise<GuardResult> {
  const user = await getCurrentUser();

  if (!user) {
    return { response: NextResponse.json({ error: 'Требуется вход' }, { status: 401 }) };
  }
  if (!hasPermission(user, permission)) {
    return { response: NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 }) };
  }
  return { user };
}

export function isDenied(result: GuardResult): result is { response: NextResponse } {
  return 'response' in result;
}
