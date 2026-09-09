import { ListTodo } from 'lucide-react';
import type { ModuleManifest } from './types';

/**
 * Задачи и напоминания — подключаемый модуль (Р-37). Честная оговорка:
 * напоминание держится на том, что сотрудник сам открывает раздел и видит
 * просроченное — почтовых и push-уведомлений о сроке здесь нет.
 */
export const tasksModule: ModuleManifest = {
  key: 'tasks',
  name: 'Задачи',
  version: '1.0.0',
  requiresCore: '>=1.0.0',
  description: 'Личные задачи с необязательной привязкой к записи или делу',

  permissions: [{ key: 'tasks.use', label: 'Работа с задачами', group: 'Плагины' }],

  menu: [
    {
      section: 'main',
      key: 'tasks',
      label: 'Задачи',
      href: '/tasks',
      icon: ListTodo,
      order: 40,
      permission: 'tasks.use',
    },
  ],
};
