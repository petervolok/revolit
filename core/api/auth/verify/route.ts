export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../data/prisma';
import { clientIp, userAgent } from '../../../utils/request';
import { SECURITY } from '../../../auth/config';
import { hashToken, safeEqual } from '../../../auth/crypto';
import { createSession } from '../../../auth/session';
import { writeAudit } from '../../../auth/audit';
import { coreEvents } from '../../../events/coreEvents';

export async function POST(req: NextRequest) {
  const { challengeId, code } = await req.json().catch(() => ({}));
  if (typeof challengeId !== 'string' || typeof code !== 'string') {
    return NextResponse.json({ error: 'Введите код подтверждения' }, { status: 400 });
  }

  const ip = clientIp(req);
  const ua = userAgent(req);

  const challenge = await prisma.loginCode.findUnique({
    where: { id: challengeId },
    include: { user: true },
  });

  if (!challenge || challenge.consumedAt || challenge.expiresAt < new Date()) {
    return NextResponse.json(
      { error: 'Код истёк. Запросите новый.', expired: true },
      { status: 410 }
    );
  }

  if (challenge.attempts >= SECURITY.codeMaxAttempts) {
    await prisma.loginCode.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() },
    });
    return NextResponse.json(
      { error: 'Слишком много попыток. Запросите новый код.', expired: true },
      { status: 429 }
    );
  }

  if (!safeEqual(hashToken(code.trim()), challenge.codeHash)) {
    const attempts = challenge.attempts + 1;
    await prisma.loginCode.update({ where: { id: challenge.id }, data: { attempts } });
    await writeAudit({
      programId: challenge.user.programId,
      userId: challenge.userId,
      actorEmail: challenge.user.email,
      action: 'auth.code.failed',
      details: { attempts },
      ip,
      userAgent: ua,
    });

    const left = SECURITY.codeMaxAttempts - attempts;
    return NextResponse.json(
      { error: left > 0 ? `Неверный код. Осталось попыток: ${left}` : 'Неверный код' },
      { status: 401 }
    );
  }

  if (!challenge.user.isActive) {
    return NextResponse.json({ error: 'Учётная запись отключена' }, { status: 403 });
  }

  await prisma.loginCode.update({
    where: { id: challenge.id },
    data: { consumedAt: new Date() },
  });

  await createSession(challenge.userId, { ip, userAgent: ua });

  await prisma.user.update({
    where: { id: challenge.userId },
    data: { lastLoginAt: new Date() },
  });

  await writeAudit({
    programId: challenge.user.programId,
    userId: challenge.userId,
    actorEmail: challenge.user.email,
    action: 'auth.login.success',
    ip,
    userAgent: ua,
  });

  await coreEvents.emit('auth.logged_in', { programId: challenge.user.programId, userId: challenge.userId, ip });

  return NextResponse.json({ ok: true });
}
