import { redirect } from 'next/navigation';
import { requirePageAccess } from '../auth/page-guard';
import { isModuleEnabled } from '../modules/toggles';
import AiConsultClient from './AiConsultClient';

export default async function AiConsultScreen() {
  const user = await requirePageAccess('ai.use');
  if (!(await isModuleEnabled(user.programId, 'ai'))) redirect('/home');
  return <AiConsultClient />;
}
