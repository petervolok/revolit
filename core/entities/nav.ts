import { Boxes } from 'lucide-react';
import type { NavSection } from '../shell/navModel';

/** То немногое о сущности, что нужно для пункта меню — остальное сервер не отдаёт */
export interface EntityNavSource {
  key: string;
  namePlural: string;
}

/**
 * Собирает раздел меню из списка сущностей программы.
 *
 * Это не вклад модуля: сущности создаются в интерфейсе, а не в коде,
 * поэтому идут в обход реестра вкладов и добавляются к его результату
 * отдельно, уже на стороне браузера (см. AppChrome).
 *
 * Значок один на все сущности — выбор иконки на каждую пока не сделан,
 * это не обязательно для работы механизма.
 */
export function buildEntityNavSection(templates: EntityNavSource[]): NavSection | null {
  if (templates.length === 0) return null;

  return {
    key: 'entities',
    title: 'Данные',
    items: templates.map((t) => ({
      key: `entity-${t.key}`,
      label: t.namePlural,
      href: `/entities/${t.key}`,
      icon: Boxes,
    })),
  };
}
