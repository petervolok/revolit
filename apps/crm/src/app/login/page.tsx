// Страница обращается к базе при каждом заходе — статически её не подготовить
export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getCurrentProgram } from '@revolit/core/server';
import LoginScreen from '@revolit/core/screens/LoginScreen';

/** Свежая установка без единой программы — вести на мастер, а не на вход (Р-24) */
export default async function LoginPage() {
  const program = await getCurrentProgram();
  if (!program) redirect('/setup');

  return <LoginScreen />;
}
