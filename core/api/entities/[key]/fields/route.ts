export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../../../auth/guard';
import { addField, EntityError } from '../../../../entities/service';
import { parseFieldInput } from '../../../../entities/fieldInput';

export async function POST(req: NextRequest, { params }: { params: { key: string } }) {
  const guard = await requirePermission('entities.manage');
  if (isDenied(guard)) return guard.response;

  const input = parseFieldInput(await req.json().catch(() => ({})));
  if (typeof input === 'string') return NextResponse.json({ error: input }, { status: 400 });

  try {
    const template = await addField(guard.user.programId, params.key, input);
    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    if (error instanceof EntityError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
