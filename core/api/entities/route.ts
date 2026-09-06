export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../auth/guard';
import { writeAudit } from '../../auth/audit';
import { clientIp, userAgent } from '../../utils/request';
import { createTemplate, listTemplates, EntityError } from '../../entities/service';

export async function GET() {
  const guard = await requirePermission('entities.manage');
  if (isDenied(guard)) return guard.response;

  const templates = await listTemplates(guard.user.programId);
  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const guard = await requirePermission('entities.manage');
  if (isDenied(guard)) return guard.response;

  const { name, namePlural } = await req.json().catch(() => ({}));
  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Укажите название сущности' }, { status: 400 });
  }

  try {
    const template = await createTemplate(guard.user.programId, {
      name,
      namePlural: typeof namePlural === 'string' ? namePlural : name,
    });

    await writeAudit({
      programId: guard.user.programId,
      userId: guard.user.id,
      actorEmail: guard.user.email,
      action: 'entity_template.created',
      target: 'entity_template',
      targetId: template.id,
      details: { key: template.key, name: template.name },
      ip: clientIp(req),
      userAgent: userAgent(req),
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    if (error instanceof EntityError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
