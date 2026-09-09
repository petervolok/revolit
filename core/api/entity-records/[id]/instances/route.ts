export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../../../auth/guard';
import { listInstancesForRecord } from '../../../../processes/service';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requirePermission('entities.manage');
  if (isDenied(guard)) return guard.response;

  const instances = await listInstancesForRecord(guard.user.programId, params.id);
  return NextResponse.json(instances);
}
