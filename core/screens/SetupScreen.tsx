import { redirect } from 'next/navigation';
import { prisma } from '../data/prisma';
import SetupClient from './SetupClient';

/** Мастер первого запуска. Если установка уже выполнена — сюда больше не попасть (Р-24). */
export default async function SetupScreen() {
  const existing = await prisma.program.findFirst();
  if (existing) redirect('/login');

  return <SetupClient />;
}
