/** Описания конструктора процессов — общие для сервера и браузера (Р-32) */

export interface ChecklistItem {
  label: string;
}

export interface ProcessStageDef {
  id: string;
  order: number;
  name: string;
  responsible: string | null;
  regulation: string | null;
  checklist: ChecklistItem[];
}

export interface ProcessTemplateDef {
  id: string;
  key: string;
  name: string;
  stages: ProcessStageDef[];
  /** Есть хотя бы одно дело — структуру этапов больше не менять (Р-32 → следствие Р-19) */
  hasInstances: boolean;
}

export interface ProcessHistoryEntryDef {
  id: string;
  fromStageId: string | null;
  toStageId: string;
  actorEmail: string | null;
  note: string | null;
  createdAt: string;
}

export type ProcessInstanceStatus = 'active' | 'done' | 'cancelled';

/** Отметки по чек-листу: ключ этапа → индекс пункта → отмечен ли */
export type ChecklistState = Record<string, Record<number, boolean>>;

export interface ProcessInstanceDef {
  id: string;
  templateId: string;
  title: string;
  currentStageId: string;
  status: ProcessInstanceStatus;
  checklistState: ChecklistState;
  createdAt: string;
  updatedAt: string;
}

export interface ProcessInstanceWithHistory extends ProcessInstanceDef {
  history: ProcessHistoryEntryDef[];
}
