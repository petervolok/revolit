import { Workflow } from 'lucide-react';
import type { NavSection } from '../shell/navModel';

/** То немногое о процессе, что нужно для пункта меню */
export interface ProcessNavSource {
  key: string;
  name: string;
}

/**
 * Собирает раздел меню из списка процессов программы — тем же приёмом,
 * что и сущности (см. core/entities/nav.ts): процессы создаются в интерфейсе,
 * а не в коде, поэтому идут в обход реестра вкладов.
 */
export function buildProcessNavSection(processes: ProcessNavSource[]): NavSection | null {
  if (processes.length === 0) return null;

  return {
    key: 'processes',
    title: 'Процессы',
    items: processes.map((p) => ({
      key: `process-${p.key}`,
      label: p.name,
      href: `/processes/${p.key}`,
      icon: Workflow,
    })),
  };
}
