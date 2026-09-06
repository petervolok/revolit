import { redirect } from 'next/navigation';
import { getCurrentUser, hasPermission, type CurrentUser } from './session';
import type { Permission } from './permissions';

/**
 * Защита страницы. Без нужного права сотрудник не увидит раздел,
 * даже если откроет адрес напрямую.
 */
export async function requirePageAccess(permission: Permission): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!hasPermission(user, permission)) redirect('/home');
  return user;
}
