export const dynamic = 'force-dynamic';

import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../data/prisma';
import { getCurrentProgram } from '../../../data/program';
import { clientIp, userAgent } from '../../../utils/request';
import { SECURITY } from '../../../auth/config';
import { generateLoginCode, hashPassword, hashToken, verifyPassword } from '../../../auth/crypto';
import { writeAudit } from '../../../auth/audit';
import { loginCodeEmail, sendMail } from '../../../ports/mail';

// Единый ответ на неверные данные: не раскрываем, существует ли такая учётная запись
const INVALID = { error: 'Неверная почта или пароль' };

let dummyHash: string | null = null;
async function equalizeTiming() {
  if (!dummyHash) dummyHash = await hashPassword(randomBytes(16).toString('hex'));
  await verifyPassword('placeholder', dummyHash);
}

export async function POST(req: NextRequest) {
  const { email, password } = await req.json().catch(() => ({}));
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return NextResponse.json({ error: 'Укажите почту и пароль' }, { status: 400 });
  }

  const program = await getCurrentProgram();
  if (!program) {
    return NextResponse.json({ error: 'Программа не настроена' }, { status: 500 });
  }

  const ip = clientIp(req);
  const ua = userAgent(req);
  const normalizedEmail = email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { programId_email: { programId: program.id, email: normalizedEmail } },
  });

  if (!user || !user.isActive) {
    await equalizeTiming();
    await writeAudit({
      programId: program.id,
      actorEmail: normalizedEmail,
      action: 'auth.login.failed',
      details: { reason: user ? 'inactive' : 'unknown_email' },
      ip,
      userAgent: ua,
    });
    return NextResponse.json(INVALID, { status: 401 });
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    return NextResponse.json(
      { error: `Вход временно заблокирован. Попробуйте через ${minutes} мин.` },
      { status: 423 }
    );
  }

  const passwordOk = await verifyPassword(password, user.passwordHash);

  if (!passwordOk) {
    const attempts = user.failedAttempts + 1;
    const shouldLock = attempts >= SECURITY.maxFailedAttempts;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedAttempts: shouldLock ? 0 : attempts,
        lockedUntil: shouldLock ? new Date(Date.now() + SECURITY.lockMinutes * 60000) : null,
      },
    });

    await writeAudit({
      programId: program.id,
      userId: user.id,
      actorEmail: user.email,
      action: shouldLock ? 'auth.login.locked' : 'auth.login.failed',
      details: { attempts },
      ip,
      userAgent: ua,
    });

    if (shouldLock) {
      return NextResponse.json(
        { error: `Слишком много попыток. Вход заблокирован на ${SECURITY.lockMinutes} мин.` },
        { status: 423 }
      );
    }
    return NextResponse.json(INVALID, { status: 401 });
  }

  // Пароль верный — сбрасываем счётчик и переходим ко второму фактору
  await prisma.user.update({
    where: { id: user.id },
    data: { failedAttempts: 0, lockedUntil: null },
  });

  // Прошлые неиспользованные коды гасим, чтобы действовал только последний
  await prisma.loginCode.updateMany({
    where: { userId: user.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  const code = generateLoginCode();
  const challenge = await prisma.loginCode.create({
    data: {
      userId: user.id,
      codeHash: hashToken(code),
      expiresAt: new Date(Date.now() + SECURITY.codeTtlMinutes * 60000),
      ip,
      userAgent: ua,
    },
  });

  await sendMail({ to: user.email, ...loginCodeEmail(code, SECURITY.codeTtlMinutes) });

  await writeAudit({
    programId: program.id,
    userId: user.id,
    actorEmail: user.email,
    action: 'auth.code.sent',
    ip,
    userAgent: ua,
  });

  return NextResponse.json({
    challengeId: challenge.id,
    // Почта для подсказки на экране — в маскированном виде
    maskedEmail: user.email.replace(/^(.).*(@.*)$/, (_m, a, b) => `${a}•••${b}`),
  });
}
