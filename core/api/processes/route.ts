export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../auth/guard';
import { createTemplate, listTemplates, ProcessError } from '../../processes/service';

export async function GET() {
  const guard = await requirePermission('processes.manage');
  if (isDenied(guard)) return guard.response;

  const templates = await listTemplates(guard.user.programId);
  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const guard = await requirePermission('processes.manage');
  if (isDenied(guard)) return guard.response;

  const { name } = await req.json().catch(() => ({}));
  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Укажите название процесса' }, { status: 400 });
  }

  try {
    const template = await createTemplate(guard.user.programId, { name });
    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    if (error instanceof ProcessError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
