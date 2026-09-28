export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../auth/guard';
import { prisma } from '../../data/prisma';
import { newId } from '../../data/ids';

/**
 * Настройки программы. Пароль почты и токен Telegram-бота никогда не возвращаются
 * клиенту — только признак того, что они заданы. Тот же приём, что и с паролями
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
    twoFactorEnabled: settings?.twoFactorEnabled ?? false,
    telegramChatId: settings?.telegramChatId ?? '',
    telegramBotTokenSet: Boolean(settings?.telegramBotToken),
  });
}

export async function PATCH(req: NextRequest) {
  const guard = await requirePermission('settings.manage');
  if (isDenied(guard)) return guard.response;

  const body = await req.json().catch(() => ({}));
  const {
    programName,
    appUrl,
    mailHost,
    mailPort,
    mailSecure,
    mailUser,
    mailPass,
    mailFrom,
    twoFactorEnabled,
    telegramBotToken,
    telegramChatId,
  } = body ?? {};

  if (typeof programName !== 'string' || !programName.trim()) {
    return NextResponse.json({ error: 'Укажите название программы' }, { status: 400 });
  }

  const existing = await prisma.programSettings.findUnique({ where: { programId: guard.user.programId } });

  // Код входа уходит письмом: без почтового сервера включать нельзя — иначе никто не сможет войти
  const nextTwoFactor = typeof twoFactorEnabled === 'boolean' ? twoFactorEnabled : existing?.twoFactorEnabled ?? false;
  const hasMail = (typeof mailHost === 'string' && mailHost.trim() !== '') || Boolean(process.env.MAIL_HOST);
  if (nextTwoFactor && !hasMail) {
    return NextResponse.json(
      { error: 'Подтверждение входа кодом нельзя включить без почтового сервера — код не дойдёт. Сначала укажите почту.' },
      { status: 400 }
    );
  }

  await prisma.program.update({
    where: { id: guard.user.programId },
    data: { name: programName.trim() },
  });

  // Пустое поле секрета означает «оставить как есть», а не «стереть» — иначе поле
  // нельзя было бы показать пустым без потери уже заданного значения.
  const nextMailPass = typeof mailPass === 'string' && mailPass ? mailPass : existing?.mailPass ?? null;
  const nextTelegramBotToken =
    typeof telegramBotToken === 'string' && telegramBotToken ? telegramBotToken : existing?.telegramBotToken ?? null;
  const nextTelegramChatId =
    typeof telegramChatId === 'string' && telegramChatId.trim() ? telegramChatId.trim() : null;

  await prisma.programSettings.upsert({
    where: { programId: guard.user.programId },
    create: {
      id: newId(),
      programId: guard.user.programId,
      appUrl: typeof appUrl === 'string' && appUrl.trim() ? appUrl.trim() : null,
      mailHost: typeof mailHost === 'string' && mailHost.trim() ? mailHost.trim() : null,
      mailPort: Number(mailPort) || null,
      mailSecure: Boolean(mailSecure),
      mailUser: typeof mailUser === 'string' && mailUser.trim() ? mailUser.trim() : null,
      mailPass: nextMailPass,
      mailFrom: typeof mailFrom === 'string' && mailFrom.trim() ? mailFrom.trim() : null,
      twoFactorEnabled: nextTwoFactor,
      telegramBotToken: nextTelegramBotToken,
      telegramChatId: nextTelegramChatId,
    },
    update: {
      appUrl: typeof appUrl === 'string' && appUrl.trim() ? appUrl.trim() : null,
      mailHost: typeof mailHost === 'string' && mailHost.trim() ? mailHost.trim() : null,
      mailPort: Number(mailPort) || null,
      mailSecure: Boolean(mailSecure),
      mailUser: typeof mailUser === 'string' && mailUser.trim() ? mailUser.trim() : null,
      mailPass: nextMailPass,
      mailFrom: typeof mailFrom === 'string' && mailFrom.trim() ? mailFrom.trim() : null,
      twoFactorEnabled: nextTwoFactor,
      telegramBotToken: nextTelegramBotToken,
      telegramChatId: nextTelegramChatId,
    },
  });

  return NextResponse.json({ ok: true });
}
