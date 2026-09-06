export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../../../../auth/guard';
import { reorderStages, ProcessError } from '../../../../../processes/service';

export async function POST(req: NextRequest, { params }: { params: { key: string } }) {
  const guard = await requirePermission('processes.manage');
  if (isDenied(guard)) return guard.response;

  const { stageIds } = await req.json().catch(() => ({}));
  if (!Array.isArray(stageIds) || stageIds.some((id) => typeof id !== 'string')) {
    return NextResponse.json({ error: 'Некорректный порядок этапов' }, { status: 400 });
  }

  try {
    const template = await reorderStages(guard.user.programId, params.key, stageIds);
    return NextResponse.json(template);
  } catch (error) {
    if (error instanceof ProcessError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
