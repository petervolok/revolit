export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, hasPermission } from '../../../auth/session';
import { prisma } from '../../../data/prisma';
import { AttachmentError, deleteAttachment } from '../../../attachments/service';

async function loadOwnAttachment(programId: string, id: string) {
  return prisma.attachment.findFirst({ where: { id, programId } });
}

function permissionFor(row: { entityRecordId: string | null; processInstanceId: string | null }): string {
  if (row.entityRecordId) return 'entities.manage';
  if (row.processInstanceId) return 'processes.manage';
  return 'tasks.use';
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });

  const row = await loadOwnAttachment(user.programId, params.id);
  if (!row) return NextResponse.json({ error: 'Вложение не найдено' }, { status: 404 });
  if (!hasPermission(user, permissionFor(row))) {
    return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 });
  }

  try {
    await deleteAttachment(user.programId, params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AttachmentError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
