export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../../auth/guard';
import { sendMail } from '../../../ports/mail';

/** Пробное письмо на собственную почту — проверить настройки, не дожидаясь первого реального письма */
export async function POST() {
  const guard = await requirePermission('settings.manage');
  if (isDenied(guard)) return guard.response;

  try {
    await sendMail({
      to: guard.user.email,
      subject: 'Проверка настроек почты',
      text: 'Если это письмо дошло — почта настроена верно.',
      html: '<p>Если это письмо дошло — почта настроена верно.</p>',
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось отправить письмо';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
