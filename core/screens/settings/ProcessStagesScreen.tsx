import { requirePageAccess } from '../../auth/page-guard';
import ProcessStagesClient from './ProcessStagesClient';

export default async function ProcessStagesScreen({ params }: { params: { key: string } }) {
  await requirePageAccess('processes.manage');
  return <ProcessStagesClient templateKey={params.key} />;
}
