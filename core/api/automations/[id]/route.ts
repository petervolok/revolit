export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../../auth/guard';
import { writeAudit } from '../../../auth/audit';
import { clientIp, userAgent } from '../../../utils/request';
import { AutomationError, deleteAutomation, getAutomation, updateAutomation } from '../../../automations/service';
import { invalidateAutomationCache } from '../../../automations/engine';

type Params = { params: { id: string } };

function failure(error: unknown): NextResponse | null {
  return error instanceof AutomationError ? NextResponse.json({ error: error.message }, { status: error.status }) : null;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const guard = await requirePermission('automations.manage');
  if (isDenied(guard)) return guard.response;
  try {
    return NextResponse.json(await getAutomation(guard.user.programId, params.id));
  } catch (error) {
    const response = failure(error);
    if (response) return response;
    throw error;
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await requirePermission('automations.manage');
  if (isDenied(guard)) return guard.response;

  const body = await req.json().catch(() => ({}));
  try {
    const automation = await updateAutomation(guard.user.programId, params.id, body);
    invalidateAutomationCache(guard.user.programId);

    await writeAudit({
      programId: guard.user.programId,
      userId: guard.user.id,
      actorEmail: guard.user.email,
      action: 'automation.updated',
      target: 'automation',
      targetId: automation.id,
      details: { name: automation.name, enabled: automation.enabled },
      ip: clientIp(req),
      userAgent: userAgent(req),
    });
    return NextResponse.json(automation);
  } catch (error) {
    const response = failure(error);
    if (response) return response;
    throw error;
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const guard = await requirePermission('automations.manage');
  if (isDenied(guard)) return guard.response;

  try {
    const automation = await deleteAutomation(guard.user.programId, params.id);
    invalidateAutomationCache(guard.user.programId);

    await writeAudit({
      programId: guard.user.programId,
      userId: guard.user.id,
      actorEmail: guard.user.email,
      action: 'automation.deleted',
      target: 'automation',
      targetId: automation.id,
      details: { name: automation.name },
      ip: clientIp(req),
      userAgent: userAgent(req),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const response = failure(error);
    if (response) return response;
    throw error;
  }
}
