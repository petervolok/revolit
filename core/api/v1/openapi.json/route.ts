export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { apiJson, authenticateRequest, isFailure } from '../../../apiv1/http';
import { buildOpenApi } from '../../../apiv1/openapi';
import { listTemplatesFor } from '../../../entities/service';

/** Описание API (OpenAPI 3) — только для сущностей и полей, доступных владельцу токена */
export async function GET(req: NextRequest) {
  const ctx = await authenticateRequest(req, { write: false });
  if (isFailure(ctx)) return ctx;

  const templates = await listTemplatesFor(ctx.user.programId, ctx.user);
  return apiJson(ctx, buildOpenApi(templates, new URL(req.url).origin));
}
