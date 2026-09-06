'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, KeyRound, Pencil, Search, Send, Unlock, UserPlus, Users2 } from 'lucide-react';
import Badge from '../../ui/Badge';
import Button from '../../ui/Button';
import Checkbox from '../../ui/Checkbox';
import EmptyState from '../../ui/EmptyState';
import Input from '../../ui/Input';
import RowMenu from '../../ui/RowMenu';
import SlideOver from '../../ui/SlideOver';

interface RoleOption {
  id: string;
  name: string;
  description: string | null;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  isLocked: boolean;
  isPending: boolean;
  lastLoginAt: string | null;
  roles: { id: string; key: string; name: string }[];
}

const dateFormat = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export default function UsersClient() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [banner, setBanner] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const [editing, setEditing] = useState<UserRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', roleIds: [] as string[] });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    const [u, r] = await Promise.all([
      fetch('/api/users').then((res) => (res.ok ? res.json() : [])),
      fetch('/api/roles').then((res) => (res.ok ? res.json() : [])),
    ]);
    setUsers(u);
    setRoles(r);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const notify = (tone: 'ok' | 'err', text: string) => {
    setBanner({ tone, text });
    setTimeout(() => setBanner(null), 4000);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
  }, [users, query]);

  const openCreate = () => {
    setForm({ name: '', email: '', roleIds: [] });
    setFormError('');
    setCreating(true);
  };

  const openEdit = (user: UserRow) => {
    setForm({ name: user.name, email: user.email, roleIds: user.roles.map((r) => r.id) });
    setFormError('');
    setEditing(user);
  };

  const closePanel = () => {
    setCreating(false);
    setEditing(null);
  };

  const save = async () => {
    setSaving(true);
    setFormError('');
    try {
      const res = creating
        ? await fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(form),
          })
        : await fetch(`/api/users/${editing!.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: form.name, roleIds: form.roleIds }),
          });

      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || 'Не удалось сохранить');
        return;
      }
      notify('ok', creating ? 'Сотрудник добавлен, приглашение отправлено' : 'Изменения сохранены');
      closePanel();
      load();
    } finally {
      setSaving(false);
    }
  };

  const patchUser = async (id: string, body: Record<string, unknown>, okText: string) => {
    const res = await fetch(`/api/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    notify(res.ok ? 'ok' : 'err', res.ok ? okText : data.error || 'Не удалось выполнить');
    if (res.ok) load();
  };

  const sendInvite = async (id: string) => {
    const res = await fetch(`/api/users/${id}/invite`, { method: 'POST' });
    const data = await res.json();
    notify(res.ok ? 'ok' : 'err', res.ok ? 'Приглашение отправлено' : data.error || 'Ошибка');
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-ink">Пользователи</h2>
          <p className="mt-1 text-sm text-ink-muted">Сотрудники программы и назначенные им роли</p>
        </div>
        <Button variant="primary" onClick={openCreate}>
          <UserPlus className="h-4 w-4" />
          Добавить
        </Button>
      </div>

      {banner && (
        <div
          className={
            banner.tone === 'ok'
              ? 'mb-4 rounded-lg border border-success/25 bg-success/[0.07] px-3 py-2.5 text-[13px] text-success'
              : 'mb-4 rounded-lg border border-danger/25 bg-danger/[0.07] px-3 py-2.5 text-[13px] text-danger'
          }
        >
          {banner.text}
        </div>
      )}

      <div className="mb-4 max-w-xs">
        <Input
          placeholder="Поиск по имени или почте"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          leading={<Search className="h-4 w-4" />}
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl border border-line bg-surface-muted" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users2}
          title={query ? 'Никого не нашлось' : 'Сотрудников пока нет'}
          description={
            query
              ? 'Попробуйте изменить запрос.'
              : 'Добавьте сотрудника — он получит письмо со ссылкой для входа и сам задаст пароль.'
          }
          action={!query && <Button variant="secondary" onClick={openCreate}>Добавить сотрудника</Button>}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <table className="w-full">
            <thead>
              <tr className="border-b border-line bg-surface-muted/50">
                <th className="px-4 py-2.5 text-left text-2xs font-semibold uppercase tracking-wider text-ink-faint">
                  Сотрудник
                </th>
                <th className="px-4 py-2.5 text-left text-2xs font-semibold uppercase tracking-wider text-ink-faint">
                  Роли
                </th>
                <th className="px-4 py-2.5 text-left text-2xs font-semibold uppercase tracking-wider text-ink-faint">
                  Статус
                </th>
                <th className="hidden px-4 py-2.5 text-left text-2xs font-semibold uppercase tracking-wider text-ink-faint sm:table-cell">
                  Последний вход
                </th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((user) => (
                <tr key={user.id} className="transition-colors hover:bg-surface-muted/40">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[11px] font-semibold text-brand">
                        {user.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-ink">{user.name}</p>
                        <p className="truncate text-xs text-ink-muted">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {user.roles.length === 0 ? (
                        <span className="text-xs text-ink-faint">без роли</span>
                      ) : (
                        user.roles.map((r) => (
                          <Badge key={r.id} tone={r.key === 'admin' ? 'brand' : 'neutral'}>
                            {r.name}
                          </Badge>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {!user.isActive ? (
                      <Badge tone="danger">Отключён</Badge>
                    ) : user.isLocked ? (
                      <Badge tone="warning">Заблокирован</Badge>
                    ) : user.isPending ? (
                      <Badge tone="warning">Ожидает входа</Badge>
                    ) : (
                      <Badge tone="success">Активен</Badge>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-[13px] text-ink-muted sm:table-cell">
                    {user.lastLoginAt ? dateFormat.format(new Date(user.lastLoginAt)) : '—'}
                  </td>
                  <td className="px-2 py-3">
                    <RowMenu
                      items={[
                        {
                          label: 'Изменить',
                          icon: <Pencil className="h-4 w-4" />,
                          onClick: () => openEdit(user),
                        },
                        {
                          label: 'Отправить приглашение',
                          icon: <Send className="h-4 w-4" />,
                          hidden: !user.isActive,
                          onClick: () => sendInvite(user.id),
                        },
                        {
                          label: 'Снять блокировку',
                          icon: <Unlock className="h-4 w-4" />,
                          hidden: !user.isLocked,
                          onClick: () => patchUser(user.id, { unlock: true }, 'Блокировка снята'),
                        },
                        {
                          label: user.isActive ? 'Отключить доступ' : 'Включить доступ',
                          icon: user.isActive ? <Ban className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />,
                          danger: user.isActive,
                          onClick: () =>
                            patchUser(
                              user.id,
                              { isActive: !user.isActive },
                              user.isActive ? 'Доступ отключён' : 'Доступ восстановлен'
                            ),
                        },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SlideOver
        open={creating || Boolean(editing)}
        onClose={closePanel}
        title={creating ? 'Новый сотрудник' : 'Изменение сотрудника'}
        subtitle={creating ? 'Пароль сотрудник задаст сам по ссылке из письма' : editing?.email}
        footer={
          <>
            <Button variant="ghost" onClick={closePanel}>
              Отмена
            </Button>
            <Button variant="primary" onClick={save} loading={saving}>
              {creating ? 'Добавить и пригласить' : 'Сохранить'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-danger/25 bg-danger/[0.07] px-3 py-2.5 text-[13px] text-danger">
              {formError}
            </div>
          )}

          <Input
            label="Имя и фамилия"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Иван Петров"
          />

          <Input
            label="Электронная почта"
            type="email"
            value={form.email}
            disabled={!creating}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="name@company.ru"
            hint={creating ? 'На этот адрес придёт приглашение' : 'Почту изменить нельзя'}
          />

          <div>
            <p className="mb-1 text-[13px] font-medium text-ink">Роли</p>
            <p className="mb-2 text-xs text-ink-muted">Определяют, какие разделы доступны сотруднику</p>
            <div className="rounded-lg border border-line p-1">
              {roles.map((role) => (
                <Checkbox
                  key={role.id}
                  checked={form.roleIds.includes(role.id)}
                  onChange={(checked) =>
                    setForm({
                      ...form,
                      roleIds: checked
                        ? [...form.roleIds, role.id]
                        : form.roleIds.filter((id) => id !== role.id),
                    })
                  }
                  label={role.name}
                  hint={role.description ?? undefined}
                />
              ))}
            </div>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
