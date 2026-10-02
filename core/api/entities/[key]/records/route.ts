export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../../../auth/guard';
import { createRecord, getTemplate, listRecords, queryRecords, EntityError } from '../../../../entities/service';
import { parseRecordQuery, wantsPage } from '../../../../entities/query';

export async function GET(req: NextRequest, { params }: { params: { key: string } }) {
  const guard = await requirePermission('entities.manage');
  if (isDenied(guard)) return guard.response;

  const template = await getTemplate(guard.user.programId, params.key);
  if (!template) return NextResponse.json({ error: 'Сущность не найдена' }, { status: 404 });

  // Без параметров — полный список (так его берут выпадающие списки связей); с параметрами — одна страница
  const search = new URL(req.url).searchParams;
  if (wantsPage(search)) {
    const query = parseRecordQuery(search);
    if (typeof query === 'string') return NextResponse.json({ error: query }, { status: 400 });
    try {
      return NextResponse.json({ template, ...(await queryRecords(guard.user.programId, params.key, query)) });
    } catch (error) {
      if (error instanceof EntityError) return NextResponse.json({ error: error.message }, { status: 400 });
      throw error;
    }
  }

  const records = await listRecords(guard.user.programId, params.key);
  return NextResponse.json({ template, records });
}

export async function POST(req: NextRequest, { params }: { params: { key: string } }) {
  const guard = await requirePermission('entities.manage');
  if (isDenied(guard)) return guard.response;

  const body = await req.json().catch(() => ({}));

  try {
    const record = await createRecord(guard.user.programId, params.key, body);
    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    if (error instanceof EntityError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
