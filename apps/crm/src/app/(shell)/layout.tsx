import { redirect } from 'next/navigation';
import {
  getCurrentProgram,
  getCurrentUser,
  hasPermission,
  listDisabledModuleKeys,
  listProcessTemplates,
  listTemplates,
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
  const entityLinks = hasPermission(user, 'entities.manage')
    ? (await listTemplates(user.programId)).map((t) => ({ key: t.key, namePlural: t.namePlural }))
    : [];

  const processLinks = hasPermission(user, 'processes.manage')
    ? (await listProcessTemplates(user.programId)).map((p) => ({ key: p.key, name: p.name }))
    : [];

  const disabledModules = [...(await listDisabledModuleKeys(user.programId))];

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
    >
      {children}
    </AppChrome>
  );
}
