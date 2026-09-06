export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// stageId здесь — это nodeId ноды-этапа в rootGraph (уникален в рамках workflow)
export async function GET(_req: NextRequest, { params }: { params: { id: string; stageId: string } }) {
  const stage = await prisma.stage.findUnique({
    where: { workflowId_nodeId: { workflowId: params.id, nodeId: params.stageId } },
  });
  if (!stage) return NextResponse.json({ nodeId: params.stageId, subGraph: { nodes: [], edges: [] } });
  return NextResponse.json(stage);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string; stageId: string } }) {
  const body = await req.json();
  const stage = await prisma.stage.upsert({
    where: { workflowId_nodeId: { workflowId: params.id, nodeId: params.stageId } },
    update: { name: body.name, subGraph: body.subGraph },
    create: {
      workflowId: params.id,
      nodeId: params.stageId,
      name: body.name || 'Этап',
      subGraph: body.subGraph ?? { nodes: [], edges: [] },
    },
  });
  return NextResponse.json(stage);
}
