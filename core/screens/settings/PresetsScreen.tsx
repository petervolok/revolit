import { requirePageAccess } from '../../auth/page-guard';
import PresetsClient from './PresetsClient';

export default async function PresetsScreen() {
  await requirePageAccess('entities.manage');
  return <PresetsClient />;
}
