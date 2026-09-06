import { requirePageAccess } from '../../auth/page-guard';
import LicenseClient from './LicenseClient';

export default async function LicenseScreen() {
  await requirePageAccess('settings.manage');
  return <LicenseClient />;
}
