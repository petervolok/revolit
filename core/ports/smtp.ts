import nodemailer, { type Transporter } from 'nodemailer';
import type { MailPort } from './types';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from?: string;
}

/** Настройки из переменных окружения — то, что было единственным путём до Р-25 */
function envConfig(): SmtpConfig | null {
  const host = process.env.MAIL_HOST;
  if (!host) return null;

  return {
    host,
    port: Number(process.env.MAIL_PORT ?? 587),
    secure: process.env.MAIL_SECURE === 'true',
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASSWORD,
    from: process.env.MAIL_FROM,
  };
}

/**
 * Отправка через обычный почтовый сервер — реализация по умолчанию.
 * Если сервер не настроен, письмо не теряется молча, а печатается в журнал,
 * чтобы разработка не останавливалась.
 *
 * Без аргумента берёт настройки из переменных окружения — так вызывается,
 * когда для программы ничего не настроено в базе (Р-25).
 */
export function createSmtpMail(config?: SmtpConfig): MailPort {
  let cached: Transporter | null = null;

  const transport = (): Transporter | null => {
    if (cached) return cached;
    const resolved = config ?? envConfig();
    if (!resolved) return null;

    cached = nodemailer.createTransport({
      host: resolved.host,
      port: resolved.port,
      secure: resolved.secure,
      auth: resolved.user ? { user: resolved.user, pass: resolved.pass } : undefined,
    });
    return cached;
  };

  return {
    async send(mail) {
      const t = transport();
      if (!t) {
        console.warn(
          `\n[почта не настроена] Письмо для ${mail.to}\n  Тема: ${mail.subject}\n  ${mail.text}\n`
        );
        return;
      }
      const from = config?.from ?? process.env.MAIL_FROM ?? 'Revolit <no-reply@revolit.local>';
      await t.sendMail({ from, ...mail });
    },
  };
}
