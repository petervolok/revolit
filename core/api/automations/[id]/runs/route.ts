export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../../../auth/guard';
import { AutomationError, listRuns } from '../../../../automations/service';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requirePermission('automations.manage');
  if (isDenied(guard)) return guard.response;

  try {
    return NextResponse.json(await listRuns(guard.user.programId, params.id));
  } catch (error) {
    if (error instanceof AutomationError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
