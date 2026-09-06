export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../../../../auth/guard';
import { writeAudit } from '../../../../../auth/audit';
import { clientIp, userAgent } from '../../../../../utils/request';
import { deleteRecord, updateRecord, EntityError } from '../../../../../entities/service';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { key: string; id: string } }
) {
  const guard = await requirePermission('entities.manage');
  if (isDenied(guard)) return guard.response;

  const body = await req.json().catch(() => ({}));

  try {
    const record = await updateRecord(guard.user.programId, params.key, params.id, body);
    return NextResponse.json(record);
  } catch (error) {
    if (error instanceof EntityError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { key: string; id: string } }
) {
  const guard = await requirePermission('entities.manage');
  if (isDenied(guard)) return guard.response;

  await deleteRecord(guard.user.programId, params.key, params.id);

  await writeAudit({
    programId: guard.user.programId,
    userId: guard.user.id,
    actorEmail: guard.user.email,
    action: 'entity_record.deleted',
    target: 'entity_record',
    targetId: params.id,
    details: { templateKey: params.key },
    ip: clientIp(req),
    userAgent: userAgent(req),
  });

  return NextResponse.json({ ok: true });
}
