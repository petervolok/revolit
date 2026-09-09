'use client';

import { AppShell, buildEntityNavSection, buildProcessNavSection, type EntityNavSource, type ProcessNavSource } from '@revolit/core';
import type { NavSection } from '@revolit/core';
import { registry } from '@/modules';

interface AppChromeProps {
  children: React.ReactNode;
  programName: string;
  user: { name: string; email: string; role: string };
  permissions: string[];
  /** Сущности программы — приходят из базы, а не из вклада модуля */
  entityLinks: EntityNavSource[];
  /** Процессы программы — тем же приёмом, что и сущности */
  processLinks: ProcessNavSource[];
  /** Ключи модулей, выключенных в «Плагинах» (Р-34) */
  disabledModules: string[];
}

/**
 * Оболочка приложения. Меню собирается из реестра модулей здесь, на стороне
 * браузера: в пунктах меню лежат значки-компоненты, которые нельзя передать
 * с сервера. Разделы сущностей и процессов достраиваются отдельно перед
 * «Администрированием» — они не проходят через реестр вкладов, так как
 * создаются в интерфейсе, а не в коде.
 */
export default function AppChrome({ children, programName, user, permissions, entityLinks, processLinks, disabledModules }: AppChromeProps) {
  const sections = registry.menu(permissions, new Set(disabledModules));
  const dynamicSections = [buildProcessNavSection(processLinks), buildEntityNavSection(entityLinks)].filter(
    (s): s is NavSection => s !== null
  );

  const adminIndex = sections.findIndex((s) => s.key === 'admin');
  const merged =
    dynamicSections.length === 0
      ? sections
      : adminIndex === -1
        ? [...sections, ...dynamicSections]
        : [...sections.slice(0, adminIndex), ...dynamicSections, ...sections.slice(adminIndex)];

  return (
    <AppShell programName={programName} user={user} sections={merged}>
      {children}
    </AppShell>
  );
}
