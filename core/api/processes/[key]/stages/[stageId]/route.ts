export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../../../../auth/guard';
import { removeStage, updateStage, ProcessError } from '../../../../../processes/service';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { key: string; stageId: string } }
) {
  const guard = await requirePermission('processes.manage');
  if (isDenied(guard)) return guard.response;

  const { name, responsible, regulation, checklist } = await req.json().catch(() => ({}));
  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Укажите название этапа' }, { status: 400 });
  }

  try {
    const template = await updateStage(guard.user.programId, params.key, params.stageId, {
      name,
      responsible,
      regulation,
      checklist,
    });
    return NextResponse.json(template);
  } catch (error) {
    if (error instanceof ProcessError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { key: string; stageId: string } }
) {
  const guard = await requirePermission('processes.manage');
  if (isDenied(guard)) return guard.response;

  try {
    const template = await removeStage(guard.user.programId, params.key, params.stageId);
    return NextResponse.json(template);
  } catch (error) {
    if (error instanceof ProcessError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
