export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../auth/guard';
import { AiError, createAiGroup, listAiGroups } from '../../ai/service';

export async function GET() {
  const guard = await requirePermission('settings.manage');
  if (isDenied(guard)) return guard.response;

  const groups = await listAiGroups(guard.user.programId);
  return NextResponse.json(groups);
}

export async function POST(req: NextRequest) {
  const guard = await requirePermission('settings.manage');
  if (isDenied(guard)) return guard.response;

  const { name, provider, model } = await req.json().catch(() => ({}));
  if (typeof name !== 'string') {
    return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 });
  }

  try {
    const group = await createAiGroup(guard.user.programId, { name, provider, model });
    return NextResponse.json(group);
  } catch (error) {
    if (error instanceof AiError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
