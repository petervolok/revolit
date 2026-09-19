export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../data/prisma';
import { clientIp, userAgent } from '../../../../utils/request';
import { hashPassword, hashToken, validatePasswordStrength } from '../../../../auth/crypto';
import { writeAudit } from '../../../../auth/audit';
import { coreEvents } from '../../../../events/coreEvents';

export async function POST(req: NextRequest) {
  const { token, password } = await req.json().catch(() => ({}));
  if (typeof token !== 'string' || typeof password !== 'string') {
    return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 });
  }

  const weak = validatePasswordStrength(password);
  if (weak) return NextResponse.json({ error: weak }, { status: 400 });

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Ссылка недействительна или устарела' }, { status: 410 });
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: {
        passwordHash: await hashPassword(password),
        mustChangePassword: false,
        failedAttempts: 0,
        lockedUntil: null,
      },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    // Смена пароля завершает все активные сессии этого пользователя
    prisma.session.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  await writeAudit({
    programId: record.user.programId,
    userId: record.userId,
    actorEmail: record.user.email,
    action: 'auth.password_reset.completed',
    ip: clientIp(req),
    userAgent: userAgent(req),
  });

  await coreEvents.emit('auth.password_changed', { programId: record.user.programId, userId: record.userId });

  return NextResponse.json({ ok: true });
}
