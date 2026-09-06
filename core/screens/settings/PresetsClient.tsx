'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, LayoutTemplate, Pencil, Plus, Trash2 } from 'lucide-react';
import Button from '../../ui/Button';
import EmptyState from '../../ui/EmptyState';
import RowMenu from '../../ui/RowMenu';
import type { EntityPresetDef } from '../../entities/types';

export default function PresetsClient() {
  const [presets, setPresets] = useState<EntityPresetDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [banner, setBanner] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/entity-presets');
    setPresets(res.ok ? await res.json() : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createBlank = async () => {
    setCreating(true);
    const res = await fetch('/api/entity-presets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Новый шаблон',
        namePlural: 'Новые шаблоны',
        fields: [{ key: 'nazvanie', label: 'Название', type: 'text', required: true }],
      }),
    });
    setCreating(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setBanner({ tone: 'err', text: body.error ?? 'Не удалось создать шаблон' });
      return;
    }

    const preset: EntityPresetDef = await res.json();
    window.location.href = `/settings/entity-presets/${preset.key}`;
  };

  const remove = async (p: EntityPresetDef) => {
    if (!confirm(`Удалить шаблон «${p.namePlural}»?`)) return;
    const res = await fetch(`/api/entity-presets/${p.key}`, { method: 'DELETE' });
    if (!res.ok) {
      setBanner({ tone: 'err', text: 'Не удалось удалить' });
      return;
    }
    setBanner({ tone: 'ok', text: 'Шаблон удалён' });
    load();
  };

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/settings/entities" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-ink-muted hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> К списку сущностей
      </Link>

      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink">Шаблоны сущностей</h1>
          <p className="mt-1 text-[13px] text-ink-muted">
            Готовые наборы полей, которые предлагаются при создании новой сущности.
          </p>
        </div>
        <Button variant="primary" onClick={createBlank} loading={creating}>
          <Plus className="h-4 w-4" /> Добавить шаблон
        </Button>
      </div>

      {banner && (
        <div
          className={
            'mb-4 rounded-lg border px-3.5 py-2.5 text-[13px] ' +
            (banner.tone === 'ok' ? 'border-line bg-surface-muted text-ink' : 'border-danger/30 bg-danger/5 text-danger')
          }
        >
          {banner.text}
        </div>
      )}

      {!loading && presets.length === 0 && (
        <EmptyState
          icon={LayoutTemplate}
          title="Шаблонов нет"
          description="Добавьте шаблон — он появится в списке при создании новой сущности."
        />
      )}

      {presets.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-line">
          {presets.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0">
              <div className="min-w-0">
                <Link href={`/settings/entity-presets/${p.key}`} className="text-[13px] font-medium text-ink hover:underline">
                  {p.namePlural}
                </Link>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {p.fields.length} {p.fields.length === 1 ? 'поле' : 'полей'}
                </p>
              </div>
              <RowMenu
                items={[
                  { label: 'Изменить', icon: <Pencil className="h-4 w-4" />, onClick: () => (window.location.href = `/settings/entity-presets/${p.key}`) },
                  { label: 'Удалить', icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: () => remove(p) },
                ]}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
