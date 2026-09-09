import { redirect } from 'next/navigation';
import { getCurrentUser } from '../auth/session';
import { getDashboardSummary } from '../dashboard/service';
import HomeClient from './HomeClient';

/** Главный экран — реальная сводка по программе вместо статичной заглушки первого шага (Р-39) */
export default async function HomeScreen() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const summary = await getDashboardSummary(user.programId, user.id);
  return <HomeClient summary={summary} userName={user.name} />;
}
