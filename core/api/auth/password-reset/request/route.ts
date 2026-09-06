export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../data/prisma';
import { getCurrentProgram } from '../../../../data/program';
import { getEffectiveAppUrl } from '../../../../data/settings';
import { clientIp, userAgent } from '../../../../utils/request';
import { SECURITY } from '../../../../auth/config';
import { generateToken, hashToken } from '../../../../auth/crypto';
import { writeAudit } from '../../../../auth/audit';
import { passwordResetEmail, sendMail } from '../../../../ports/mail';

export async function POST(req: NextRequest) {
  const { email } = await req.json().catch(() => ({}));
  if (typeof email !== 'string' || !email) {
    return NextResponse.json({ error: 'Укажите почту' }, { status: 400 });
  }

  const program = await getCurrentProgram();
  if (!program) return NextResponse.json({ error: 'Программа не настроена' }, { status: 500 });

  const user = await prisma.user.findUnique({
    where: { programId_email: { programId: program.id, email: email.trim().toLowerCase() } },
  });

  // Ответ одинаковый в любом случае — чтобы нельзя было проверить, есть ли такая почта
  if (user && user.isActive) {
    const token = generateToken();
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + SECURITY.resetTtlMinutes * 60000),
      },
    });

    const base = await getEffectiveAppUrl(new URL(req.url).origin);
    await sendMail({
      to: user.email,
      ...passwordResetEmail(`${base}/reset-password?token=${token}`, SECURITY.resetTtlMinutes),
    });

    await writeAudit({
      programId: program.id,
      userId: user.id,
      actorEmail: user.email,
      action: 'auth.password_reset.requested',
      ip: clientIp(req),
      userAgent: userAgent(req),
    });
  }

  return NextResponse.json({ ok: true });
}
