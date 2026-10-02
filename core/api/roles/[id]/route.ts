export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { clientIp, userAgent } from '../../../utils/request';
import { requirePermission, isDenied } from '../../../auth/guard';
import { writeAudit } from '../../../auth/audit';
import { coreEvents } from '../../../events/coreEvents';
import { deleteRole, updateRole, RoleError } from '../../../roles/service';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requirePermission('roles.manage');
  if (isDenied(guard)) return guard.response;

  const body = await req.json().catch(() => ({}));

  try {
    const role = await updateRole(guard.user.programId, guard.user, params.id, body);

    await writeAudit({
      programId: guard.user.programId,
      userId: guard.user.id,
      actorEmail: guard.user.email,
      action: 'role.updated',
      target: 'role',
      targetId: role.id,
      details: { name: role.name, permissions: body.permissions !== undefined ? role.permissions : undefined },
      ip: clientIp(req),
      userAgent: userAgent(req),
    });
    await coreEvents.emit('role.updated', { programId: guard.user.programId, roleId: role.id, actorId: guard.user.id });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RoleError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requirePermission('roles.manage');
  if (isDenied(guard)) return guard.response;

  try {
    const role = await deleteRole(guard.user.programId, params.id);

    await writeAudit({
      programId: guard.user.programId,
      userId: guard.user.id,
      actorEmail: guard.user.email,
      action: 'role.deleted',
      target: 'role',
      targetId: role.id,
      details: { name: role.name },
      ip: clientIp(req),
      userAgent: userAgent(req),
    });
    await coreEvents.emit('role.deleted', { programId: guard.user.programId, roleId: role.id, actorId: guard.user.id });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RoleError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
