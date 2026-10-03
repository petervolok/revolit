/**
 * Автоматизации (строка 8 таблицы покрытия): «когда случилось X и выполнено условие — сделать Y».
 * Описания общие для сервера и браузера.
 */
import type { RecordFilter } from '../entities/query';

export type TriggerType = 'record.created' | 'record.updated' | 'record.deleted' | 'schedule';

export const TRIGGER_LABELS: Record<TriggerType, string> = {
  'record.created': 'Запись создана',
  'record.updated': 'Запись изменена',
  'record.deleted': 'Запись удалена',
  schedule: 'По расписанию',
};

export interface Trigger {
  type: TriggerType;
  /** Сущность, за которой следим (для событий записей) */
  templateKey?: string;
  /** Расписание в формате cron из 5 полей (для schedule) */
  cron?: string;
}

export type ActionType = 'set_fields' | 'create_record' | 'create_task' | 'send_email' | 'webhook';

export const ACTION_LABELS: Record<ActionType, string> = {
  set_fields: 'Изменить поля записи',
  create_record: 'Создать запись',
  create_task: 'Создать задачу',
  send_email: 'Отправить письмо',
  webhook: 'Вызвать веб-адрес (вебхук)',
};

export type Action =
  | { type: 'set_fields'; fields: Record<string, unknown> }
  | { type: 'create_record'; templateKey: string; fields: Record<string, unknown> }
  | { type: 'create_task'; title: string; description?: string; assigneeId?: string; dueInDays?: number }
  | { type: 'send_email'; to: string; subject: string; body: string }
  | { type: 'webhook'; url: string; secret?: string; body?: string };

export interface AutomationDef {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  trigger: Trigger;
  conditions: RecordFilter[];
  actions: Action[];
  runCount: number;
  lastRunAt: string | null;
  lastStatus: string | null;
  createdAt: string;
}

export interface AutomationInput {
  name?: unknown;
  description?: unknown;
  enabled?: unknown;
  trigger?: unknown;
  conditions?: unknown;
  actions?: unknown;
}

export interface RunStep {
  type: string;
  ok: boolean;
  message: string;
}

export interface AutomationRunDef {
  id: string;
  status: 'ok' | 'error' | 'skipped';
  startedAt: string;
  durationMs: number;
  recordId: string | null;
  message: string | null;
  steps: RunStep[];
}
