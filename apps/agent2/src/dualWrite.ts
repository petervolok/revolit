/**
 * Решение «дублировать ли эту операцию в БД №1» (docs/11b, раздел 3). Всегда исполняется
 * по-настоящему на своей БД №2 первой (это источник истины) — дублирование в БД №1 идёт
 * ВТОРЫМ шагом, отдельным подключением (docs/08-decisions.md, Р-41), и только если решение
 * положительное. Сбой дублирования не должен отменять уже случившуюся запись в БД №2.
 */
import type { DataOperation } from '../../../core/data/port';
import type { AgentPrismaClient } from './client';
import { evaluateRecordSensitivity, isRecordSensitive } from './sensitivity';

/** Модели, где чувствительность вообще имеет смысл проверять — остальные зеркалятся всегда */
const RECORD_LINKED = new Set(['ProcessInstance', 'Task', 'Attachment']);

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Вызывать ДО исполнения на БД №2 — для delete/deleteMany нужен «снимок» данных, пока
 * запись ещё существует. Для остальных операций возвращает null (решение примут после).
 */
export async function captureBeforeState(db2: AgentPrismaClient, op: DataOperation): Promise<Rec | null> {
  if (!['delete', 'deleteMany'].includes(op.operation)) return null;

  const where = isRec(op.args) && isRec(op.args.where) ? op.args.where : {};
  if (op.model === 'EntityRecord') {
    const row = await db2.entityRecord.findFirst({ where: where as never, include: { template: { select: { key: true } } } });
    return row as unknown as Rec | null;
  }
  if (RECORD_LINKED.has(op.model)) {
    const delegate = (db2 as unknown as Record<string, { findFirst: (a: unknown) => Promise<unknown> }>)[
      op.model.charAt(0).toLowerCase() + op.model.slice(1)
    ];
    return (await delegate.findFirst({ where })) as Rec | null;
  }
  return null;
}

/** Решает, дублировать ли операцию в БД №1. `before` — снимок из captureBeforeState (для delete). */
export async function shouldMirrorToPrimary(db2: AgentPrismaClient, op: DataOperation, result: unknown, before: Rec | null): Promise<boolean> {
  if (op.model === 'EntityRecord') {
    if (op.operation === 'create') {
      const data = isRec(op.args) && isRec(op.args.data) ? op.args.data : {};
      const template = await db2.entityTemplate.findUnique({ where: { id: String(data.templateId) }, select: { key: true } });
      if (!template) return true; // не должно случиться, но лучше показать, чем молча спрятать
      return !(await evaluateRecordSensitivity(db2, String(data.programId), template.key, (data.data as Rec) ?? {}));
    }
    if (op.operation === 'update') {
      const row = result as { templateId?: string; programId?: string; data?: unknown } | null;
      if (!row?.templateId) return true;
      const template = await db2.entityTemplate.findUnique({ where: { id: row.templateId }, select: { key: true } });
      if (!template) return true;
      return !(await evaluateRecordSensitivity(db2, String(row.programId), template.key, (row.data as Rec) ?? {}));
    }
    if (op.operation === 'delete' || op.operation === 'deleteMany') {
      const row = before as { template?: { key: string }; programId?: string; data?: unknown } | null;
      if (!row?.template) return true; // записи уже не было — дублируем как есть, вреда нет
      return !(await evaluateRecordSensitivity(db2, String(row.programId), row.template.key, (row.data as Rec) ?? {}));
    }
  }

  if (RECORD_LINKED.has(op.model)) {
    const programId = (isRec(op.args) && isRec(op.args.data) ? op.args.data.programId : before?.programId) as string | undefined;
    let entityRecordId: string | null | undefined;
    if (op.operation === 'create') {
      entityRecordId = isRec(op.args) && isRec(op.args.data) ? (op.args.data.entityRecordId as string | null) : null;
    } else {
      entityRecordId = (before?.entityRecordId as string | null | undefined) ?? null;
    }
    if (!programId) return true;
    return !(await isRecordSensitive(db2, programId, entityRecordId));
  }

  // Прочие доменные модели (шаблоны, этапы, история переходов) сами по себе не несут
  // бизнес-данных клиента, которые нужно прятать, — зеркалятся всегда
  return true;
}
