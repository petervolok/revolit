import { redirect } from 'next/navigation';
import { requirePageAccess } from '../auth/page-guard';
import { isModuleEnabled } from '../modules/toggles';
import TasksClient from './TasksClient';

export default async function TasksScreen() {
  const user = await requirePageAccess('tasks.use');
  if (!(await isModuleEnabled(user.programId, 'tasks'))) redirect('/home');
  return <TasksClient currentUserId={user.id} />;
}
