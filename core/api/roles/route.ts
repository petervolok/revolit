export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../data/prisma';
import { clientIp, userAgent } from '../../utils/request';
import { requirePermission, isDenied } from '../../auth/guard';
import { isKnownPermission } from '../../auth/permissions';
import { writeAudit } from '../../auth/audit';
import { coreEvents } from '../../events/coreEvents';

export async function GET() {
  const guard = await requirePermission('roles.view');
  if (isDenied(guard)) return guard.response;

  const roles = await prisma.role.findMany({
    where: { programId: guard.user.programId },
    orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    include: { _count: { select: { users: true } } },
  });

  return NextResponse.json(
    roles.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      permissions: r.permissions,
      isSystem: r.isSystem,
      userCount: r._count.users,
    }))
  );
}

function sanitizePermissions(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((p): p is string => typeof p === 'string' && isKnownPermission(p));
}

export async function POST(req: NextRequest) {
  const guard = await requirePermission('roles.manage');
  if (isDenied(guard)) return guard.response;

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: 'Укажите название роли' }, { status: 400 });

  const key =
    name
      .toLowerCase()
      .replace(/[^a-zа-я0-9]+/gi, '-')
      .replace(/(^-|-$)/g, '') || `role-${Date.now()}`;

  const exists = await prisma.role.findUnique({
    where: { programId_key: { programId: guard.user.programId, key } },
  });
  if (exists) return NextResponse.json({ error: 'Роль с таким названием уже есть' }, { status: 409 });

  const role = await prisma.role.create({
    data: {
      programId: guard.user.programId,
      key,
      name,
      description: typeof body.description === 'string' ? body.description.trim() : null,
      permissions: sanitizePermissions(body.permissions),
    },
  });

  await writeAudit({
    programId: guard.user.programId,
    userId: guard.user.id,
    actorEmail: guard.user.email,
    action: 'role.assigned',
    target: 'role',
    targetId: role.id,
    details: { created: role.name },
    ip: clientIp(req),
    userAgent: userAgent(req),
  });

  await coreEvents.emit('role.created', { programId: guard.user.programId, roleId: role.id, actorId: guard.user.id });

  return NextResponse.json({ id: role.id });
}
