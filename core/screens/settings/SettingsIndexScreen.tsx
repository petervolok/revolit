import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { getCurrentUser } from '../../auth/session';
import { getRegistry } from '../../modules/current';

/** Карточки разделов собираются из вкладов подключённых модулей */
export default async function SettingsIndexScreen() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const available = getRegistry().settings(user.permissions);
  if (available.length === 0) redirect('/home');

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-7">
        <h2 className="text-xl font-semibold tracking-tight text-ink">Настройки</h2>
        <p className="mt-1 text-sm text-ink-muted">Управление программой и доступом сотрудников</p>
      </div>

      <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {available.map((group) => (
          <Link
            key={group.key}
            href={group.href}
            className="flex items-center gap-4 px-4 py-4 transition-colors hover:bg-surface-muted"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-ink-muted">
              <group.icon className="h-[18px] w-[18px]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">{group.title}</p>
              <p className="mt-0.5 text-[13px] text-ink-muted">{group.description}</p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />
          </Link>
        ))}
      </div>
    </div>
  );
}
