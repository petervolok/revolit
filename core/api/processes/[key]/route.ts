export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../../auth/guard';
import { deleteTemplate, getTemplate, renameTemplate, ProcessError } from '../../../processes/service';

export async function GET(_req: NextRequest, { params }: { params: { key: string } }) {
  const guard = await requirePermission('processes.manage');
  if (isDenied(guard)) return guard.response;

  const template = await getTemplate(guard.user.programId, params.key);
  if (!template) return NextResponse.json({ error: 'Процесс не найден' }, { status: 404 });
  return NextResponse.json(template);
}

export async function PATCH(req: NextRequest, { params }: { params: { key: string } }) {
  const guard = await requirePermission('processes.manage');
  if (isDenied(guard)) return guard.response;

  const { name } = await req.json().catch(() => ({}));
  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Укажите название процесса' }, { status: 400 });
  }

  try {
    const template = await renameTemplate(guard.user.programId, params.key, { name });
    return NextResponse.json(template);
  } catch (error) {
    if (error instanceof ProcessError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { key: string } }) {
  const guard = await requirePermission('processes.manage');
  if (isDenied(guard)) return guard.response;

  try {
    await deleteTemplate(guard.user.programId, params.key);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ProcessError) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
