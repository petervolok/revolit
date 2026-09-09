/** Описания задач — общие для сервера и браузера (Р-37) */

export type TaskStatus = 'open' | 'done';

export interface TaskUserRef {
  id: string;
  name: string;
}

export interface TaskDef {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  dueAt: string | null;
  doneAt: string | null;
  assignee: TaskUserRef | null;
  createdBy: TaskUserRef | null;
  entityRecordId: string | null;
  entityRecordLabel: string | null;
  entityTemplateKey: string | null;
  processInstanceId: string | null;
  processInstanceTitle: string | null;
  processTemplateKey: string | null;
  createdAt: string;
  updatedAt: string;
}
