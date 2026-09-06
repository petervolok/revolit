export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const workflow = await prisma.workflow.findUnique({
    where: { id: params.id },
    include: { stages: true },
  });
  if (!workflow) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(workflow);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const workflow = await prisma.workflow.update({
    where: { id: params.id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.rootGraph !== undefined ? { rootGraph: body.rootGraph } : {}),
    },
  });
  return NextResponse.json(workflow);
}
