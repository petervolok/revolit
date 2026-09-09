'use client';

import Link from 'next/link';
import { ArrowRight, Boxes, CheckCircle2, ListTodo, ShieldCheck, Users2, Workflow } from 'lucide-react';
import EmptyState from '../ui/EmptyState';
import type { DashboardSummary } from '../dashboard/types';

const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });

function isOverdue(dueAt: string | null): boolean {
  if (!dueAt) return false;
  return new Date(dueAt) < new Date();
}

export default function HomeClient({ summary, userName }: { summary: DashboardSummary; userName: string }) {
  const totalRecords = summary.entities.reduce((sum, e) => sum + e.recordCount, 0);
  const totalActiveInstances = summary.processes.reduce((sum, p) => sum + p.activeCount, 0);
  const hasEntities = summary.entities.length > 0;
  const hasProcesses = summary.processes.length > 0;

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-7">
        <h2 className="text-xl font-semibold tracking-tight text-ink">Здравствуйте, {userName.split(' ')[0]}</h2>
        <p className="mt-1 text-sm text-ink-muted">Сводка по программе на сегодня</p>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="flex items-center gap-2 text-ink-muted">
            <Users2 className="h-4 w-4" />
            <span className="text-[13px] font-medium">Сотрудники</span>
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-ink">{summary.usersCount}</p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="flex items-center gap-2 text-ink-muted">
            <ShieldCheck className="h-4 w-4" />
            <span className="text-[13px] font-medium">Роли</span>
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-ink">{summary.rolesCount}</p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="flex items-center gap-2 text-ink-muted">
            <Boxes className="h-4 w-4" />
            <span className="text-[13px] font-medium">Записи</span>
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-ink">{totalRecords}</p>
          <p className="mt-0.5 text-xs text-ink-faint">{summary.entities.length} сущностей</p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="flex items-center gap-2 text-ink-muted">
            <Workflow className="h-4 w-4" />
            <span className="text-[13px] font-medium">Дела в работе</span>
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-ink">{totalActiveInstances}</p>
          <p className="mt-0.5 text-xs text-ink-faint">{summary.processes.length} процессов</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-ink">Сущности</h3>
            <Link href="/settings/entities" className="flex items-center gap-1 text-xs text-brand hover:underline">
              Настроить <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {!hasEntities && (
            <EmptyState
              icon={Boxes}
              title="Сущностей пока нет"
              description="Добавьте первую в «Настройки → Сущности» — раздел появится в меню."
            />
          )}
          {hasEntities && (
            <div className="flex flex-col gap-1">
              {summary.entities.map((e) => (
                <Link
                  key={e.key}
                  href={`/entities/${e.key}`}
                  className="flex items-center justify-between rounded-lg px-2 py-1.5 text-[13px] text-ink transition-colors hover:bg-surface-muted"
                >
                  <span>{e.namePlural}</span>
                  <span className="text-ink-muted">{e.recordCount}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-ink">Процессы</h3>
            <Link href="/settings/processes" className="flex items-center gap-1 text-xs text-brand hover:underline">
              Настроить <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {!hasProcesses && (
            <EmptyState
              icon={Workflow}
              title="Процессов пока нет"
              description="Добавьте процесс в «Настройки → Процессы», затем этапы — появится доска."
            />
          )}
          {hasProcesses && (
            <div className="flex flex-col gap-1">
              {summary.processes.map((p) => (
                <Link
                  key={p.key}
                  href={`/processes/${p.key}`}
                  className="flex items-center justify-between rounded-lg px-2 py-1.5 text-[13px] text-ink transition-colors hover:bg-surface-muted"
                >
                  <span>{p.name}</span>
                  <span className="text-ink-muted">{p.activeCount} в работе</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {summary.tasksEnabled && (
          <div className="rounded-xl border border-line bg-surface p-4 lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                <ListTodo className="h-4 w-4 text-ink-muted" />
                Мои задачи
                {summary.myOverdueTasksCount > 0 && (
                  <span className="rounded-full bg-danger/10 px-1.5 py-0.5 text-2xs font-medium text-danger">
                    {summary.myOverdueTasksCount} просрочено
                  </span>
                )}
              </h3>
              <Link href="/tasks" className="flex items-center gap-1 text-xs text-brand hover:underline">
                Все задачи ({summary.myOpenTasksCount}) <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {summary.myTasks.length === 0 && <p className="text-[13px] text-ink-muted">Открытых задач нет.</p>}
            {summary.myTasks.length > 0 && (
              <div className="flex flex-col gap-1">
                {summary.myTasks.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-[13px]">
                    <span className="flex items-center gap-2 text-ink">
                      <CheckCircle2 className="h-3.5 w-3.5 text-ink-faint" />
                      {t.title}
                    </span>
                    {t.dueAt && (
                      <span className={isOverdue(t.dueAt) ? 'text-xs font-medium text-danger' : 'text-xs text-ink-muted'}>
                        {dateFormat.format(new Date(t.dueAt))}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
