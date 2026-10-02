export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireSignedIn, isUserDenied, entityErrorResponse } from '../../../../../entities/guard';
import { writeAudit } from '../../../../../auth/audit';
import { clientIp, userAgent } from '../../../../../utils/request';
import { deleteRecord, updateRecord } from '../../../../../entities/service';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { key: string; id: string } }
) {
  const guard = await requireSignedIn();
  if (isUserDenied(guard)) return guard.response;

  const body = await req.json().catch(() => ({}));

  try {
    const record = await updateRecord(guard.user.programId, params.key, params.id, body, guard.user);
    return NextResponse.json(record);
  } catch (error) {
    const response = entityErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { key: string; id: string } }
) {
  const guard = await requireSignedIn();
  if (isUserDenied(guard)) return guard.response;

  try {
    await deleteRecord(guard.user.programId, params.key, params.id, guard.user);
  } catch (error) {
    const response = entityErrorResponse(error, 409);
    if (response) return response;
    throw error;
  }

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
