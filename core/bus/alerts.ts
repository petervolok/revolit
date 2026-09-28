/**
 * Оповещения о состоянии шины (Р-44, этап 6) — через уже существующего Telegram-бота
 * (тот же, что уведомляет о падении CI). Условие тревоги — «очередь не разгружается»:
 * осмысленно для установки с любым числом потребителей, ничего не предполагает про то,
 * сколько их должно быть.
 */
import { getBusHealth } from './health';

function envReady(): { token: string; chatId: string } | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  return token && chatId ? { token, chatId } : null;
}

async function sendTelegram(text: string): Promise<void> {
  const creds = envReady();
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
