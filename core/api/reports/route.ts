export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../auth/guard';
import { assertModuleEnabled, ModuleToggleError } from '../../modules/toggles';
import { listReportableTemplates } from '../../reports/service';

export async function GET() {
  const guard = await requirePermission('reports.view');
  if (isDenied(guard)) return guard.response;

  try {
    await assertModuleEnabled(guard.user.programId, 'reports');
  } catch (error) {
    if (error instanceof ModuleToggleError) return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const templates = await listReportableTemplates(guard.user.programId);
  return NextResponse.json(templates);
}
