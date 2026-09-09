/**
 * Сводка главного экрана (Р-39) — реальные счётчики вместо статичной
 * заглушки первого шага. Держится тонким: собирает то, что уже посчитано
 * в сервисах сущностей/процессов/задач, а не изобретает свой способ счёта.
 */
import { prisma } from '../data/prisma';
import { listTemplates } from '../entities/service';
import { listTemplates as listProcessTemplates } from '../processes/service';
import { isModuleEnabled } from '../modules/toggles';
import { listTasks } from '../tasks/service';
import type { DashboardSummary } from './types';

export async function getDashboardSummary(programId: string, userId: string): Promise<DashboardSummary> {
  const [usersCount, rolesCount, entityTemplates, processTemplates, tasksEnabled] = await Promise.all([
    prisma.user.count({ where: { programId, isActive: true } }),
    prisma.role.count({ where: { programId } }),
    listTemplates(programId),
    listProcessTemplates(programId),
    isModuleEnabled(programId, 'tasks'),
  ]);

  const entities = await Promise.all(
    entityTemplates.map(async (t) => ({
      key: t.key,
      namePlural: t.namePlural,
      recordCount: await prisma.entityRecord.count({ where: { templateId: t.id } }),
    }))
  );

  const processes = await Promise.all(
    processTemplates.map(async (t) => ({
      key: t.key,
      name: t.name,
      activeCount: await prisma.processInstance.count({ where: { templateId: t.id, status: 'active' } }),
    }))
  );

  let myOpenTasksCount = 0;
  let myOverdueTasksCount = 0;
  let myTasks: DashboardSummary['myTasks'] = [];

  if (tasksEnabled) {
    const [openCount, overdueCount, tasks] = await Promise.all([
      prisma.task.count({ where: { programId, assigneeId: userId, status: 'open' } }),
      prisma.task.count({ where: { programId, assigneeId: userId, status: 'open', dueAt: { lt: new Date() } } }),
      listTasks(programId, { assigneeId: userId }),
    ]);
    myOpenTasksCount = openCount;
    myOverdueTasksCount = overdueCount;
    myTasks = tasks.slice(0, 5);
  }

  return {
    usersCount,
    rolesCount,
    entities,
    processes,
    tasksEnabled,
    myOpenTasksCount,
    myOverdueTasksCount,
    myTasks,
  };
}
