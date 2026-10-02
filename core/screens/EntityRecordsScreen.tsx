import { redirect } from 'next/navigation';
import { getCurrentUser } from '../auth/session';
import { readableTemplateIds } from '../entities/access';
import { prisma } from '../data/prisma';
import EntityRecordsClient from './EntityRecordsClient';

export default async function EntityRecordsScreen({ params }: { params: { key: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  // Раздел открывается тем, у кого есть право на просмотр этой сущности (право entities.manage открывает все)
  const readable = await readableTemplateIds(user);
  if (readable !== 'all') {
    const template = await prisma.entityTemplate.findUnique({ where: { programId_key: { programId: user.programId, key: params.key } } });
    if (!template || !readable.has(template.id)) redirect('/home');
  }
  return <EntityRecordsClient templateKey={params.key} />;
}
