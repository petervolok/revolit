export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireSignedIn, isUserDenied, entityErrorResponse } from '../../../../entities/guard';
import { createRecord, getTemplateFor, listRecords, queryRecords } from '../../../../entities/service';
import { parseRecordQuery, wantsPage } from '../../../../entities/query';

export async function GET(req: NextRequest, { params }: { params: { key: string } }) {
  const guard = await requireSignedIn();
  if (isUserDenied(guard)) return guard.response;
  const { user } = guard;

  try {
    const template = await getTemplateFor(user.programId, params.key, user);
    if (!template) return NextResponse.json({ error: 'Сущность не найдена' }, { status: 404 });

    // Без параметров — полный список (так его берут выпадающие списки связей); с параметрами — одна страница
    const search = new URL(req.url).searchParams;
    if (wantsPage(search)) {
      const query = parseRecordQuery(search);
      if (typeof query === 'string') return NextResponse.json({ error: query }, { status: 400 });
      return NextResponse.json({ template, ...(await queryRecords(user.programId, params.key, query, user)) });
    }

    const records = await listRecords(user.programId, params.key, undefined, user);
    return NextResponse.json({ template, records });
  } catch (error) {
    const response = entityErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function POST(req: NextRequest, { params }: { params: { key: string } }) {
  const guard = await requireSignedIn();
  if (isUserDenied(guard)) return guard.response;
  const { user } = guard;

  const body = await req.json().catch(() => ({}));

  try {
    const record = await createRecord(user.programId, params.key, body, user);
    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    const response = entityErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
