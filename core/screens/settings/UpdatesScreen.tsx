import { requirePageAccess } from '../../auth/page-guard';
import UpdatesClient from './UpdatesClient';

export default async function UpdatesScreen() {
  await requirePageAccess('settings.manage');
  return <UpdatesClient />;
}
