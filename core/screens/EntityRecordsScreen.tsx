import { requirePageAccess } from '../auth/page-guard';
import EntityRecordsClient from './EntityRecordsClient';

export default async function EntityRecordsScreen({ params }: { params: { key: string } }) {
  await requirePageAccess('entities.manage');
  return <EntityRecordsClient templateKey={params.key} />;
}
