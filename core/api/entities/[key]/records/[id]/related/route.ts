export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireSignedIn, isUserDenied, entityErrorResponse } from '../../../../../../entities/guard';
import { listReverse } from '../../../../../../entities/service';

/** Обратные связи записи: какие записи других сущностей на неё ссылаются (только доступные сотруднику) */
export async function GET(_req: NextRequest, { params }: { params: { key: string; id: string } }) {
  const guard = await requireSignedIn();
  if (isUserDenied(guard)) return guard.response;

  try {
    return NextResponse.json(await listReverse(guard.user.programId, params.key, params.id, guard.user));
  } catch (error) {
    const response = entityErrorResponse(error, 404);
    if (response) return response;
    throw error;
  }
}
