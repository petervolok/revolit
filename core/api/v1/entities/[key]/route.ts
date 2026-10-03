export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { apiError, apiJson, authenticateRequest, isFailure, mapError } from '../../../../apiv1/http';
import { toApiTemplate } from '../../../../apiv1/serialize';
import { getTemplateFor } from '../../../../entities/service';

export async function GET(req: NextRequest, { params }: { params: { key: string } }) {
  const ctx = await authenticateRequest(req, { write: false });
  if (isFailure(ctx)) return ctx;

  try {
    const template = await getTemplateFor(ctx.user.programId, params.key, ctx.user);
    if (!template) return apiError(404, 'not_found', 'Сущность не найдена', ctx.headers);
    return apiJson(ctx, { data: toApiTemplate(template) });
  } catch (error) {
    const response = mapError(error, ctx);
    if (response) return response;
    throw error;
  }
}
