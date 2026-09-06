export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../../../auth/guard';
import { moveInstance, ProcessError } from '../../../../processes/service';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requirePermission('processes.manage');
  if (isDenied(guard)) return guard.response;

  const { toStageId } = await req.json().catch(() => ({}));
  if (typeof toStageId !== 'string' || !toStageId) {
    return NextResponse.json({ error: 'Укажите этап' }, { status: 400 });
  }

  try {
    const instance = await moveInstance(guard.user.programId, params.id, { toStageId, actorEmail: guard.user.email });
    return NextResponse.json(instance);
  } catch (error) {
    if (error instanceof ProcessError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
