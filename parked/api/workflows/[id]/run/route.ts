export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { executeWorkflow } from '@/lib/engine/executeWorkflow';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const payload = body.payload ?? {};
  try {
    const result = await executeWorkflow(params.id, payload);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ status: 'error', error: message }, { status: 500 });
  }
}
