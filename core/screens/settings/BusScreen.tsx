import { requirePageAccess } from '../../auth/page-guard';
import BusClient from './BusClient';

export default async function BusScreen() {
  await requirePageAccess('settings.manage');
  return <BusClient />;
}
