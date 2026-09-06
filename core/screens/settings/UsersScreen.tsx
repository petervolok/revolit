import { requirePageAccess } from '../../auth/page-guard';
import UsersClient from './UsersClient';

export default async function UsersScreen() {
  await requirePageAccess('users.view');
  return <UsersClient />;
}
