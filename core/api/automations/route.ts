export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../auth/guard';
import { writeAudit } from '../../auth/audit';
import { clientIp, userAgent } from '../../utils/request';
import { AutomationError, createAutomation, listAutomations } from '../../automations/service';
import { invalidateAutomationCache } from '../../automations/engine';
import { listTemplates } from '../../entities/service';
import { prisma } from '../../data/prisma';

/** Автоматизации программы и справочники для редактора: сущности с полями, сотрудники */
export async function GET() {
  const guard = await requirePermission('automations.manage');
  if (isDenied(guard)) return guard.response;

  const programId = guard.user.programId;
  const [automations, templates, users] = await Promise.all([
    listAutomations(programId),
    listTemplates(programId),
    prisma.user.findMany({ where: { programId, isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);
  return NextResponse.json({
    automations,
    users,
    templates: templates.map((t) => ({ key: t.key, name: t.name, namePlural: t.namePlural, fields: t.fields.map((f) => ({ key: f.key, label: f.label, type: f.type })) })),
  });
}

export async function POST(req: NextRequest) {
  const guard = await requirePermission('automations.manage');
  if (isDenied(guard)) return guard.response;

  const body = await req.json().catch(() => ({}));
  try {
    const automation = await createAutomation(guard.user.programId, guard.user.id, body);
    invalidateAutomationCache(guard.user.programId);

    await writeAudit({
      programId: guard.user.programId,
      userId: guard.user.id,
      actorEmail: guard.user.email,
      action: 'automation.created',
      target: 'automation',
      targetId: automation.id,
      details: { name: automation.name, trigger: automation.trigger, actions: automation.actions.map((a) => a.type) },
      ip: clientIp(req),
      userAgent: userAgent(req),
    });
    return NextResponse.json(automation, { status: 201 });
  } catch (error) {
    if (error instanceof AutomationError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
