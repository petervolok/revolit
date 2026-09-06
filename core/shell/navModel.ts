import type { LucideIcon } from 'lucide-react';

export interface NavChild {
  key: string;
  label: string;
  href: string;
  /** Пункт виден только при наличии этого права */
  permission?: string;
}

export interface NavItem extends NavChild {
  icon: LucideIcon;
  badge?: number;
  children?: NavChild[];
}

export interface NavSection {
  key: string;
  /** Заголовок раздела; без него пункты идут без подписи сверху */
  title?: string;
  items: NavItem[];
}
