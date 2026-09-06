export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../../../auth/guard';
import { writeAudit } from '../../../../auth/audit';
import { clientIp, userAgent } from '../../../../utils/request';
import { materializePreset, PresetError } from '../../../../entities/presetService';

/** Создаёт настоящую сущность из шаблона — со всеми полями, одним действием */
export async function POST(req: NextRequest, { params }: { params: { key: string } }) {
  const guard = await requirePermission('entities.manage');
  if (isDenied(guard)) return guard.response;

  try {
    const { template, skippedFields } = await materializePreset(guard.user.programId, params.key);

    await writeAudit({
      programId: guard.user.programId,
      userId: guard.user.id,
      actorEmail: guard.user.email,
      action: 'entity_template.created',
      target: 'entity_template',
      targetId: template.id,
      details: { key: template.key, name: template.name, fromPreset: params.key },
      ip: clientIp(req),
      userAgent: userAgent(req),
    });

    return NextResponse.json({ template, skippedFields }, { status: 201 });
  } catch (error) {
    if (error instanceof PresetError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
