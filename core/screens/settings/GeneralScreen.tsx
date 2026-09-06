import { requirePageAccess } from '../../auth/page-guard';
import GeneralClient from './GeneralClient';

export default async function GeneralScreen() {
  await requirePageAccess('settings.manage');
  return <GeneralClient />;
}
