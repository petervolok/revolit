'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import type { NavSection } from './navModel';

const COLLAPSE_KEY = 'revolit.sidebar.collapsed';

interface AppShellProps {
  children: React.ReactNode;
  programName: string;
  user: { name: string; email: string; role: string };
  /** Разделы меню, собранные из подключённых модулей */
  sections: NavSection[];
}

/** Заголовок берём из пункта меню, которому соответствует адрес */
function titleFor(sections: NavSection[], pathname: string): string {
  // Сначала собираем плоский список пунктов, потом выбираем самый точный.
  // Без вложенной функции намеренно: присваивание внутри неё TypeScript
  // при выводе типов не учитывает, и переменная считается всегда пустой.
  const candidates: { label: string; href: string }[] = [];
  for (const section of sections) {
    for (const item of section.items) {
      candidates.push({ label: item.label, href: item.href });
      for (const child of item.children ?? []) {
        candidates.push({ label: child.label, href: child.href });
      }
    }
  }

  let bestLabel = 'Программа';
  let bestLength = -1;
  for (const c of candidates) {
    if (pathname !== c.href && !pathname.startsWith(c.href + '/')) continue;
    if (c.href.length > bestLength) {
      bestLabel = c.label;
      bestLength = c.href.length;
    }
  }

  return bestLabel;
}

export default function AppShell({ children, programName, user, sections }: AppShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // Состояние меню запоминается между визитами
  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1');
  }, []);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
  };

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <Sidebar
        sections={sections}
        programName={programName}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar title={titleFor(sections, pathname)} user={user} />
        <main className="scrollbar-thin flex-1 overflow-y-auto bg-surface-muted/40">{children}</main>
      </div>
    </div>
  );
}
