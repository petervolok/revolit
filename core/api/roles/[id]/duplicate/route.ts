export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { clientIp, userAgent } from '../../../../utils/request';
import { requirePermission, isDenied } from '../../../../auth/guard';
import { writeAudit } from '../../../../auth/audit';
import { coreEvents } from '../../../../events/coreEvents';
import { duplicateRole, RoleError } from '../../../../roles/service';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requirePermission('roles.manage');
  if (isDenied(guard)) return guard.response;

  try {
    const role = await duplicateRole(guard.user.programId, guard.user, params.id);

    await writeAudit({
      programId: guard.user.programId,
      userId: guard.user.id,
      actorEmail: guard.user.email,
      action: 'role.created',
      target: 'role',
      targetId: role.id,
      details: { name: role.name, copiedFrom: params.id },
      ip: clientIp(req),
      userAgent: userAgent(req),
    });
    await coreEvents.emit('role.created', { programId: guard.user.programId, roleId: role.id, actorId: guard.user.id });

    return NextResponse.json({ id: role.id, name: role.name }, { status: 201 });
  } catch (error) {
    if (error instanceof RoleError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
