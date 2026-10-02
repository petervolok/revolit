export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../../../auth/guard';
import { listRoleUsers, RoleError } from '../../../../roles/service';

/** Кто носит эту роль */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requirePermission('roles.view');
  if (isDenied(guard)) return guard.response;

  try {
    return NextResponse.json(await listRoleUsers(guard.user.programId, params.id));
  } catch (error) {
    if (error instanceof RoleError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
