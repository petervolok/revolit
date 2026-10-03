export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../../auth/guard';
import { buildOpenApi } from '../../../apiv1/openapi';
import { listTemplatesFor } from '../../../entities/service';

/** Описание API для экрана «Настройки → API» (по входу в программу, без токена) */
export async function GET(req: NextRequest) {
  const guard = await requirePermission('api.manage');
  if (isDenied(guard)) return guard.response;

  const templates = await listTemplatesFor(guard.user.programId, guard.user);
  return NextResponse.json(buildOpenApi(templates, new URL(req.url).origin));
}
