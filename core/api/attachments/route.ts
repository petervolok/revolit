export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, hasPermission } from '../../auth/session';
import { AttachmentError, listAttachments, uploadAttachment } from '../../attachments/service';
import type { AttachmentParent } from '../../attachments/service';

/** Право зависит от того, к чему привязано вложение — своего права у вложений нет (Р-38) */
function parentPermission(parent: AttachmentParent): string {
  if ('entityRecordId' in parent) return 'entities.manage';
  if ('processInstanceId' in parent) return 'processes.manage';
  return 'tasks.use';
}

function parseParent(params: URLSearchParams | FormData): AttachmentParent | null {
  const entityRecordId = params.get('entityRecordId');
  const processInstanceId = params.get('processInstanceId');
  const taskId = params.get('taskId');
  if (typeof entityRecordId === 'string' && entityRecordId) return { entityRecordId };
  if (typeof processInstanceId === 'string' && processInstanceId) return { processInstanceId };
  if (typeof taskId === 'string' && taskId) return { taskId };
  return null;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });

  const parent = parseParent(req.nextUrl.searchParams);
  if (!parent) return NextResponse.json({ error: 'Укажите родителя вложения' }, { status: 400 });
  if (!hasPermission(user, parentPermission(parent))) {
    return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 });
  }

  const attachments = await listAttachments(user.programId, parent);
  return NextResponse.json(attachments);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 });

  const parent = parseParent(form);
  if (!parent) return NextResponse.json({ error: 'Укажите родителя вложения' }, { status: 400 });
  if (!hasPermission(user, parentPermission(parent))) {
    return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Файл не передан' }, { status: 400 });

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const attachment = await uploadAttachment(user.programId, user.id, parent, {
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      data: buffer,
    });
    return NextResponse.json(attachment, { status: 201 });
  } catch (error) {
    if (error instanceof AttachmentError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
