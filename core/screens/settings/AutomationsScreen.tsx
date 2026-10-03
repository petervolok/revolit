import { requirePageAccess } from '../../auth/page-guard';
import AutomationsClient from './AutomationsClient';

export default async function AutomationsScreen() {
  await requirePageAccess('automations.manage');
  return <AutomationsClient />;
}
