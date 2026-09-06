export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../auth/guard';
import { activateLicense, deactivateLicense, getLicenseStatus, LicenseError } from '../../licensing/service';

export async function GET() {
  const guard = await requirePermission('settings.manage');
  if (isDenied(guard)) return guard.response;

  const status = await getLicenseStatus(guard.user.programId);
  return NextResponse.json(status);
}

export async function POST(req: NextRequest) {
  const guard = await requirePermission('settings.manage');
  if (isDenied(guard)) return guard.response;

  const { key } = await req.json().catch(() => ({}));
  if (typeof key !== 'string' || !key.trim()) {
    return NextResponse.json({ error: 'Вставьте лицензионный ключ' }, { status: 400 });
  }

  try {
    const status = await activateLicense(guard.user.programId, key.trim());
    return NextResponse.json(status);
  } catch (error) {
    if (error instanceof LicenseError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}

export async function DELETE() {
  const guard = await requirePermission('settings.manage');
  if (isDenied(guard)) return guard.response;

  await deactivateLicense(guard.user.programId);
  return NextResponse.json({ ok: true });
}
