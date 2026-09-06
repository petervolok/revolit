export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../../../auth/guard';
import { createInstance, getTemplate, listInstances, ProcessError } from '../../../../processes/service';

export async function GET(_req: NextRequest, { params }: { params: { key: string } }) {
  const guard = await requirePermission('processes.manage');
  if (isDenied(guard)) return guard.response;

  const template = await getTemplate(guard.user.programId, params.key);
  if (!template) return NextResponse.json({ error: 'Процесс не найден' }, { status: 404 });

  const instances = await listInstances(guard.user.programId, params.key);
  return NextResponse.json({ template, instances });
}

export async function POST(req: NextRequest, { params }: { params: { key: string } }) {
  const guard = await requirePermission('processes.manage');
  if (isDenied(guard)) return guard.response;

  const { title } = await req.json().catch(() => ({}));
  if (typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'Укажите название дела' }, { status: 400 });
  }

  try {
    const instance = await createInstance(guard.user.programId, params.key, { title });
    return NextResponse.json(instance, { status: 201 });
  } catch (error) {
    if (error instanceof ProcessError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
