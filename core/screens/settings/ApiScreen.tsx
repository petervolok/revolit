import { requirePageAccess } from '../../auth/page-guard';
import ApiClient from './ApiClient';

export default async function ApiScreen() {
  await requirePageAccess('api.manage');
  return <ApiClient />;
}
