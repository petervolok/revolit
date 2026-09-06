'use client';

import { AppShell, buildEntityNavSection, type EntityNavSource } from '@revolit/core';
import { registry } from '@/modules';

interface AppChromeProps {
  children: React.ReactNode;
  programName: string;
  user: { name: string; email: string; role: string };
  permissions: string[];
  /** Сущности программы — приходят из базы, а не из вклада модуля */
  entityLinks: EntityNavSource[];
}

/**
 * Оболочка приложения. Меню собирается из реестра модулей здесь, на стороне
 * браузера: в пунктах меню лежат значки-компоненты, которые нельзя передать
 * с сервера. Раздел с сущностями достраивается отдельно перед «Администрированием» —
 * он не проходит через реестр вкладов, так как создаётся в интерфейсе, а не в коде.
 */
export default function AppChrome({ children, programName, user, permissions, entityLinks }: AppChromeProps) {
  const sections = registry.menu(permissions);
  const entitySection = buildEntityNavSection(entityLinks);

  const adminIndex = sections.findIndex((s) => s.key === 'admin');
  const merged = entitySection
    ? adminIndex === -1
      ? [...sections, entitySection]
      : [...sections.slice(0, adminIndex), entitySection, ...sections.slice(adminIndex)]
    : sections;

  return (
    <AppShell programName={programName} user={user} sections={merged}>
      {children}
    </AppShell>
  );
}
