export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../auth/guard';
import { writeAudit } from '../../auth/audit';
import { clientIp, userAgent } from '../../utils/request';
import { ApiTokenError, createApiToken, listApiTokens } from '../../apitokens/service';

/** Токены программы — видны тем, у кого право api.manage */
export async function GET() {
  const guard = await requirePermission('api.manage');
  if (isDenied(guard)) return guard.response;

  return NextResponse.json(await listApiTokens(guard.user.programId));
}

/** Выпуск токена от имени самого сотрудника. Токен в ответе показывается один раз */
export async function POST(req: NextRequest) {
  const guard = await requirePermission('api.manage');
  if (isDenied(guard)) return guard.response;

  const body = await req.json().catch(() => ({}));

  try {
    const { token, info } = await createApiToken(guard.user.programId, guard.user.id, body);

    await writeAudit({
      programId: guard.user.programId,
      userId: guard.user.id,
      actorEmail: guard.user.email,
      action: 'api_token.created',
      target: 'api_token',
      targetId: info.id,
      details: { name: info.name, readOnly: info.readOnly, expiresAt: info.expiresAt },
      ip: clientIp(req),
      userAgent: userAgent(req),
    });

    return NextResponse.json({ token, info }, { status: 201 });
  } catch (error) {
    if (error instanceof ApiTokenError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
