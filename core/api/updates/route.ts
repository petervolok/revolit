export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../auth/guard';
import { checkForUpdate } from '../../updates/verify';
import { APP_VERSION } from '../../updates/version';

export async function GET() {
  const guard = await requirePermission('settings.manage');
  if (isDenied(guard)) return guard.response;

  return NextResponse.json({ currentVersion: APP_VERSION });
}

/** Проверяет присланный релиз: подлинный ли и новее ли текущей версии */
export async function POST(req: NextRequest) {
  const guard = await requirePermission('settings.manage');
  if (isDenied(guard)) return guard.response;

  const { manifest } = await req.json().catch(() => ({}));
  if (typeof manifest !== 'string' || !manifest.trim()) {
    return NextResponse.json({ error: 'Вставьте присланный релиз' }, { status: 400 });
  }

  const result = checkForUpdate(manifest.trim());
  return NextResponse.json(result);
}
