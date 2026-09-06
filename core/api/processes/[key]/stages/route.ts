export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../../../auth/guard';
import { addStage, ProcessError } from '../../../../processes/service';

export async function POST(req: NextRequest, { params }: { params: { key: string } }) {
  const guard = await requirePermission('processes.manage');
  if (isDenied(guard)) return guard.response;

  const { name, responsible, regulation, checklist } = await req.json().catch(() => ({}));
  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Укажите название этапа' }, { status: 400 });
  }

  try {
    const template = await addStage(guard.user.programId, params.key, { name, responsible, regulation, checklist });
    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    if (error instanceof ProcessError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
