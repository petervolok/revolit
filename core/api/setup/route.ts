export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../data/prisma';
import { hashPassword, validatePasswordStrength } from '../../auth/crypto';
import { writeAudit } from '../../auth/audit';
import { clientIp, userAgent } from '../../utils/request';
import { slugify } from '../../entities/types';

/**
 * Мастер первого запуска. Заменяет служебный скрипт разработчика (Р-24).
 *
 * Единственная защита — сам факт: если в базе уже есть хоть одна программа,
 * установка навсегда отказывает. Права проверять не у кого — до создания
 * администратора в системе нет ни одной учётной записи.
 */
export async function POST(req: NextRequest) {
  const already = await prisma.program.findFirst();
  if (already) {
    return NextResponse.json({ error: 'Установка уже выполнена' }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const { programName, adminName, adminEmail, adminPassword, mail } = body ?? {};

  if (typeof programName !== 'string' || !programName.trim()) {
    return NextResponse.json({ error: 'Укажите название программы' }, { status: 400 });
  }
  if (typeof adminName !== 'string' || !adminName.trim()) {
    return NextResponse.json({ error: 'Укажите имя администратора' }, { status: 400 });
  }
  if (typeof adminEmail !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail.trim())) {
    return NextResponse.json({ error: 'Укажите корректный адрес почты' }, { status: 400 });
  }
  if (typeof adminPassword !== 'string') {
    return NextResponse.json({ error: 'Укажите пароль' }, { status: 400 });
  }
  const passwordError = validatePasswordStrength(adminPassword);
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 400 });
  }

  const slug = slugify(programName) || 'program';
  const email = adminEmail.trim().toLowerCase();

  const program = await prisma.program.create({
    data: { slug, name: programName.trim() },
  });

  const adminRole = await prisma.role.create({
    data: {
      programId: program.id,
      key: 'admin',
      name: 'Администратор',
      description: 'Полный доступ ко всем разделам и настройкам программы',
      permissions: ['*'],
      isSystem: true,
    },
  });

  const user = await prisma.user.create({
    data: {
      programId: program.id,
      email,
      name: adminName.trim(),
      passwordHash: await hashPassword(adminPassword),
    },
  });

  await prisma.userRole.create({ data: { userId: user.id, roleId: adminRole.id } });

  // Почта необязательна — коробка обязана работать и без неё (см. развёртывание)
  if (mail && typeof mail === 'object' && typeof mail.host === 'string' && mail.host.trim()) {
    await prisma.programSettings.create({
      data: {
        programId: program.id,
        mailHost: mail.host.trim(),
        mailPort: Number(mail.port) || 587,
        mailSecure: Boolean(mail.secure),
        mailUser: typeof mail.user === 'string' && mail.user.trim() ? mail.user.trim() : null,
        mailPass: typeof mail.pass === 'string' && mail.pass ? mail.pass : null,
        mailFrom: typeof mail.from === 'string' && mail.from.trim() ? mail.from.trim() : null,
      },
    });
  }

  await writeAudit({
    programId: program.id,
    userId: user.id,
    actorEmail: user.email,
    action: 'setup.completed',
    target: 'program',
    targetId: program.id,
    ip: clientIp(req),
    userAgent: userAgent(req),
  });

  return NextResponse.json({ ok: true });
}
