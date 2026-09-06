import { requirePageAccess } from '../../auth/page-guard';
import EntityFieldsClient from './EntityFieldsClient';

export default async function EntityFieldsScreen({ params }: { params: { key: string } }) {
  await requirePageAccess('entities.manage');
  return <EntityFieldsClient templateKey={params.key} />;
}
