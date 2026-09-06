import { requirePageAccess } from '../../auth/page-guard';
import PresetFieldsClient from './PresetFieldsClient';

export default async function PresetFieldsScreen({ params }: { params: { key: string } }) {
  await requirePageAccess('entities.manage');
  return <PresetFieldsClient presetKey={params.key} />;
}
