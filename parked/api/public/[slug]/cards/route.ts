export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const cardType = req.nextUrl.searchParams.get('type') || '';
  const cards = await prisma.cardRecord.findMany({
    where: { cardType },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(cards);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const cardType = String(body.cardType || '');
  if (!cardType) return NextResponse.json({ error: 'cardType обязателен' }, { status: 400 });
  const card = await prisma.cardRecord.create({
    data: { cardType, data: body.data ?? {} },
  });
  return NextResponse.json(card);
}
