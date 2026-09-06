import { requirePageAccess } from '../auth/page-guard';
import ProcessBoardClient from './ProcessBoardClient';

export default async function ProcessBoardScreen({ params }: { params: { key: string } }) {
  await requirePageAccess('processes.manage');
  return <ProcessBoardClient templateKey={params.key} />;
}
