export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../auth/guard';
import { prisma } from '../../data/prisma';

/**
 * Настройки программы. Пароль почты никогда не возвращается клиенту —
 * только признак того, что он задан. Тот же приём, что и с паролями
 * пользователей: секрет пишется, но не читается обратно.
 */
export async function GET() {
  const guard = await requirePermission('settings.manage');
  if (isDenied(guard)) return guard.response;

  const program = await prisma.program.findUnique({ where: { id: guard.user.programId } });
  const settings = await prisma.programSettings.findUnique({ where: { programId: guard.user.programId } });

  return NextResponse.json({
    programName: program?.name ?? '',
    appUrl: settings?.appUrl ?? '',
    mailHost: settings?.mailHost ?? '',
    mailPort: settings?.mailPort ?? 587,
    mailSecure: settings?.mailSecure ?? false,
    mailUser: settings?.mailUser ?? '',
    mailFrom: settings?.mailFrom ?? '',
    mailPassSet: Boolean(settings?.mailPass),
  });
}

export async function PATCH(req: NextRequest) {
  const guard = await requirePermission('settings.manage');
  if (isDenied(guard)) return guard.response;

  const body = await req.json().catch(() => ({}));
  const { programName, appUrl, mailHost, mailPort, mailSecure, mailUser, mailPass, mailFrom } = body ?? {};

  if (typeof programName !== 'string' || !programName.trim()) {
    return NextResponse.json({ error: 'Укажите название программы' }, { status: 400 });
  }

  await prisma.program.update({
    where: { id: guard.user.programId },
    data: { name: programName.trim() },
  });

  const existing = await prisma.programSettings.findUnique({ where: { programId: guard.user.programId } });

  // Пустое поле пароля означает «оставить как есть», а не «стереть» —
  // иначе поле нельзя было бы показать пустым без потери уже заданного пароля.
  const nextMailPass = typeof mailPass === 'string' && mailPass ? mailPass : existing?.mailPass ?? null;

  await prisma.programSettings.upsert({
    where: { programId: guard.user.programId },
    create: {
      programId: guard.user.programId,
      appUrl: typeof appUrl === 'string' && appUrl.trim() ? appUrl.trim() : null,
      mailHost: typeof mailHost === 'string' && mailHost.trim() ? mailHost.trim() : null,
      mailPort: Number(mailPort) || null,
      mailSecure: Boolean(mailSecure),
      mailUser: typeof mailUser === 'string' && mailUser.trim() ? mailUser.trim() : null,
      mailPass: nextMailPass,
      mailFrom: typeof mailFrom === 'string' && mailFrom.trim() ? mailFrom.trim() : null,
    },
    update: {
      appUrl: typeof appUrl === 'string' && appUrl.trim() ? appUrl.trim() : null,
      mailHost: typeof mailHost === 'string' && mailHost.trim() ? mailHost.trim() : null,
      mailPort: Number(mailPort) || null,
      mailSecure: Boolean(mailSecure),
      mailUser: typeof mailUser === 'string' && mailUser.trim() ? mailUser.trim() : null,
      mailPass: nextMailPass,
      mailFrom: typeof mailFrom === 'string' && mailFrom.trim() ? mailFrom.trim() : null,
    },
  });

  return NextResponse.json({ ok: true });
}
