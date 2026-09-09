/** Описания сводки главного экрана — общие для сервера и браузера (Р-39) */
import type { TaskDef } from '../tasks/types';

export interface DashboardEntitySummary {
  key: string;
  namePlural: string;
  recordCount: number;
}

export interface DashboardProcessSummary {
  key: string;
  name: string;
  activeCount: number;
}

export interface DashboardSummary {
  usersCount: number;
  rolesCount: number;
  entities: DashboardEntitySummary[];
  processes: DashboardProcessSummary[];
  tasksEnabled: boolean;
  myOpenTasksCount: number;
  myOverdueTasksCount: number;
  myTasks: TaskDef[];
}
