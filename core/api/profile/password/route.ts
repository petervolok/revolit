export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../data/prisma';
import { clientIp, userAgent } from '../../../utils/request';
import { getCurrentUser } from '../../../auth/session';
import { hashPassword, validatePasswordStrength, verifyPassword } from '../../../auth/crypto';
import { writeAudit } from '../../../auth/audit';
import { coreEvents } from '../../../events/coreEvents';

export async function POST(req: NextRequest) {
  const current = await getCurrentUser();
  if (!current) return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });

  const { currentPassword, newPassword } = await req.json().catch(() => ({}));
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    return NextResponse.json({ error: 'Заполните оба поля' }, { status: 400 });
  }

  const weak = validatePasswordStrength(newPassword);
  if (weak) return NextResponse.json({ error: weak }, { status: 400 });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: current.id } });
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    return NextResponse.json({ error: 'Текущий пароль указан неверно' }, { status: 401 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false },
  });

  await writeAudit({
    programId: user.programId,
    userId: user.id,
    actorEmail: user.email,
    action: 'auth.password_reset.completed',
    details: { self: true },
    ip: clientIp(req),
    userAgent: userAgent(req),
  });

  await coreEvents.emit('auth.password_changed', { programId: user.programId, userId: user.id });

  return NextResponse.json({ ok: true });
}
