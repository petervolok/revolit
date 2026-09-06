export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../data/prisma';
import { getCurrentProgram } from '../../../../data/program';
import { getEffectiveAppUrl } from '../../../../data/settings';
import { clientIp, userAgent } from '../../../../utils/request';
import { requirePermission, isDenied } from '../../../../auth/guard';
import { generateToken, hashToken } from '../../../../auth/crypto';
import { writeAudit } from '../../../../auth/audit';
import { inviteEmail, sendMail } from '../../../../ports/mail';

const INVITE_HOURS = 48;

/** Повторная отправка приглашения — сотрудник задаёт пароль сам */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requirePermission('users.manage');
  if (isDenied(guard)) return guard.response;

  const user = await prisma.user.findFirst({
    where: { id: params.id, programId: guard.user.programId },
  });
  if (!user) return NextResponse.json({ error: 'Сотрудник не найден' }, { status: 404 });
  if (!user.isActive) {
    return NextResponse.json({ error: 'Сотрудник отключён' }, { status: 409 });
  }

  const program = await getCurrentProgram();
  if (!program) return NextResponse.json({ error: 'Программа не настроена' }, { status: 500 });

  // Прошлые ссылки гасим, чтобы действовала только последняя
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const token = generateToken();
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + INVITE_HOURS * 3600_000),
    },
  });

  const base = await getEffectiveAppUrl(new URL(req.url).origin);
  await sendMail({
    to: user.email,
    ...inviteEmail(`${base}/reset-password?token=${token}`, program.name, INVITE_HOURS),
  });

  await writeAudit({
    programId: guard.user.programId,
    userId: guard.user.id,
    actorEmail: guard.user.email,
    action: 'user.updated',
    target: 'user',
    targetId: user.id,
    details: { invited: true, email: user.email },
    ip: clientIp(req),
    userAgent: userAgent(req),
  });

  return NextResponse.json({ ok: true });
}
