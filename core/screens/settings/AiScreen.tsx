import { requirePageAccess } from '../../auth/page-guard';
import AiSettingsClient from './AiSettingsClient';

export default async function AiScreen() {
  await requirePageAccess('settings.manage');
  return <AiSettingsClient />;
}
