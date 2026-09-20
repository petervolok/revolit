export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../../auth/guard';
import { deleteJob, listJobs, SchedulerError, upsertJob } from '../../../scheduler/service';

export async function GET() {
  const guard = await requirePermission('settings.manage');
  if (isDenied(guard)) return guard.response;

  return NextResponse.json(await listJobs(guard.user.programId));
}

export async function PUT(req: NextRequest) {
  const guard = await requirePermission('settings.manage');
  if (isDenied(guard)) return guard.response;

  const { key, cronExpression, enabled } = await req.json().catch(() => ({}));
  if (typeof key !== 'string' || typeof cronExpression !== 'string') {
    return NextResponse.json({ error: 'Укажите ключ и расписание' }, { status: 400 });
  }

  try {
    const job = await upsertJob(guard.user.programId, {
      key,
      cronExpression,
      enabled: typeof enabled === 'boolean' ? enabled : undefined,
    });
    return NextResponse.json(job);
  } catch (error) {
    if (error instanceof SchedulerError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await requirePermission('settings.manage');
  if (isDenied(guard)) return guard.response;

  const key = req.nextUrl.searchParams.get('key');
  if (!key) return NextResponse.json({ error: 'Укажите ключ' }, { status: 400 });

  await deleteJob(guard.user.programId, key);
  return NextResponse.json({ ok: true });
}
