import { notFound } from 'next/navigation';
import { requirePageAccess } from '@revolit/core/auth/page-guard';
import LabApp from '@/lab/LabApp';

// Лаборатория кубиков (docs/12-template-constructor-progress.md): не входит в обычную
// поставку сервера №1 — включается только явной переменной окружения. Живёт внутри
// настоящей оболочки Revolit (тот же вход, тот же сайдбар), а не отдельным сайтом.
export const dynamic = 'force-dynamic';

export default async function LabPage() {
  if (process.env.LAB_ENABLED !== '1') notFound();
  await requirePageAccess('entities.manage');
  return <LabApp />;
}
