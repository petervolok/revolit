import { requirePageAccess } from '../../auth/page-guard';
import ProcessesClient from './ProcessesClient';

export default async function ProcessesScreen() {
  await requirePageAccess('processes.manage');
  return <ProcessesClient />;
}
