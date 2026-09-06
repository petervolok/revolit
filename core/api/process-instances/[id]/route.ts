export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../../auth/guard';
import { deleteInstance, getInstance, ProcessError } from '../../../processes/service';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requirePermission('processes.manage');
  if (isDenied(guard)) return guard.response;

  try {
    const instance = await getInstance(guard.user.programId, params.id);
    return NextResponse.json(instance);
  } catch (error) {
    if (error instanceof ProcessError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requirePermission('processes.manage');
  if (isDenied(guard)) return guard.response;

  try {
    await deleteInstance(guard.user.programId, params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ProcessError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}
