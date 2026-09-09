import { Sparkles } from 'lucide-react';
import type { ModuleManifest } from './types';

/**
 * ИИ-консультант вынесен из ядра в отдельный подключаемый модуль (Р-34) —
 * его можно выключить в «Плагинах», не трогая остальную систему.
 * Своей записи в дереве «Настройки» намеренно нет: не у ядра, а у плагина
 * нет доступа к чужому списку children — обнаруживается через карточку
 * на странице «Настройки» (см. settings ниже) и через сам пункт в меню.
 */
export const aiModule: ModuleManifest = {
  key: 'ai',
  name: 'ИИ-консультант',
  version: '1.0.0',
  requiresCore: '>=1.0.0',
  description: 'Консультации сотрудникам по работе в системе на основе своего ключа ИИ',

  permissions: [
    // Настройка ключа — settings.manage (ядро), а обращение к самому
    // консультанту — отдельное право модуля (Р-33)
    { key: 'ai.use', label: 'Обращение к ИИ-консультанту', group: 'Плагины' },
  ],

  menu: [
    {
      section: 'main',
      key: 'ai-consultant',
      label: 'ИИ-консультант',
      href: '/ai-consultant',
      icon: Sparkles,
      order: 50,
      permission: 'ai.use',
    },
  ],

  settings: [
    {
      key: 'ai',
      title: 'ИИ-консультант',
      description: 'Свой ключ ИИ для подсказок сотрудникам',
      href: '/settings/ai',
      icon: Sparkles,
      permission: 'settings.manage',
      order: 80,
    },
  ],
};
