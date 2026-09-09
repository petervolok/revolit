export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../../auth/guard';
import { deleteTask, setTaskStatus, TaskError, updateTask } from '../../../tasks/service';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requirePermission('tasks.use');
  if (isDenied(guard)) return guard.response;

  const { title, description, assigneeId, dueAt, status } = await req.json().catch(() => ({}));

  try {
    if (status === 'open' || status === 'done') {
      await setTaskStatus(guard.user.programId, params.id, status);
    }
    if (title !== undefined || description !== undefined || assigneeId !== undefined || dueAt !== undefined) {
      await updateTask(guard.user.programId, params.id, { title, description, assigneeId, dueAt });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof TaskError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requirePermission('tasks.use');
  if (isDenied(guard)) return guard.response;

  try {
    await deleteTask(guard.user.programId, params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof TaskError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
