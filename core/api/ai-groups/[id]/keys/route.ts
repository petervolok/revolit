export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../../../auth/guard';
import { addAiKey, AiError } from '../../../../ai/service';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requirePermission('settings.manage');
  if (isDenied(guard)) return guard.response;

  const { apiKey, label } = await req.json().catch(() => ({}));
  if (typeof apiKey !== 'string') {
    return NextResponse.json({ error: 'Вставьте ключ' }, { status: 400 });
  }

  try {
    await addAiKey(guard.user.programId, params.id, { apiKey, label });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AiError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
