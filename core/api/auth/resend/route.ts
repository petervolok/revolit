export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../data/prisma';
import { clientIp, userAgent } from '../../../utils/request';
import { SECURITY } from '../../../auth/config';
import { generateLoginCode, hashToken } from '../../../auth/crypto';
import { writeAudit } from '../../../auth/audit';
import { loginCodeEmail, sendMail } from '../../../ports/mail';

export async function POST(req: NextRequest) {
  const { challengeId } = await req.json().catch(() => ({}));
  if (typeof challengeId !== 'string') {
    return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 });
  }

  const previous = await prisma.loginCode.findUnique({
    where: { id: challengeId },
    include: { user: true },
  });

  // Повторно отправляем только для живой попытки входа
  if (!previous || previous.consumedAt || previous.expiresAt < new Date()) {
    return NextResponse.json(
      { error: 'Попытка входа устарела. Войдите заново.', expired: true },
      { status: 410 }
    );
  }

  const ip = clientIp(req);
  const ua = userAgent(req);

  await prisma.loginCode.update({
    where: { id: previous.id },
    data: { consumedAt: new Date() },
  });

  const code = generateLoginCode();
  const challenge = await prisma.loginCode.create({
    data: {
      userId: previous.userId,
      codeHash: hashToken(code),
      expiresAt: new Date(Date.now() + SECURITY.codeTtlMinutes * 60000),
      ip,
      userAgent: ua,
    },
  });

  await sendMail({ to: previous.user.email, ...loginCodeEmail(code, SECURITY.codeTtlMinutes) });

  await writeAudit({
    programId: previous.user.programId,
    userId: previous.userId,
    actorEmail: previous.user.email,
    action: 'auth.code.sent',
    details: { resent: true },
    ip,
    userAgent: ua,
  });

  return NextResponse.json({ challengeId: challenge.id });
}
