import { prisma } from '../data/prisma';
import { getCurrentProgram } from '../data/program';
import { getMailPort } from './registry';
import { createSmtpMail } from './smtp';
import type { OutgoingMail } from './types';

/**
 * Отправка письма. Сначала смотрит, не настроена ли почта в базе для текущей
 * программы (мастер первого запуска или экран настроек могли её задать),
 * и только если нет — использует прежний путь через переменные окружения (Р-25).
 */
export async function sendMail(mail: OutgoingMail): Promise<void> {
  const program = await getCurrentProgram().catch(() => null);
  const settings = program
    ? await prisma.programSettings.findUnique({ where: { programId: program.id } })
    : null;

  if (settings?.mailHost) {
    await createSmtpMail({
      host: settings.mailHost,
      port: settings.mailPort ?? 587,
      secure: settings.mailSecure,
      user: settings.mailUser ?? undefined,
      pass: settings.mailPass ?? undefined,
      from: settings.mailFrom ?? undefined,
    }).send(mail);
    return;
  }

  await getMailPort().send(mail);
}

type Template = Omit<OutgoingMail, 'to'>;

function layout(title: string, body: string): string {
  return `<!doctype html><html lang="ru"><body style="margin:0;background:#f6f7f9;padding:32px 16px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e8eaee">
    <tr><td style="padding:28px 28px 8px">
      <div style="font-size:15px;font-weight:600;color:#181a20">Revolit</div>
    </td></tr>
    <tr><td style="padding:0 28px 28px">
      <h1 style="margin:12px 0 8px;font-size:19px;color:#181a20">${title}</h1>
      ${body}
    </td></tr>
  </table></body></html>`;
}

export function loginCodeEmail(code: string, minutes: number): Template {
  return {
    subject: `Код подтверждения: ${code}`,
    text: `Ваш код для входа в систему: ${code}\nКод действителен ${minutes} минут.\n\nЕсли вы не пытались войти, просто проигнорируйте это письмо и смените пароль.`,
    html: layout(
      'Подтверждение входа',
      `<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#626876">Введите этот код на странице входа:</p>
       <div style="font-size:30px;font-weight:700;letter-spacing:8px;color:#181a20;background:#f6f7f9;border-radius:8px;padding:16px;text-align:center">${code}</div>
       <p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#949baa">Код действителен ${minutes} минут. Если вы не пытались войти — проигнорируйте письмо и смените пароль.</p>`
    ),
  };
}

export function inviteEmail(link: string, programName: string, hours: number): Template {
  return {
    subject: `Доступ в «${programName}»`,
    text: `Для вас создана учётная запись в системе «${programName}».\nЗадайте пароль по ссылке:\n${link}\n\nСсылка действительна ${hours} ч.`,
    html: layout(
      `Доступ в «${programName}»`,
      `<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#626876">Для вас создана учётная запись. Задайте пароль, чтобы начать работу:</p>
       <a href="${link}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;font-size:14px;font-weight:500;padding:11px 20px;border-radius:8px">Задать пароль</a>
       <p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#949baa">Ссылка действительна ${hours} ч. Если она устареет, попросите администратора отправить приглашение заново.</p>`
    ),
  };
}

export function passwordResetEmail(link: string, minutes: number): Template {
  return {
    subject: 'Восстановление пароля',
    text: `Для установки нового пароля перейдите по ссылке:\n${link}\n\nСсылка действительна ${minutes} минут. Если вы не запрашивали смену пароля, проигнорируйте это письмо.`,
    html: layout(
      'Восстановление пароля',
      `<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#626876">Нажмите кнопку, чтобы задать новый пароль:</p>
       <a href="${link}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;font-size:14px;font-weight:500;padding:11px 20px;border-radius:8px">Задать новый пароль</a>
       <p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#949baa">Ссылка действительна ${minutes} минут. Если вы не запрашивали смену пароля — просто проигнорируйте письмо.</p>`
    ),
  };
}
