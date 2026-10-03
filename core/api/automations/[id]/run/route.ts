export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../../../auth/guard';
import { runManually } from '../../../../automations/engine';

/** Проверочный запуск правила на выбранной записи (действия выполняются по-настоящему) */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requirePermission('automations.manage');
  if (isDenied(guard)) return guard.response;

  const body = await req.json().catch(() => ({}));
  const recordId = typeof body.recordId === 'string' && body.recordId ? body.recordId : undefined;

  try {
    return NextResponse.json(await runManually(guard.user.programId, params.id, recordId));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
