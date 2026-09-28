export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../auth/guard';
import { getBusHealth } from '../../bus/health';

export async function GET() {
  const guard = await requirePermission('settings.manage');
  if (isDenied(guard)) return guard.response;

  return NextResponse.json(await getBusHealth());
}
