export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../../auth/guard';
import { deletePreset, updatePreset, PresetError } from '../../../entities/presetService';

export async function PATCH(req: NextRequest, { params }: { params: { key: string } }) {
  const guard = await requirePermission('entities.manage');
  if (isDenied(guard)) return guard.response;

  const { name, namePlural, fields } = await req.json().catch(() => ({}));
  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Укажите название шаблона' }, { status: 400 });
  }

  try {
    const preset = await updatePreset(guard.user.programId, params.key, {
      name,
      namePlural: typeof namePlural === 'string' ? namePlural : name,
      fields: Array.isArray(fields) ? fields : [],
    });
    return NextResponse.json(preset);
  } catch (error) {
    if (error instanceof PresetError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { key: string } }) {
  const guard = await requirePermission('entities.manage');
  if (isDenied(guard)) return guard.response;

  await deletePreset(guard.user.programId, params.key);
  return NextResponse.json({ ok: true });
}
