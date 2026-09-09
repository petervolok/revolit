import { BarChart3 } from 'lucide-react';
import type { ModuleManifest } from './types';

/**
 * Отчёты и диаграммы — подключаемый модуль (Р-34). Честная оговорка: считает
 * распределение записей по одному полю списка — не сводные таблицы и не
 * произвольная аналитика.
 */
export const reportsModule: ModuleManifest = {
  key: 'reports',
  name: 'Отчёты и диаграммы',
  version: '1.0.0',
  requiresCore: '>=1.0.0',
  description: 'Базовые отчёты по записям сущностей',

  permissions: [{ key: 'reports.view', label: 'Просмотр отчётов', group: 'Плагины' }],

  menu: [
    {
      section: 'main',
      key: 'reports',
      label: 'Отчёты',
      href: '/reports',
      icon: BarChart3,
      order: 60,
      permission: 'reports.view',
    },
  ],
};
