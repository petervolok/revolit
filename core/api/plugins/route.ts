export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../auth/guard';
import { PLUGIN_CATALOG } from '../../modules/catalog';
import { getRegistry } from '../../modules/current';
import { listDisabledModuleKeys, ModuleToggleError, setModuleEnabled } from '../../modules/toggles';

export async function GET() {
  const guard = await requirePermission('settings.manage');
  if (isDenied(guard)) return guard.response;

  const registry = getRegistry();
  const disabled = await listDisabledModuleKeys(guard.user.programId);

  const plugins = PLUGIN_CATALOG.map((entry) => ({
    ...entry,
    // Установлен = уже входит в эту сборку (см. apps/crm/src/modules) —
    // витрина не скачивает код, только включает то, что уже есть (Р-34)
    installed: registry.has(entry.key),
    enabled: !disabled.has(entry.key),
  }));

  return NextResponse.json(plugins);
}

export async function POST(req: NextRequest) {
  const guard = await requirePermission('settings.manage');
  if (isDenied(guard)) return guard.response;

  const { moduleKey, enabled } = await req.json().catch(() => ({}));
  if (typeof moduleKey !== 'string' || typeof enabled !== 'boolean') {
    return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 });
  }

  try {
    await setModuleEnabled(guard.user.programId, moduleKey, enabled);
  } catch (error) {
    if (error instanceof ModuleToggleError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }

  return NextResponse.json({ ok: true });
}
