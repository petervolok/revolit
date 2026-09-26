import { notFound } from 'next/navigation';
import LabApp from '@/lab/LabApp';

// Лаборатория кубиков (docs/12-template-constructor-progress.md): вне боевого пути,
// включается только явной переменной окружения — в обычной установке маршрута «нет».
export const dynamic = 'force-dynamic';

export default function LabPage() {
  if (process.env.LAB_ENABLED !== '1') notFound();
  return <LabApp />;
}
