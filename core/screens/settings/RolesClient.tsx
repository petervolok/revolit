'use client';

import { useCallback, useEffect, useState } from 'react';
import { Lock, Pencil, Plus, ShieldCheck, Trash2, Users2 } from 'lucide-react';
import Badge from '../../ui/Badge';
import Button from '../../ui/Button';
import Checkbox from '../../ui/Checkbox';
import Input from '../../ui/Input';
import RowMenu from '../../ui/RowMenu';
import SlideOver from '../../ui/SlideOver';
import type { PermissionGroup } from '../../auth/permissions';

interface RoleRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  permissions: string[];
  isSystem: boolean;
  userCount: number;
}

/** Список прав приходит сверху: он зависит от подключённых модулей */
export default function RolesClient({ permissionGroups }: { permissionGroups: PermissionGroup[] }) {
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const [editing, setEditing] = useState<RoleRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', permissions: [] as string[] });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    const res = await fetch('/api/roles');
    setRoles(res.ok ? await res.json() : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const notify = (tone: 'ok' | 'err', text: string) => {
    setBanner({ tone, text });
    setTimeout(() => setBanner(null), 4000);
  };

  const openCreate = () => {
    setForm({ name: '', description: '', permissions: [] });
    setFormError('');
    setCreating(true);
  };

  const openEdit = (role: RoleRow) => {
    setForm({
      name: role.name,
      description: role.description ?? '',
      permissions: role.permissions,
    });
    setFormError('');
    setEditing(role);
  };

  const closePanel = () => {
    setCreating(false);
    setEditing(null);
  };

  const save = async () => {
    setSaving(true);
    setFormError('');
    try {
      const isSystem = editing?.isSystem ?? false;
      const payload = isSystem
        ? { name: form.name, description: form.description }
        : form;

      const res = creating
        ? await fetch('/api/roles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch(`/api/roles/${editing!.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || 'Не удалось сохранить');
        return;
      }
      notify('ok', creating ? 'Роль создана' : 'Роль обновлена');
      closePanel();
      load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (role: RoleRow) => {
    const res = await fetch(`/api/roles/${role.id}`, { method: 'DELETE' });
    const data = await res.json();
    notify(res.ok ? 'ok' : 'err', res.ok ? 'Роль удалена' : data.error || 'Не удалось удалить');
    if (res.ok) load();
  };

  const editingSystem = editing?.isSystem ?? false;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-ink">Роли и права</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Роль описывает рабочее место: что сотрудник видит и что может делать
          </p>
        </div>
        <Button variant="primary" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Новая роль
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

      {loading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl border border-line bg-surface-muted" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {roles.map((role) => (
            <div key={role.id} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-ink-muted">
                  <ShieldCheck className="h-[18px] w-[18px]" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-ink">{role.name}</h3>
                    {role.isSystem && (
                      <Badge tone="brand">
                        <Lock className="mr-1 h-2.5 w-2.5" />
                        системная
                      </Badge>
                    )}
                    <span className="inline-flex items-center gap-1 text-xs text-ink-faint">
                      <Users2 className="h-3 w-3" />
                      {role.userCount}
                    </span>
                  </div>

                  {role.description && (
                    <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{role.description}</p>
                  )}

                  <div className="mt-2.5 flex flex-wrap gap-1">
                    {role.permissions.includes('*') ? (
                      <Badge tone="brand">полный доступ</Badge>
                    ) : role.permissions.length === 0 ? (
                      <span className="text-xs text-ink-faint">права не назначены</span>
                    ) : (
                      permissionGroups.flatMap((g) => g.items)
                        .filter((p) => role.permissions.includes(p.key))
                        .map((p) => <Badge key={p.key}>{p.label}</Badge>)
                    )}
                  </div>
                </div>

                <RowMenu
                  items={[
                    {
                      label: 'Изменить',
                      icon: <Pencil className="h-4 w-4" />,
                      onClick: () => openEdit(role),
                    },
                    {
                      label: 'Удалить роль',
                      icon: <Trash2 className="h-4 w-4" />,
                      danger: true,
                      hidden: role.isSystem,
                      onClick: () => remove(role),
                    },
                  ]}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <SlideOver
        open={creating || Boolean(editing)}
        onClose={closePanel}
        title={creating ? 'Новая роль' : 'Изменение роли'}
        subtitle={editingSystem ? 'Права системной роли изменить нельзя' : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={closePanel}>
              Отмена
            </Button>
            <Button variant="primary" onClick={save} loading={saving}>
              Сохранить
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
            label="Название роли"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Например: Менеджер по продажам"
          />

          <Input
            label="Описание"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Чем занимается это рабочее место"
          />

          <div>
            <p className="mb-2 text-[13px] font-medium text-ink">Права</p>
            {editingSystem ? (
              <div className="rounded-lg border border-line bg-surface-muted px-3 py-3 text-[13px] text-ink-muted">
                Роль администратора всегда имеет полный доступ. Это защищает программу от ситуации,
                когда управление настройками случайно теряется.
              </div>
            ) : (
              <div className="space-y-3">
                {permissionGroups.map((group) => (
                  <div key={group.title} className="rounded-lg border border-line p-1">
                    <p className="px-2 pb-1 pt-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-faint">
                      {group.title}
                    </p>
                    {group.items.map((item) => (
                      <Checkbox
                        key={item.key}
                        checked={form.permissions.includes(item.key)}
                        onChange={(checked) =>
                          setForm({
                            ...form,
                            permissions: checked
                              ? [...form.permissions, item.key]
                              : form.permissions.filter((p) => p !== item.key),
                          })
                        }
                        label={item.label}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
