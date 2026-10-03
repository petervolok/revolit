export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { apiError, apiJson, authenticateRequest, isFailure, mapError } from '../../../../../../apiv1/http';
import { toApiRecord } from '../../../../../../apiv1/serialize';
import { writeAudit } from '../../../../../../auth/audit';
import { clientIp, userAgent } from '../../../../../../utils/request';
import { deleteRecord, getRecordFor, updateRecord } from '../../../../../../entities/service';

type Params = { params: { key: string; id: string } };

export async function GET(req: NextRequest, { params }: Params) {
  const ctx = await authenticateRequest(req, { write: false });
  if (isFailure(ctx)) return ctx;

  try {
    const record = await getRecordFor(ctx.user.programId, params.key, params.id, ctx.user);
    return apiJson(ctx, { data: toApiRecord(record) });
  } catch (error) {
    const response = mapError(error, ctx);
    if (response) return response;
    throw error;
  }
}

/**
 * Изменение: передаются только меняемые поля, остальные остаются; null очищает поле.
 * Тело — { "data": { поле: значение } }.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const ctx = await authenticateRequest(req, { write: true });
  if (isFailure(ctx)) return ctx;

  const body = await req.json().catch(() => null);
  const patch = body?.data;
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
    return apiError(400, 'bad_body', 'Тело запроса — JSON вида { "data": { ... } }', ctx.headers);
  }

  try {
    const current = await getRecordFor(ctx.user.programId, params.key, params.id, ctx.user);
    const merged = { ...current.data, ...(patch as Record<string, unknown>) };
    const record = await updateRecord(ctx.user.programId, params.key, params.id, merged, ctx.user);
    return apiJson(ctx, { data: toApiRecord(record) });
  } catch (error) {
    const response = mapError(error, ctx);
    if (response) return response;
    throw error;
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const ctx = await authenticateRequest(req, { write: true });
  if (isFailure(ctx)) return ctx;

  try {
    // Сначала проверяется, что запись есть и доступна, — иначе удаление несуществующей выглядело бы успехом
    await getRecordFor(ctx.user.programId, params.key, params.id, ctx.user);
    await deleteRecord(ctx.user.programId, params.key, params.id, ctx.user);
  } catch (error) {
    const response = mapError(error, ctx);
    if (response) return response;
    throw error;
  }

  await writeAudit({
    programId: ctx.user.programId,
    userId: ctx.user.id,
    actorEmail: ctx.user.email,
    action: 'entity_record.deleted',
    target: 'entity_record',
    targetId: params.id,
    details: { templateKey: params.key, via: 'api', tokenId: ctx.tokenId },
    ip: clientIp(req),
    userAgent: userAgent(req),
  });

  return new NextResponse(null, { status: 204, headers: ctx.headers });
}
