/**
 * Исходящий вызов веб-адреса из автоматизации. Главная опасность — подмена адреса на внутренний
 * (SSRF): автоматизацию настраивает сотрудник, и она не должна становиться способом достучаться
 * до служб внутри сети сервера. Поэтому адреса внутренних сетей запрещены, пока администратор
 * сервера явно не разрешит их переменной AUTOMATION_ALLOW_PRIVATE_URLS=1.
 */
import { createHmac } from 'crypto';
import { lookup } from 'dns/promises';
import { isIP } from 'net';

export class WebhookError extends Error {}

const TIMEOUT_MS = 10_000;
export const MAX_BODY_BYTES = 256 * 1024;

/** Адрес из частной, служебной или локальной сети */
export function isPrivateAddress(address: string): boolean {
  const v = isIP(address);
  if (v === 4) {
    const [a, b] = address.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224
    );
  }
  if (v === 6) {
    const a = address.toLowerCase();
    if (a === '::1' || a === '::') return true;
    if (a.startsWith('::ffff:')) return isPrivateAddress(a.slice(7));
    return a.startsWith('fc') || a.startsWith('fd') || a.startsWith('fe8') || a.startsWith('fe9') || a.startsWith('fea') || a.startsWith('feb') || a.startsWith('ff');
  }
  return true;
}

/** Проверка адреса до вызова: схема, отсутствие логина в адресе, не внутренняя сеть */
export async function assertSafeUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new WebhookError('Адрес вебхука некорректен');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new WebhookError('Адрес вебхука — только http или https');
  if (url.username || url.password) throw new WebhookError('Логин и пароль в адресе вебхука не допускаются');
  if (process.env.AUTOMATION_ALLOW_PRIVATE_URLS === '1') return url;

  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (addresses.length === 0) throw new WebhookError('Адрес вебхука не найден');
  if (addresses.some(isPrivateAddress)) throw new WebhookError('Адрес вебхука ведёт во внутреннюю сеть — это запрещено');
  return url;
}

export function signBody(secret: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

/** POST с JSON-телом; ответ 2xx — успех. Переходы по перенаправлениям не выполняются */
export async function callWebhook(
  rawUrl: string,
  body: string,
  opts: { secret?: string; event: string }
): Promise<{ status: number }> {
  if (Buffer.byteLength(body) > MAX_BODY_BYTES) throw new WebhookError('Тело вебхука больше 256 КБ');
  const url = await assertSafeUrl(rawUrl);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'Revolit-Automation/1',
    'X-Revolit-Event': opts.event,
  };
  if (opts.secret) headers['X-Revolit-Signature'] = signBody(opts.secret, body);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: 'POST', headers, body, redirect: 'manual', signal: controller.signal });
    if (res.status < 200 || res.status >= 300) throw new WebhookError(`Вебхук ответил кодом ${res.status}`);
    return { status: res.status };
  } catch (error) {
    if (error instanceof WebhookError) throw error;
    throw new WebhookError(controller.signal.aborted ? 'Вебхук не ответил за 10 секунд' : 'Не удалось вызвать вебхук');
  } finally {
    clearTimeout(timer);
  }
}
