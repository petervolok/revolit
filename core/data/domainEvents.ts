import type { CoreEventMap } from '../events/coreEvents';

/**
 * Вывод доменных событий из сырых операций над доменными моделями (ТЗ 6, решение F4).
 * Слой данных видит только «модель + операция + аргументы + результат», поэтому смысловые
 * события выводятся из них: перенос дела — по `currentStageId` в данных обновления,
 * завершение задачи — по `status: 'done'`. Функция чистая: её результат может эмитить и
 * процесс приложения (режим `direct`), и агент, публикуя его по шине (режим `bus`).
 */
export interface DerivedEvent {
  event: keyof CoreEventMap;
  payload: Record<string, unknown>;
}

/** Операции, после которых что-то могло измениться */
export const WRITE_OPERATIONS: ReadonlySet<string> = new Set([
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
]);

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

export function deriveDomainEvents(model: string, operation: string, args: unknown, result: unknown): DerivedEvent[] {
  const a: Rec = isRec(args) ? args : {};
  const data: Rec = isRec(a.data) ? a.data : {};
  const where: Rec = isRec(a.where) ? a.where : {};
  const r: Rec = isRec(result) ? result : {};
  const out: DerivedEvent[] = [];

  if (model === 'EntityRecord') {
    const programId = str(r.programId);
    const recordId = str(r.id);
    const templateId = str(r.templateId);

    if ((operation === 'create' || operation === 'update') && programId && recordId && templateId) {
      out.push({
        event: operation === 'create' ? 'entity.record.created' : 'entity.record.updated',
        payload: { programId, recordId, templateId },
      });
    }
    if (operation === 'delete' && programId && recordId) {
      out.push({ event: 'entity.record.deleted', payload: { programId, recordId, templateId } });
    }
    // Сервис удаляет через deleteMany с фильтром — id и программу берём из условия
    if (operation === 'deleteMany' && typeof r.count === 'number' && r.count > 0) {
      const wProgram = str(where.programId);
      const wRecord = str(where.id);
      if (wProgram && wRecord) {
        out.push({
          event: 'entity.record.deleted',
          payload: { programId: wProgram, recordId: wRecord, templateId: str(where.templateId) },
        });
      }
    }
  }

  if (model === 'ProcessInstance' && operation === 'update') {
    const programId = str(r.programId);
    const instanceId = str(r.id);
    const templateId = str(r.templateId);
    if (programId && instanceId && templateId) {
      if ('currentStageId' in data && str(r.currentStageId)) {
        out.push({
          event: 'process.instance.moved',
          payload: { programId, instanceId, templateId, toStageId: str(r.currentStageId) },
        });
      }
      if ('status' in data && str(r.status)) {
        out.push({
          event: 'process.instance.statusChanged',
          payload: { programId, instanceId, templateId, status: str(r.status) },
        });
      }
    }
  }

  if (model === 'Task') {
    const programId = str(r.programId);
    const taskId = str(r.id);
    if (programId && taskId) {
      if (operation === 'create') out.push({ event: 'task.created', payload: { programId, taskId } });
      if (operation === 'update' && data.status === 'done' && r.status === 'done') {
        out.push({ event: 'task.completed', payload: { programId, taskId } });
      }
    }
  }

  return out;
}
