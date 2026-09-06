'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '../utils/cn';
import type { NavSection } from './navModel';

interface SidebarProps {
  sections: NavSection[];
  programName: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export default function Sidebar({ sections, programName, collapsed, onToggleCollapsed }: SidebarProps) {
  const pathname = usePathname();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-line bg-surface-muted',
        'transition-[width] duration-200 ease-smooth',
        collapsed ? 'w-[64px]' : 'w-[248px]'
      )}
    >
      {/* Шапка с названием программы */}
      <div className={cn('flex h-14 items-center border-b border-line', collapsed ? 'justify-center px-2' : 'gap-2.5 px-4')}>
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand text-[13px] font-semibold text-white">
          {programName.slice(0, 1).toUpperCase()}
        </div>
        {!collapsed && <span className="truncate text-[14px] font-semibold text-ink">{programName}</span>}
      </div>

      {/* Пункты меню */}
      <nav className="scrollbar-thin flex-1 overflow-y-auto px-2 py-3">
        {sections.map((section, index) => (
          <div key={section.key} className={cn(index > 0 && 'mt-5')}>
            {section.title && !collapsed && (
              <p className="mb-1.5 px-2.5 text-2xs font-semibold uppercase tracking-wider text-ink-faint">
                {section.title}
              </p>
            )}
            {section.title && collapsed && index > 0 && <div className="mx-2 mb-2 h-px bg-line" />}

            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                const hasChildren = !!item.children?.length;
                const groupOpen = openGroups[item.key] ?? active;

                return (
                  <li key={item.key}>
                    <div className="flex items-center">
                      <Link
                        href={item.href}
                        title={collapsed ? item.label : undefined}
                        className={cn(
                          'group flex h-8 flex-1 items-center rounded-md text-[13px] font-medium transition-colors',
                          collapsed ? 'justify-center px-0' : 'gap-2.5 px-2.5',
                          active
                            ? 'bg-brand-soft text-brand'
                            : 'text-ink-muted hover:bg-line/50 hover:text-ink'
                        )}
                      >
                        <Icon className="h-[17px] w-[17px] shrink-0" />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                        {!collapsed && item.badge !== undefined && (
                          <span className="ml-auto rounded-full bg-line px-1.5 py-0.5 text-2xs font-semibold text-ink-muted">
                            {item.badge}
                          </span>
                        )}
                      </Link>

                      {hasChildren && !collapsed && (
                        <button
                          onClick={() => setOpenGroups((s) => ({ ...s, [item.key]: !groupOpen }))}
                          aria-label={groupOpen ? 'Свернуть' : 'Развернуть'}
                          className="ml-0.5 rounded p-1 text-ink-faint transition-colors hover:bg-line/50 hover:text-ink"
                        >
                          <ChevronDown
                            className={cn('h-3.5 w-3.5 transition-transform', groupOpen && 'rotate-180')}
                          />
                        </button>
                      )}
                    </div>

                    {hasChildren && !collapsed && groupOpen && (
                      <ul className="ml-[19px] mt-0.5 space-y-0.5 border-l border-line pl-2.5">
                        {item.children!.map((child) => (
                          <li key={child.key}>
                            <Link
                              href={child.href}
                              className={cn(
                                'flex h-7 items-center rounded-md px-2.5 text-[13px] transition-colors',
                                isActive(child.href)
                                  ? 'font-medium text-brand'
                                  : 'text-ink-muted hover:bg-line/50 hover:text-ink'
                              )}
                            >
                              <span className="truncate">{child.label}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        {sections.every((s) => s.items.length === 0) && !collapsed && (
          <p className="px-2.5 py-4 text-[13px] leading-relaxed text-ink-faint">
            Здесь появятся разделы программы, когда вы добавите сущности в конструкторе.
          </p>
        )}
      </nav>

      {/* Кнопка сворачивания */}
      <div className={cn('border-t border-line p-2', collapsed && 'flex justify-center')}>
        <button
          onClick={onToggleCollapsed}
          title={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
          className={cn(
            'flex h-8 items-center rounded-md text-[13px] font-medium text-ink-muted transition-colors',
            'hover:bg-line/50 hover:text-ink',
            collapsed ? 'w-8 justify-center' : 'w-full gap-2.5 px-2.5'
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-[17px] w-[17px]" />
          ) : (
            <>
              <PanelLeftClose className="h-[17px] w-[17px]" />
              <span>Свернуть</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
