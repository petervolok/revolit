export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireSignedIn, isUserDenied } from '../../entities/guard';
import { hasAnyEntityAccess } from '../../entities/access';
import { prisma } from '../../data/prisma';

/**
 * Короткий список сотрудников программы — для поля-сущности типа «Сотрудник».
 * Отдельно от /api/users: тот закрыт правом users.view, а выбрать
 * ответственного сотрудника в записи должен любой, у кого есть entities.manage,
 * даже без доступа к разделу «Пользователи».
 */
export async function GET() {
  const guard = await requireSignedIn();
  if (isUserDenied(guard)) return guard.response;
  if (!(await hasAnyEntityAccess(guard.user))) return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 });

  const users = await prisma.user.findMany({
    where: { programId: guard.user.programId, isActive: true },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json(users);
}
