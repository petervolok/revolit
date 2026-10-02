export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { clientIp, userAgent } from '../../utils/request';
import { requirePermission, isDenied } from '../../auth/guard';
import { writeAudit } from '../../auth/audit';
import { coreEvents } from '../../events/coreEvents';
import { createRole, listRoles, RoleError } from '../../roles/service';

export async function GET() {
  const guard = await requirePermission('roles.view');
  if (isDenied(guard)) return guard.response;

  return NextResponse.json(await listRoles(guard.user.programId));
}

export async function POST(req: NextRequest) {
  const guard = await requirePermission('roles.manage');
  if (isDenied(guard)) return guard.response;

  const body = await req.json().catch(() => ({}));

  try {
    const role = await createRole(guard.user.programId, guard.user, body);

    await writeAudit({
      programId: guard.user.programId,
      userId: guard.user.id,
      actorEmail: guard.user.email,
      action: 'role.created',
      target: 'role',
      targetId: role.id,
      details: { name: role.name, permissions: role.permissions },
      ip: clientIp(req),
      userAgent: userAgent(req),
    });
    await coreEvents.emit('role.created', { programId: guard.user.programId, roleId: role.id, actorId: guard.user.id });

    return NextResponse.json({ id: role.id });
  } catch (error) {
    if (error instanceof RoleError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
