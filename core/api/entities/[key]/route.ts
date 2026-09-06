export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../../auth/guard';
import { writeAudit } from '../../../auth/audit';
import { clientIp, userAgent } from '../../../utils/request';
import { deleteTemplate, getTemplate, renameTemplate, EntityError } from '../../../entities/service';

export async function GET(_req: NextRequest, { params }: { params: { key: string } }) {
  const guard = await requirePermission('entities.manage');
  if (isDenied(guard)) return guard.response;

  const template = await getTemplate(guard.user.programId, params.key);
  if (!template) return NextResponse.json({ error: 'Сущность не найдена' }, { status: 404 });
  return NextResponse.json(template);
}

export async function PATCH(req: NextRequest, { params }: { params: { key: string } }) {
  const guard = await requirePermission('entities.manage');
  if (isDenied(guard)) return guard.response;

  const { name, namePlural } = await req.json().catch(() => ({}));
  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Укажите название сущности' }, { status: 400 });
  }

  try {
    const template = await renameTemplate(guard.user.programId, params.key, {
      name,
      namePlural: typeof namePlural === 'string' ? namePlural : name,
    });
    return NextResponse.json(template);
  } catch (error) {
    if (error instanceof EntityError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { key: string } }) {
  const guard = await requirePermission('entities.manage');
  if (isDenied(guard)) return guard.response;

  try {
    const before = await getTemplate(guard.user.programId, params.key);
    await deleteTemplate(guard.user.programId, params.key);

    await writeAudit({
      programId: guard.user.programId,
      userId: guard.user.id,
      actorEmail: guard.user.email,
      action: 'entity_template.deleted',
      target: 'entity_template',
      targetId: before?.id,
      details: { key: params.key },
      ip: clientIp(req),
      userAgent: userAgent(req),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof EntityError) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
