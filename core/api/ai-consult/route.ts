export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../auth/guard';
import { AiError, consult } from '../../ai/service';
import { assertModuleEnabled, ModuleToggleError } from '../../modules/toggles';

export async function POST(req: NextRequest) {
  const guard = await requirePermission('ai.use');
  if (isDenied(guard)) return guard.response;

  try {
    await assertModuleEnabled(guard.user.programId, 'ai');
  } catch (error) {
    if (error instanceof ModuleToggleError) return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const { message, history } = await req.json().catch(() => ({}));
  if (typeof message !== 'string' || !message.trim()) {
    return NextResponse.json({ error: 'Введите вопрос' }, { status: 400 });
  }

  try {
    const reply = await consult(guard.user.programId, message.trim(), Array.isArray(history) ? history : []);
    return NextResponse.json({ reply });
  } catch (error) {
    if (error instanceof AiError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
