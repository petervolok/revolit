export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../data/prisma';
import { clientIp, userAgent } from '../../../utils/request';
import { requirePermission, isDenied } from '../../../auth/guard';
import { isKnownPermission } from '../../../auth/permissions';
import { writeAudit } from '../../../auth/audit';

function sanitizePermissions(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((p): p is string => typeof p === 'string' && isKnownPermission(p));
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requirePermission('roles.manage');
  if (isDenied(guard)) return guard.response;

  const role = await prisma.role.findFirst({
    where: { id: params.id, programId: guard.user.programId },
  });
  if (!role) return NextResponse.json({ error: 'Роль не найдена' }, { status: 404 });

  const body = await req.json().catch(() => ({}));

  // У системной роли администратора права менять нельзя — иначе можно закрыть себе доступ
  if (role.isSystem && body.permissions !== undefined) {
    return NextResponse.json(
      { error: 'Права системной роли изменить нельзя' },
      { status: 409 }
    );
  }

  await prisma.role.update({
    where: { id: role.id },
    data: {
      ...(typeof body.name === 'string' && body.name.trim() ? { name: body.name.trim() } : {}),
      ...(typeof body.description === 'string' ? { description: body.description.trim() || null } : {}),
      ...(body.permissions !== undefined ? { permissions: sanitizePermissions(body.permissions) } : {}),
    },
  });

  await writeAudit({
    programId: guard.user.programId,
    userId: guard.user.id,
    actorEmail: guard.user.email,
    action: 'role.assigned',
    target: 'role',
    targetId: role.id,
    details: { updated: role.name },
    ip: clientIp(req),
    userAgent: userAgent(req),
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requirePermission('roles.manage');
  if (isDenied(guard)) return guard.response;

  const role = await prisma.role.findFirst({
    where: { id: params.id, programId: guard.user.programId },
    include: { _count: { select: { users: true } } },
  });
  if (!role) return NextResponse.json({ error: 'Роль не найдена' }, { status: 404 });
  if (role.isSystem) {
    return NextResponse.json({ error: 'Системную роль удалить нельзя' }, { status: 409 });
  }
  if (role._count.users > 0) {
    return NextResponse.json(
      { error: 'Сначала снимите эту роль со всех сотрудников' },
      { status: 409 }
    );
  }

  await prisma.role.delete({ where: { id: role.id } });

  await writeAudit({
    programId: guard.user.programId,
    userId: guard.user.id,
    actorEmail: guard.user.email,
    action: 'role.revoked',
    target: 'role',
    targetId: role.id,
    details: { deleted: role.name },
    ip: clientIp(req),
    userAgent: userAgent(req),
  });

  return NextResponse.json({ ok: true });
}
