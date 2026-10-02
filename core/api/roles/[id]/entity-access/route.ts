export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { clientIp, userAgent } from '../../../../utils/request';
import { requirePermission, isDenied } from '../../../../auth/guard';
import { writeAudit } from '../../../../auth/audit';
import { coreEvents } from '../../../../events/coreEvents';
import { RoleError } from '../../../../roles/service';
import { getRoleEntityAccess, setRoleEntityAccess } from '../../../../roles/entityAccess';

/** Доступ роли к сущностям: список сущностей с полями и заданные правила */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requirePermission('roles.view');
  if (isDenied(guard)) return guard.response;

  try {
    return NextResponse.json(await getRoleEntityAccess(guard.user.programId, params.id));
  } catch (error) {
    if (error instanceof RoleError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requirePermission('roles.manage');
  if (isDenied(guard)) return guard.response;

  const body = await req.json().catch(() => ({}));

  try {
    const rules = await setRoleEntityAccess(guard.user.programId, guard.user, params.id, body.rules);

    await writeAudit({
      programId: guard.user.programId,
      userId: guard.user.id,
      actorEmail: guard.user.email,
      action: 'role.updated',
      target: 'role',
      targetId: params.id,
      details: { entityAccess: rules.map((r) => ({ templateId: r.templateId, read: r.canRead, create: r.canCreate, update: r.canUpdate, delete: r.canDelete, scope: r.rowScope })) },
      ip: clientIp(req),
      userAgent: userAgent(req),
    });
    await coreEvents.emit('role.updated', { programId: guard.user.programId, roleId: params.id, actorId: guard.user.id });

    return NextResponse.json({ ok: true, rules });
  } catch (error) {
    if (error instanceof RoleError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
