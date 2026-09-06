export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const workflows = await prisma.workflow.findMany({
    orderBy: { updatedAt: 'desc' },
    select: { id: true, name: true, slug: true, updatedAt: true },
  });
  return NextResponse.json(workflows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const name = String(body.name || 'Новый процесс');
  const slugBase = String(body.slug || name)
    .toLowerCase()
    .trim()
    .replace(/[^a-zа-я0-9]+/gi, '-')
    .replace(/(^-|-$)/g, '');
  const slug = `${slugBase || 'process'}-${nanoid(6)}`;

  const workflow = await prisma.workflow.create({
    data: { name, slug, rootGraph: body.rootGraph ?? { nodes: [], edges: [] } },
  });
  return NextResponse.json(workflow);
}
