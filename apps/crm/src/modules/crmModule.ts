import { Home } from 'lucide-react';
import type { ModuleManifest } from '@revolit/core';

/**
 * Модуль CRM. Пока приносит только главную страницу —
 * сущности и рабочие места появятся на следующем шаге.
 */
export const crmModule: ModuleManifest = {
  key: 'crm',
  name: 'Конструктор CRM',
  version: '0.1.0',
  requiresCore: '>=1.0.0',
  description: 'Сборка корпоративных систем из сущностей и рабочих мест',

  menu: [
    {
      section: 'main',
      sectionOrder: 10,
      key: 'home',
      label: 'Главная',
      href: '/home',
      icon: Home,
      order: 10,
    },
  ],

  register({ events }) {
    // Пример подписки: модуль узнаёт о событиях ядра, ядро о модуле — нет
    events.on('user.created', ({ email }) => {
      console.log(`[crm] в программе появился сотрудник ${email}`);
    });
  },
};
