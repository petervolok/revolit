export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../../../auth/guard';
import { toggleChecklistItem, ProcessError } from '../../../../processes/service';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requirePermission('processes.manage');
  if (isDenied(guard)) return guard.response;

  const { stageId, itemIndex, checked } = await req.json().catch(() => ({}));
  if (typeof stageId !== 'string' || typeof itemIndex !== 'number') {
    return NextResponse.json({ error: 'Некорректные данные' }, { status: 400 });
  }

  try {
    const instance = await toggleChecklistItem(guard.user.programId, params.id, {
      stageId,
      itemIndex,
      checked: Boolean(checked),
    });
    return NextResponse.json(instance);
  } catch (error) {
    if (error instanceof ProcessError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
