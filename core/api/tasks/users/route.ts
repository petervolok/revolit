export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../../auth/guard';
import { prisma } from '../../../data/prisma';

/** Список сотрудников для выбора исполнителя — тем же приёмом, что и /api/program-users */
export async function GET() {
  const guard = await requirePermission('tasks.use');
  if (isDenied(guard)) return guard.response;

  const users = await prisma.user.findMany({
    where: { programId: guard.user.programId, isActive: true },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json(users);
}
