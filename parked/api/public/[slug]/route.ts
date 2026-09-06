export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { buildMenu } from '@/lib/runtime/menu';

export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const workflow = await prisma.workflow.findUnique({
    where: { slug: params.slug },
    include: { stages: true },
  });
  if (!workflow) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({
    id: workflow.id,
    name: workflow.name,
    slug: workflow.slug,
    menu: buildMenu(workflow),
  });
}
