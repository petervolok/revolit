/**
 * Оповещения о состоянии шины (Р-44, этап 6) — через уже существующего Telegram-бота
 * (тот же, что уведомляет о падении CI). Условие тревоги — «очередь не разгружается»:
 * осмысленно для установки с любым числом потребителей, ничего не предполагает про то,
 * сколько их должно быть.
 */
import { basePrisma } from '../data/prisma';
import { getBusHealth } from './health';

/**
 * Настройки берутся из базы (Настройки → Общие → Оповещения в Telegram), с откатом на
 * переменные окружения — тот же приём, что и с почтой (Р-25). Читается через `basePrisma`
 * напрямую: этот код исполняется внутри агента, который не пользуется общим `prisma`
 * (иначе он замкнул бы шину сам на себя, см. apps/agent/src/index.ts).
 */
async function credentials(): Promise<{ token: string; chatId: string } | null> {
  const program = await basePrisma.program.findFirst({ orderBy: { createdAt: 'asc' } });
  const settings = program
    ? await basePrisma.programSettings.findUnique({ where: { programId: program.id } })
    : null;

  const token = settings?.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = settings?.telegramChatId || process.env.TELEGRAM_CHAT_ID;
  return token && chatId ? { token, chatId } : null;
}

async function sendTelegram(text: string): Promise<void> {
  const creds = await credentials().catch(() => null);
  if (!creds) return; // не настроено — молча пропускаем, это не обязательная часть коробки
  try {
    await fetch(`https://api.telegram.org/bot${creds.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: creds.chatId, text, parse_mode: 'HTML' }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Само оповещение не должно ронять процесс, который его вызвал
  }
}

const QUEUE_DEPTH_THRESHOLD = Number(process.env.BUS_ALERT_QUEUE_DEPTH) || 20;
const CHECKS_BEFORE_ALERT = Number(process.env.BUS_ALERT_CHECKS) || 5;

let consecutiveHigh = 0;
let alerted = false;

/** Вызывается периодически (агент). Следит только за тем, разгружается ли очередь. */
export async function checkBusAndAlert(): Promise<void> {
  const health = await getBusHealth();

  if (!health.reachable) {
    consecutiveHigh = 0; // недоступность — отдельная история, не «очередь не разгружается»
    return;
  }

  if (health.queueDepth > QUEUE_DEPTH_THRESHOLD) {
    consecutiveHigh++;
    if (consecutiveHigh >= CHECKS_BEFORE_ALERT && !alerted) {
      alerted = true;
      await sendTelegram(
        `⚠️ <b>Revolit: очередь операций не разгружается</b>\nВ очереди ${health.queueDepth} сообщений, потребителей подключено: ${health.consumers}.`
      );
    }
  } else {
    if (alerted) {
      await sendTelegram('✅ <b>Revolit: очередь операций снова в норме</b>');
    }
    consecutiveHigh = 0;
    alerted = false;
  }
}
