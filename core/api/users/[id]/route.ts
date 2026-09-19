export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../data/prisma';
import { clientIp, userAgent } from '../../../utils/request';
import { requirePermission, isDenied } from '../../../auth/guard';
import { writeAudit } from '../../../auth/audit';
import { coreEvents } from '../../../events/coreEvents';

/** Не даём администратору отобрать доступ у самого себя или обезглавить программу */
async function wouldLeaveProgramWithoutAdmin(
  programId: string,
  userId: string,
  nextRoleIds: string[] | null,
  nextActive: boolean | null
): Promise<boolean> {
  const adminRole = await prisma.role.findUnique({
    where: { programId_key: { programId, key: 'admin' } },
  });
  if (!adminRole) return false;

  const admins = await prisma.userRole.findMany({
    where: { roleId: adminRole.id, user: { isActive: true } },
    select: { userId: true },
  });

  const stillAdmin = (id: string) => {
    if (id !== userId) return true;
    if (nextActive === false) return false;
    if (nextRoleIds) return nextRoleIds.includes(adminRole.id);
    return true;
  };

  return admins.filter((a) => stillAdmin(a.userId)).length === 0;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requirePermission('users.manage');
  if (isDenied(guard)) return guard.response;

  const body = await req.json().catch(() => ({}));
  const user = await prisma.user.findFirst({
    where: { id: params.id, programId: guard.user.programId },
  });
  if (!user) return NextResponse.json({ error: 'Сотрудник не найден' }, { status: 404 });

  const nextRoleIds = Array.isArray(body.roleIds) ? (body.roleIds as string[]) : null;
  const nextActive = typeof body.isActive === 'boolean' ? body.isActive : null;

  if (
    (nextRoleIds || nextActive === false) &&
    (await wouldLeaveProgramWithoutAdmin(guard.user.programId, user.id, nextRoleIds, nextActive))
  ) {
    return NextResponse.json(
      { error: 'В программе должен остаться хотя бы один активный администратор' },
      { status: 409 }
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(typeof body.name === 'string' && body.name.trim() ? { name: body.name.trim() } : {}),
      ...(nextActive !== null ? { isActive: nextActive } : {}),
      // Снятие блокировки после неудачных попыток входа
      ...(body.unlock === true ? { lockedUntil: null, failedAttempts: 0 } : {}),
    },
  });

  if (nextRoleIds) {
    const valid = await prisma.role.findMany({
      where: { id: { in: nextRoleIds }, programId: guard.user.programId },
      select: { id: true },
    });
    await prisma.$transaction([
      prisma.userRole.deleteMany({ where: { userId: user.id } }),
      prisma.userRole.createMany({
        data: valid.map((r) => ({ userId: user.id, roleId: r.id })),
      }),
    ]);
  }

  // Отключённый сотрудник теряет активные сессии сразу
  if (nextActive === false) {
    await prisma.session.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  await writeAudit({
    programId: guard.user.programId,
    userId: guard.user.id,
    actorEmail: guard.user.email,
    action: nextActive === false ? 'user.deactivated' : 'user.updated',
    target: 'user',
    targetId: user.id,
    details: { email: user.email, roles: nextRoleIds ?? undefined, isActive: nextActive ?? undefined },
    ip: clientIp(req),
    userAgent: userAgent(req),
  });

  const event =
    nextActive === false ? 'user.deactivated' : nextActive === true && !user.isActive ? 'user.activated' : 'user.updated';
  await coreEvents.emit(event, { programId: guard.user.programId, userId: user.id, actorId: guard.user.id });

  return NextResponse.json({ ok: true });
}
