import { describeError } from '../../../core/bus/protocol';
import type { BusRequest, BusResponse } from '../../../core/bus/protocol';
import { deriveDomainEvents, WRITE_OPERATIONS } from '../../../core/data/domainEvents';
import type { DerivedEvent } from '../../../core/data/domainEvents';
import { isProxied } from '../../../core/data/port';
import type { DataOperation, DataPort } from '../../../core/data/port';

export interface Handled {
  response: BusResponse;
  events: DerivedEvent[];
  /** Сбой инфраструктуры (база недоступна) — сообщение нужно вернуть в очередь, а не отвечать ошибкой */
  retry: boolean;
}

const code = (error: unknown): string | undefined => (error as { code?: string } | undefined)?.code;

/** Ошибки связи с базой — повтор имеет смысл; ошибки запроса (P2002, P2025, валидация) — нет */
function isInfrastructureError(error: unknown): boolean {
  const name = (error as { name?: string } | undefined)?.name ?? '';
  return (
    name === 'PrismaClientInitializationError' ||
    name === 'PrismaClientRustPanicError' ||
    ['P1001', 'P1002', 'P1008', 'P1017'].includes(code(error) ?? '')
  );
}

/**
 * Выполняет одну операцию. Повторная доставка `create` (ТЗ 3.6): id записи задан в сервисе
 * до отправки, поэтому при повторе база отвечает нарушением уникальности по этому id —
 * тогда возвращаем уже созданную запись, а не дубликат и не ошибку.
 */
async function executeOperation(port: DataPort, op: DataOperation): Promise<unknown> {
  try {
    return await port.execute(op);
  } catch (error) {
    const args = (op.args ?? {}) as { data?: { id?: unknown }; include?: unknown; select?: unknown };
    const id = args.data?.id;

    if (op.operation === 'create' && code(error) === 'P2002' && typeof id === 'string') {
      const existing = await port.execute({
        model: op.model,
        operation: 'findUnique',
        args: { where: { id }, include: args.include, select: args.select },
      });
      // Нарушение было по другому уникальному полю (например, programId+key) — это настоящая ошибка
      if (existing) return existing;
    }
    throw error;
  }
}

function eventsFor(op: DataOperation, result: unknown): DerivedEvent[] {
  if (!isProxied(op.model) || !WRITE_OPERATIONS.has(op.operation)) return [];
  return deriveDomainEvents(op.model, op.operation, op.args, result);
}

export async function handleRequest(port: DataPort, req: BusRequest): Promise<Handled> {
  try {
    if (req.kind === 'batch') {
      const results = await port.runBatch(req.ops);
      const events = req.ops.flatMap((op, i) => eventsFor(op, results[i]));
      return { response: { ok: true, result: results }, events, retry: false };
    }

    const result = await executeOperation(port, req.op);
    return { response: { ok: true, result }, events: eventsFor(req.op, result), retry: false };
  } catch (error) {
    return {
      response: { ok: false, error: describeError(error) },
      events: [],
      retry: isInfrastructureError(error),
    };
  }
}
