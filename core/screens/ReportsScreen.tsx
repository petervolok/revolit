import { requirePageAccess } from '../auth/page-guard';
import ReportsClient from './ReportsClient';

export default async function ReportsScreen() {
  await requirePageAccess('reports.view');
  return <ReportsClient />;
}
