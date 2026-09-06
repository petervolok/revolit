export const dynamic = 'force-dynamic';

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { prisma } from '../../../data/prisma';
import { getCurrentUser } from '../../../auth/session';
import { hashToken } from '../../../auth/crypto';
import { SESSION_COOKIE } from '../../../auth/config';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });

  const token = cookies().get(SESSION_COOKIE)?.value;
  const currentHash = token ? hashToken(token) : '';

  const sessions = await prisma.session.findMany({
    where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: 'desc' },
  });

  return NextResponse.json(
    sessions.map((s) => ({
      id: s.id,
      ip: s.ip,
      userAgent: s.userAgent,
      lastSeenAt: s.lastSeenAt,
      createdAt: s.createdAt,
      isCurrent: s.tokenHash === currentHash,
    }))
  );
}

/** Завершает все сессии кроме текущей */
export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });

  const token = cookies().get(SESSION_COOKIE)?.value;
  const currentHash = token ? hashToken(token) : '';

  const result = await prisma.session.updateMany({
    where: { userId: user.id, revokedAt: null, tokenHash: { not: currentHash } },
    data: { revokedAt: new Date() },
  });

  return NextResponse.json({ revoked: result.count });
}
