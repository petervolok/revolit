export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../../../../auth/guard';
import { removeField, updateField, EntityError } from '../../../../../entities/service';
import { parseFieldInput } from '../../../../../entities/fieldInput';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { key: string; fieldId: string } }
) {
  const guard = await requirePermission('entities.manage');
  if (isDenied(guard)) return guard.response;

  const input = parseFieldInput(await req.json().catch(() => ({})));
  if (typeof input === 'string') return NextResponse.json({ error: input }, { status: 400 });

  try {
    const template = await updateField(guard.user.programId, params.key, params.fieldId, input);
    return NextResponse.json(template);
  } catch (error) {
    if (error instanceof EntityError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { key: string; fieldId: string } }
) {
  const guard = await requirePermission('entities.manage');
  if (isDenied(guard)) return guard.response;

  try {
    const template = await removeField(guard.user.programId, params.key, params.fieldId);
    return NextResponse.json(template);
  } catch (error) {
    if (error instanceof EntityError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
