export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, hasPermission } from '../../../../auth/session';
import { prisma } from '../../../../data/prisma';
import { AttachmentError, getAttachmentFile } from '../../../../attachments/service';

function permissionFor(row: { entityRecordId: string | null; processInstanceId: string | null }): string {
  if (row.entityRecordId) return 'entities.manage';
  if (row.processInstanceId) return 'processes.manage';
  return 'tasks.use';
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });

  const row = await prisma.attachment.findFirst({ where: { id: params.id, programId: user.programId } });
  if (!row) return NextResponse.json({ error: 'Вложение не найдено' }, { status: 404 });
  if (!hasPermission(user, permissionFor(row))) {
    return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 });
  }

  try {
    const file = await getAttachmentFile(user.programId, params.id);
    return new NextResponse(new Uint8Array(file.data), {
      headers: {
        'Content-Type': file.mimeType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(file.fileName)}"`,
        'Content-Length': String(file.data.length),
      },
    });
  } catch (error) {
    if (error instanceof AttachmentError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}
