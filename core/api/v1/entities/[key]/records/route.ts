export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { apiError, apiJson, authenticateRequest, isFailure, mapError } from '../../../../../apiv1/http';
import { parseApiQuery } from '../../../../../apiv1/query';
import { toApiRecord } from '../../../../../apiv1/serialize';
import { createRecord, queryRecords } from '../../../../../entities/service';

/** Записи с поиском, фильтрами, сортировкой и страницами */
export async function GET(req: NextRequest, { params }: { params: { key: string } }) {
  const ctx = await authenticateRequest(req, { write: false });
  if (isFailure(ctx)) return ctx;

  const query = parseApiQuery(new URL(req.url).searchParams);
  if (typeof query === 'string') return apiError(400, 'bad_query', query, ctx.headers);

  try {
    const page = await queryRecords(ctx.user.programId, params.key, query, ctx.user);
    return apiJson(ctx, {
      data: page.records.map(toApiRecord),
      meta: { total: page.total, page: page.page, pageSize: page.pageSize, pages: page.pages },
    });
  } catch (error) {
    const response = mapError(error, ctx);
    if (response) return response;
    throw error;
  }
}

/** Создание записи: тело { "data": { поле: значение } } */
export async function POST(req: NextRequest, { params }: { params: { key: string } }) {
  const ctx = await authenticateRequest(req, { write: true });
  if (isFailure(ctx)) return ctx;

  const body = await req.json().catch(() => null);
  const data = body?.data;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return apiError(400, 'bad_body', 'Тело запроса — JSON вида { "data": { ... } }', ctx.headers);
  }

  try {
    const record = await createRecord(ctx.user.programId, params.key, data as Record<string, unknown>, ctx.user);
    return apiJson(ctx, { data: toApiRecord(record) }, 201, { Location: `/api/v1/entities/${params.key}/records/${record.id}` });
  } catch (error) {
    const response = mapError(error, ctx);
    if (response) return response;
    throw error;
  }
}
