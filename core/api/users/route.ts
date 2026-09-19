export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../data/prisma';
import { getCurrentProgram } from '../../data/program';
import { getEffectiveAppUrl } from '../../data/settings';
import { clientIp, userAgent } from '../../utils/request';
import { requirePermission, isDenied } from '../../auth/guard';
import { generateToken, hashPassword, hashToken } from '../../auth/crypto';
import { writeAudit } from '../../auth/audit';
import { coreEvents } from '../../events/coreEvents';
import { inviteEmail, sendMail } from '../../ports/mail';
import { randomBytes } from 'crypto';

const INVITE_HOURS = 48;

export async function GET() {
  const guard = await requirePermission('users.view');
  if (isDenied(guard)) return guard.response;

  const users = await prisma.user.findMany({
    where: { programId: guard.user.programId },
    orderBy: { createdAt: 'asc' },
    include: { roles: { include: { role: true } } },
  });

  return NextResponse.json(
    users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      isActive: u.isActive,
      lastLoginAt: u.lastLoginAt,
      isLocked: Boolean(u.lockedUntil && u.lockedUntil > new Date()),
      // Пользователь ещё не заходил и пароль не задавал
      isPending: !u.lastLoginAt,
      roles: u.roles.map((r) => ({ id: r.role.id, key: r.role.key, name: r.role.name })),
    }))
  );
}

export async function POST(req: NextRequest) {
  const guard = await requirePermission('users.manage');
  if (isDenied(guard)) return guard.response;

  const { name, email, roleIds } = await req.json().catch(() => ({}));
  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Укажите имя сотрудника' }, { status: 400 });
  }
  if (typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
    return NextResponse.json({ error: 'Укажите корректный адрес почты' }, { status: 400 });
  }

  const program = await getCurrentProgram();
  if (!program) return NextResponse.json({ error: 'Программа не настроена' }, { status: 500 });

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({
    where: { programId_email: { programId: program.id, email: normalizedEmail } },
  });
  if (existing) {
    return NextResponse.json({ error: 'Сотрудник с такой почтой уже есть' }, { status: 409 });
  }

  // Пароль ставит сам сотрудник по ссылке из письма — администратор его не знает
  const user = await prisma.user.create({
    data: {
      programId: program.id,
      email: normalizedEmail,
      name: name.trim(),
      passwordHash: await hashPassword(randomBytes(32).toString('hex')),
      mustChangePassword: true,
    },
  });

  if (Array.isArray(roleIds) && roleIds.length > 0) {
    const validRoles = await prisma.role.findMany({
      where: { id: { in: roleIds }, programId: program.id },
      select: { id: true },
    });
    await prisma.userRole.createMany({
      data: validRoles.map((r) => ({ userId: user.id, roleId: r.id })),
    });
  }

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
    programId: program.id,
    userId: guard.user.id,
    actorEmail: guard.user.email,
    action: 'user.created',
    target: 'user',
    targetId: user.id,
    details: { email: user.email },
    ip: clientIp(req),
    userAgent: userAgent(req),
  });

  await coreEvents.emit('user.created', {
    programId: program.id,
    userId: user.id,
    email: user.email,
    actorId: guard.user.id,
  });

  return NextResponse.json({ id: user.id });
}
