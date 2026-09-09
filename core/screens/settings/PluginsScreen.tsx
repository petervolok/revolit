import { requirePageAccess } from '../../auth/page-guard';
import PluginsClient from './PluginsClient';

export default async function PluginsScreen() {
  await requirePageAccess('settings.manage');
  return <PluginsClient />;
}
