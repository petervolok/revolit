export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../../../auth/guard';
import { setInstanceStatus, ProcessError } from '../../../../processes/service';

const VALID = ['active', 'done', 'cancelled'];

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requirePermission('processes.manage');
  if (isDenied(guard)) return guard.response;

  const { status } = await req.json().catch(() => ({}));
  if (typeof status !== 'string' || !VALID.includes(status)) {
    return NextResponse.json({ error: 'Некорректный статус' }, { status: 400 });
  }

  try {
    const instance = await setInstanceStatus(guard.user.programId, params.id, status as 'active' | 'done' | 'cancelled');
    return NextResponse.json(instance);
  } catch (error) {
    if (error instanceof ProcessError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
