import { Boxes, KeyRound, RefreshCw, Settings, ShieldCheck, SlidersHorizontal, UserRound, Users2 } from 'lucide-react';
import { CORE_PERMISSIONS } from '../auth/permissions';
import type { ModuleManifest } from './types';

export const CORE_VERSION = '1.0.0';

/**
 * Само ядро описано как модуль — на тех же правилах, что и остальные.
 * Это проверка на честность: если механизм вкладов неудобен ядру,
 * он будет неудобен и сторонним разработчикам.
 */
export const coreModule: ModuleManifest = {
  key: 'core',
  name: 'Ядро',
  version: CORE_VERSION,
  requiresCore: `>=${CORE_VERSION}`,
  description: 'Оболочка, вход, роли, сотрудники, журнал действий',

  permissions: CORE_PERMISSIONS,

  menu: [
    {
      section: 'admin',
      sectionTitle: 'Администрирование',
      sectionOrder: 900,
      key: 'settings',
      label: 'Настройки',
      href: '/settings',
      icon: Settings,
      order: 10,
      children: [
        { key: 'users', label: 'Пользователи', href: '/settings/users', permission: 'users.view' },
        { key: 'roles', label: 'Роли и права', href: '/settings/roles', permission: 'roles.view' },
        { key: 'entities', label: 'Сущности', href: '/settings/entities', permission: 'entities.manage' },
        { key: 'general', label: 'Общие настройки', href: '/settings/general', permission: 'settings.manage' },
        { key: 'license', label: 'Лицензия', href: '/settings/license', permission: 'settings.manage' },
        { key: 'updates', label: 'Обновления', href: '/settings/updates', permission: 'settings.manage' },
      ],
    },
    {
      section: 'admin',
      key: 'profile',
      label: 'Мой профиль',
      href: '/profile',
      icon: UserRound,
      order: 20,
    },
  ],

  settings: [
    {
      key: 'users',
      title: 'Пользователи',
      description: 'Сотрудники программы, их доступ и назначенные роли',
      href: '/settings/users',
      icon: Users2,
      permission: 'users.view',
      order: 10,
    },
    {
      key: 'roles',
      title: 'Роли и права',
      description: 'Что доступно каждому рабочему месту',
      href: '/settings/roles',
      icon: ShieldCheck,
      permission: 'roles.view',
      order: 20,
    },
    {
      key: 'general',
      title: 'Общие настройки',
      description: 'Название программы, оформление, региональные параметры',
      href: '/settings/general',
      icon: SlidersHorizontal,
      permission: 'settings.manage',
      order: 30,
    },
    {
      key: 'entities',
      title: 'Сущности',
      description: 'Разделы данных программы: поля, типы, порядок',
      href: '/settings/entities',
      icon: Boxes,
      permission: 'entities.manage',
      order: 40,
    },
    {
      key: 'license',
      title: 'Лицензия',
      description: 'Ключ, открывающий платные модули',
      href: '/settings/license',
      icon: KeyRound,
      permission: 'settings.manage',
      order: 50,
    },
    {
      key: 'updates',
      title: 'Обновления',
      description: 'Проверка версии и присланных релизов',
      href: '/settings/updates',
      icon: RefreshCw,
      permission: 'settings.manage',
      order: 60,
    },
  ],
};
