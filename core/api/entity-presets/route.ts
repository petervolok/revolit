export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../auth/guard';
import { createPreset, listPresets, PresetError } from '../../entities/presetService';

/**
 * Отдельный путь, не /api/entities/presets: иначе сущность с ключом «presets»
 * навсегда перекрыла бы этот раздел (тот же случай, что и с /api/program-users).
 */
export async function GET() {
  const guard = await requirePermission('entities.manage');
  if (isDenied(guard)) return guard.response;

  const presets = await listPresets(guard.user.programId);
  return NextResponse.json(presets);
}

export async function POST(req: NextRequest) {
  const guard = await requirePermission('entities.manage');
  if (isDenied(guard)) return guard.response;

  const { name, namePlural, fields } = await req.json().catch(() => ({}));
  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Укажите название шаблона' }, { status: 400 });
  }

  try {
    const preset = await createPreset(guard.user.programId, {
      name,
      namePlural: typeof namePlural === 'string' ? namePlural : name,
      fields: Array.isArray(fields) ? fields : [],
    });
    return NextResponse.json(preset, { status: 201 });
  } catch (error) {
    if (error instanceof PresetError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
