import { requirePageAccess } from '../../auth/page-guard';
import EntitiesClient from './EntitiesClient';

export default async function EntitiesScreen() {
  await requirePageAccess('entities.manage');
  return <EntitiesClient />;
}
