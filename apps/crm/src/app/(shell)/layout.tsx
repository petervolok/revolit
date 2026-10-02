import { redirect } from 'next/navigation';
import {
  getCurrentProgram,
  getCurrentUser,
  hasPermission,
  listDisabledModuleKeys,
  listProcessTemplates,
  listTemplatesFor,
} from '@revolit/core/server';
import AppChrome from '@/shell/AppChrome';
import '@/modules';

export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const program = await getCurrentProgram();

  // Пункты меню сущностей и процессов собираются здесь: они живут в базе,
  // а не в коде модуля, поэтому реестр вкладов о них не знает —
  // см. core/entities/nav.ts и core/processes/nav.ts.
  const entityLinks = (await listTemplatesFor(user.programId, user)).map((t) => ({ key: t.key, namePlural: t.namePlural }));

  const processLinks = hasPermission(user, 'processes.manage')
    ? (await listProcessTemplates(user.programId)).map((p) => ({ key: p.key, name: p.name }))
    : [];

  const disabledModules = [...(await listDisabledModuleKeys(user.programId))];

  // Лаборатория кубиков (docs/12-template-constructor-progress.md) — не часть обычной
  // поставки, пункт меню виден только когда явно включена переменной окружения.
  const labEnabled = process.env.LAB_ENABLED === '1' && hasPermission(user, 'entities.manage');

  return (
    <AppChrome
      programName={program?.name ?? 'Программа'}
      user={{
        name: user.name,
        email: user.email,
        role: user.roles.map((r) => r.name).join(', ') || 'Без роли',
      }}
      permissions={user.permissions}
      entityLinks={entityLinks}
      processLinks={processLinks}
      disabledModules={disabledModules}
      labEnabled={labEnabled}
    >
      {children}
    </AppChrome>
  );
}
