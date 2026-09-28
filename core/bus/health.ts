/**
 * Состояние шины для мониторинга (Р-44, этап 6). Показатели — только симметричные,
 * одинаково осмысленные для установки с одним потребителем и с несколькими: число
 * подключённых потребителей, самый высокий приоритет среди них, глубина очереди.
 * Ничего в этом файле не предполагает, что потребителей должно быть больше одного —
 * ровно то условие, которое требует Р-44 («нигде не должно быть указано, что мы
 * ожидаем второго потребителя»).
 */

export interface BusHealth {
  /** Удалось ли вообще получить ответ от брокера */
  reachable: boolean;
  /** Сколько потребителей сейчас подключено к очереди операций */
  consumers: number;
  /** Наибольший приоритет среди подключённых потребителей (undefined — нет потребителей) */
  activePriority?: number;
  /** Сколько сообщений сейчас ждут обработки в очереди */
  queueDepth: number;
  error?: string;
}

function managementUrl(): string | null {
  const host = process.env.BUS_MANAGEMENT_HOST ?? 'rabbitmq';
  const port = process.env.BUS_MANAGEMENT_PORT ?? '15672';
  const user = process.env.BUS_USER;
  const pass = process.env.BUS_PASSWORD;
  if (!user || !pass) return null;
  return `http://${user}:${pass}@${host}:${port}`;
}

const QUEUE = 'revolit.data.operations';

/** Читает состояние очереди операций через HTTP API RabbitMQ (management-плагин). */
export async function getBusHealth(): Promise<BusHealth> {
  const base = managementUrl();
  if (!base) return { reachable: false, consumers: 0, queueDepth: 0, error: 'Не заданы учётные данные шины' };

  try {
    const url = new URL(`/api/queues/%2F/${encodeURIComponent(QUEUE)}`, base);
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { reachable: false, consumers: 0, queueDepth: 0, error: `HTTP ${res.status}` };

    const body = (await res.json()) as {
      messages?: number;
      consumer_details?: { arguments?: Record<string, unknown> }[];
    };
    const details = body.consumer_details ?? [];
    const priorities = details.map((c) => Number(c.arguments?.['x-priority'] ?? 0));

    return {
      reachable: true,
      consumers: details.length,
      activePriority: priorities.length ? Math.max(...priorities) : undefined,
      queueDepth: body.messages ?? 0,
    };
  } catch (error) {
    return { reachable: false, consumers: 0, queueDepth: 0, error: (error as Error).message };
  }
}
