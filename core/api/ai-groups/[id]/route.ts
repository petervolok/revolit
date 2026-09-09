export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../../auth/guard';
import { AiError, deleteAiGroup, renameAiGroup, setActiveAiGroup } from '../../../ai/service';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requirePermission('settings.manage');
  if (isDenied(guard)) return guard.response;

  const { name, model, active } = await req.json().catch(() => ({}));

  try {
    if (active === true) await setActiveAiGroup(guard.user.programId, params.id);
    if (active === false) await setActiveAiGroup(guard.user.programId, null);
    if (name !== undefined || model !== undefined) {
      await renameAiGroup(guard.user.programId, params.id, { name, model });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AiError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requirePermission('settings.manage');
  if (isDenied(guard)) return guard.response;

  try {
    await deleteAiGroup(guard.user.programId, params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AiError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
