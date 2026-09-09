export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isDenied } from '../../auth/guard';
import { assertModuleEnabled, ModuleToggleError } from '../../modules/toggles';
import { createTask, listTasks, TaskError } from '../../tasks/service';

export async function GET(req: NextRequest) {
  const guard = await requirePermission('tasks.use');
  if (isDenied(guard)) return guard.response;

  try {
    await assertModuleEnabled(guard.user.programId, 'tasks');
  } catch (error) {
    if (error instanceof ModuleToggleError) return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const params = req.nextUrl.searchParams;
  const assignee = params.get('assignee'); // 'me' | userId | null (все)
  const entityRecordId = params.get('entityRecordId') ?? undefined;
  const processInstanceId = params.get('processInstanceId') ?? undefined;
  const includeDone = params.get('includeDone') === '1';

  const tasks = await listTasks(guard.user.programId, {
    assigneeId: assignee === 'me' ? guard.user.id : assignee || undefined,
    entityRecordId,
    processInstanceId,
    includeDone,
  });
  return NextResponse.json(tasks);
}

export async function POST(req: NextRequest) {
  const guard = await requirePermission('tasks.use');
  if (isDenied(guard)) return guard.response;

  try {
    await assertModuleEnabled(guard.user.programId, 'tasks');
  } catch (error) {
    if (error instanceof ModuleToggleError) return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const { title, description, assigneeId, dueAt, entityRecordId, processInstanceId } = await req
    .json()
    .catch(() => ({}));

  if (typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'Укажите название задачи' }, { status: 400 });
  }

  try {
    const task = await createTask(guard.user.programId, guard.user.id, {
      title,
      description,
      assigneeId,
      dueAt,
      entityRecordId,
      processInstanceId,
    });
    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    if (error instanceof TaskError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
