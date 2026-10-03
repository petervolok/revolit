export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../../auth/guard';
import { writeAudit } from '../../../auth/audit';
import { clientIp, userAgent } from '../../../utils/request';
import { ApiTokenError, revokeApiToken } from '../../../apitokens/service';

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requirePermission('api.manage');
  if (isDenied(guard)) return guard.response;

  try {
    const info = await revokeApiToken(guard.user.programId, params.id);

    await writeAudit({
      programId: guard.user.programId,
      userId: guard.user.id,
      actorEmail: guard.user.email,
      action: 'api_token.revoked',
      target: 'api_token',
      targetId: info.id,
      details: { name: info.name, owner: info.user.email },
      ip: clientIp(req),
      userAgent: userAgent(req),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ApiTokenError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
