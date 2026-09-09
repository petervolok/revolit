export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../../../../auth/guard';
import { AiError, removeAiKey } from '../../../../../ai/service';

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; keyId: string } }) {
  const guard = await requirePermission('settings.manage');
  if (isDenied(guard)) return guard.response;

  try {
    await removeAiKey(guard.user.programId, params.id, params.keyId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AiError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
