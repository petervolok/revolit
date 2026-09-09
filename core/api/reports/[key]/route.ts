export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../../auth/guard';
import { assertModuleEnabled, ModuleToggleError } from '../../../modules/toggles';
import { getFieldReport, ReportError } from '../../../reports/service';

export async function GET(req: NextRequest, { params }: { params: { key: string } }) {
  const guard = await requirePermission('reports.view');
  if (isDenied(guard)) return guard.response;

  try {
    await assertModuleEnabled(guard.user.programId, 'reports');
  } catch (error) {
    if (error instanceof ModuleToggleError) return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const field = req.nextUrl.searchParams.get('field');
  if (!field) return NextResponse.json({ error: 'Укажите поле' }, { status: 400 });

  try {
    const report = await getFieldReport(guard.user.programId, params.key, field);
    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof ReportError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
