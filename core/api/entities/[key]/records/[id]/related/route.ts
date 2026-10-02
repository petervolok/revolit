export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../../../../../auth/guard';
import { listReverse, EntityError } from '../../../../../../entities/service';

/** Обратные связи записи: какие записи других сущностей на неё ссылаются */
export async function GET(_req: NextRequest, { params }: { params: { key: string; id: string } }) {
  const guard = await requirePermission('entities.manage');
  if (isDenied(guard)) return guard.response;

  try {
    return NextResponse.json(await listReverse(guard.user.programId, params.key, params.id));
  } catch (error) {
    if (error instanceof EntityError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}
