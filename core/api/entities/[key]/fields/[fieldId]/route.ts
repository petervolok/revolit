export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../../../../auth/guard';
import { removeField, updateField, EntityError } from '../../../../../entities/service';
import type { FieldType } from '../../../../../entities/types';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { key: string; fieldId: string } }
) {
  const guard = await requirePermission('entities.manage');
  if (isDenied(guard)) return guard.response;

  const { label, type, required, options } = await req.json().catch(() => ({}));
  if (typeof label !== 'string' || typeof type !== 'string') {
    return NextResponse.json({ error: 'Заполните название и тип поля' }, { status: 400 });
  }

  try {
    const template = await updateField(guard.user.programId, params.key, params.fieldId, {
      label,
      type: type as FieldType,
      required: Boolean(required),
      options: options ?? null,
    });
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
