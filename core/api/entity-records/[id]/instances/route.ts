export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireSignedIn, isUserDenied } from '../../../../entities/guard';
import { canAccessRecord } from '../../../../entities/access';
import { listInstancesForRecord } from '../../../../processes/service';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireSignedIn();
  if (isUserDenied(guard)) return guard.response;
  // Дела по записи видит тот, кто вправе читать саму запись
  if (!(await canAccessRecord(guard.user, params.id, 'read'))) {
    return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 });
  }

  const instances = await listInstancesForRecord(guard.user.programId, params.id);
  return NextResponse.json(instances);
}
