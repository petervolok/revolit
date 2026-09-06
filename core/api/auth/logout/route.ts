export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../data/prisma';
import { clientIp, userAgent } from '../../../utils/request';
import { destroySession } from '../../../auth/session';
import { writeAudit } from '../../../auth/audit';

export async function POST(req: NextRequest) {
  const userId = await destroySession();

  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user) {
      await writeAudit({
        programId: user.programId,
        userId: user.id,
        actorEmail: user.email,
        action: 'auth.logout',
        ip: clientIp(req),
        userAgent: userAgent(req),
      });
    }
  }

  return NextResponse.json({ ok: true });
}
