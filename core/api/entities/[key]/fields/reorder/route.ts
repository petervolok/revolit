export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../../../../auth/guard';
import { reorderFields, EntityError } from '../../../../../entities/service';

export async function POST(req: NextRequest, { params }: { params: { key: string } }) {
  const guard = await requirePermission('entities.manage');
  if (isDenied(guard)) return guard.response;

  const { fieldIds } = await req.json().catch(() => ({}));
  if (!Array.isArray(fieldIds) || fieldIds.some((id) => typeof id !== 'string')) {
    return NextResponse.json({ error: 'Некорректный порядок полей' }, { status: 400 });
  }

  try {
    const template = await reorderFields(guard.user.programId, params.key, fieldIds);
    return NextResponse.json(template);
  } catch (error) {
    if (error instanceof EntityError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
