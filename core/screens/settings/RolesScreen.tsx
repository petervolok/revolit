import { requirePageAccess } from '../../auth/page-guard';
import { permissionGroups } from '../../auth/permissions';
import RolesClient from './RolesClient';

export default async function RolesScreen() {
  await requirePageAccess('roles.view');
  // Список прав зависит от подключённых модулей, поэтому собирается на сервере
  return <RolesClient permissionGroups={permissionGroups()} />;
}
