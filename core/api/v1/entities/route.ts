export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { apiJson, authenticateRequest, isFailure } from '../../../apiv1/http';
import { toApiTemplate } from '../../../apiv1/serialize';
import { listTemplatesFor } from '../../../entities/service';

/** Сущности, доступные владельцу токена, с описанием полей */
export async function GET(req: NextRequest) {
  const ctx = await authenticateRequest(req, { write: false });
  if (isFailure(ctx)) return ctx;

  const templates = await listTemplatesFor(ctx.user.programId, ctx.user);
  return apiJson(ctx, { data: templates.map(toApiTemplate) });
}
