'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Boxes, LayoutTemplate, Pencil, Plus, Settings2, Sparkles, Trash2 } from 'lucide-react';
import Link from 'next/link';
import Button from '../../ui/Button';
import EmptyState from '../../ui/EmptyState';
import Input from '../../ui/Input';
import RowMenu from '../../ui/RowMenu';
import SlideOver from '../../ui/SlideOver';
import type { EntityPresetDef, EntityTemplateDef } from '../../entities/types';

type CreatorMode = 'picker' | 'blank';

export default function EntitiesClient() {
  const [templates, setTemplates] = useState<EntityTemplateDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const [presets, setPresets] = useState<EntityPresetDef[]>([]);
  const [presetsLoaded, setPresetsLoaded] = useState(false);
  const [usingPreset, setUsingPreset] = useState<string | null>(null);

  const [editing, setEditing] = useState<EntityTemplateDef | null>(null);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [creatorMode, setCreatorMode] = useState<CreatorMode>('picker');
  const [form, setForm] = useState({ name: '', namePlural: '' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    const res = await fetch('/api/entities');
    setTemplates(res.ok ? await res.json() : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loadPresets = useCallback(async () => {
    const res = await fetch('/api/entity-presets');
    setPresets(res.ok ? await res.json() : []);
    setPresetsLoaded(true);
  }, []);

  const openCreate = () => {
    setEditing(null);
    setCreatorMode('picker');
    setFormError('');
    setCreatorOpen(true);
    if (!presetsLoaded) loadPresets();
  };

  const openBlank = () => {
    setForm({ name: '', namePlural: '' });
    setCreatorMode('blank');
  };

  const openEdit = (t: EntityTemplateDef) => {
    setEditing(t);
    setForm({ name: t.name, namePlural: t.namePlural });
    setFormError('');
    setCreatorMode('blank');
    setCreatorOpen(true);
  };

  const usePreset = async (key: string) => {
    setUsingPreset(key);
    const res = await fetch(`/api/entity-presets/${key}/use`, { method: 'POST' });
    setUsingPreset(null);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setBanner({ tone: 'err', text: body.error ?? 'Не удалось создать сущность' });
      return;
    }

    const body = await res.json();
    setCreatorOpen(false);
    setBanner({
      tone: 'ok',
      text:
        body.skippedFields?.length > 0
          ? `Сущность создана. Поле «${body.skippedFields.join('», «')}» пропущено — сначала создайте связанную сущность.`
          : 'Сущность создана из шаблона',
    });
    load();
  };

  const save = async () => {
    setSaving(true);
    setFormError('');
    const url = editing ? `/api/entities/${editing.key}` : '/api/entities';
    const res = await fetch(url, {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setFormError(body.error ?? 'Не удалось сохранить');
      return;
    }

    setCreatorOpen(false);
    setBanner({ tone: 'ok', text: editing ? 'Сущность переименована' : 'Сущность создана' });
    load();
  };

  const remove = async (t: EntityTemplateDef) => {
    if (!confirm(`Удалить сущность «${t.namePlural}»?`)) return;
    const res = await fetch(`/api/entities/${t.key}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setBanner({ tone: 'err', text: body.error ?? 'Не удалось удалить' });
      return;
    }
    setBanner({ tone: 'ok', text: 'Сущность удалена' });
    load();
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink">Сущности</h1>
          <p className="mt-1 text-[13px] text-ink-muted">
            Каждая сущность — раздел данных: свой пункт меню, свои поля, свой список записей.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/settings/entity-presets">
            <Button variant="secondary">
              <Settings2 className="h-4 w-4" /> Шаблоны
            </Button>
          </Link>
          <Button variant="primary" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Добавить сущность
          </Button>
        </div>
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

      {!loading && templates.length === 0 && (
        <EmptyState
          icon={Boxes}
          title="Сущностей пока нет"
          description="Добавьте первую — и в меню слева сразу появится раздел с записями."
          action={
            <Button variant="primary" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Добавить сущность
            </Button>
          }
        />
      )}

      {templates.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-line">
          {templates.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0"
            >
              <div className="min-w-0">
                <Link href={`/settings/entities/${t.key}`} className="text-[13px] font-medium text-ink hover:underline">
                  {t.namePlural}
                </Link>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {t.fields.length} {t.fields.length === 1 ? 'поле' : 'полей'}
                  {t.hasRecords ? ' · есть записи' : ' · пока пусто'}
                </p>
              </div>
              <RowMenu
                items={[
                  { label: 'Переименовать', icon: <Pencil className="h-4 w-4" />, onClick: () => openEdit(t) },
                  {
                    label: 'Удалить',
                    icon: <Trash2 className="h-4 w-4" />,
                    danger: true,
                    hidden: t.hasRecords,
                    onClick: () => remove(t),
                  },
                ]}
              />
            </div>
          ))}
        </div>
      )}

      <SlideOver
        open={creatorOpen}
        onClose={() => setCreatorOpen(false)}
        width={creatorMode === 'picker' ? 'lg' : 'md'}
        title={
          editing
            ? 'Переименование сущности'
            : creatorMode === 'picker'
              ? 'Новая сущность'
              : 'Сущность с нуля'
        }
        subtitle={creatorMode === 'picker' ? 'Начните с готового шаблона или с чистого листа' : undefined}
        footer={
          creatorMode === 'picker' ? (
            <Button variant="secondary" onClick={() => setCreatorOpen(false)}>
              Закрыть
            </Button>
          ) : (
            <>
              {!editing && (
                <Button variant="ghost" onClick={() => setCreatorMode('picker')}>
                  <ArrowLeft className="h-4 w-4" /> К шаблонам
                </Button>
              )}
              <Button variant="secondary" onClick={() => setCreatorOpen(false)}>
                Отмена
              </Button>
              <Button variant="primary" loading={saving} onClick={save}>
                Сохранить
              </Button>
            </>
          )
        }
      >
        {creatorMode === 'picker' ? (
          <div className="flex flex-col gap-4">
            <button
              onClick={openBlank}
              className="flex items-center gap-3 rounded-xl border border-dashed border-line p-3.5 text-left transition-colors hover:bg-surface-muted"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-ink-faint">
                <Sparkles className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-[13px] font-medium text-ink">Создать с нуля</span>
                <span className="block text-xs text-ink-muted">Своё название, поля добавите сами</span>
              </span>
            </button>

            {!presetsLoaded && <p className="text-[13px] text-ink-muted">Загрузка шаблонов…</p>}

            {presetsLoaded && (
              <div className="grid grid-cols-2 gap-2.5">
                {presets.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => usePreset(p.key)}
                    disabled={usingPreset !== null}
                    className="flex flex-col items-start gap-1 rounded-xl border border-line p-3.5 text-left transition-colors hover:border-brand/50 hover:bg-surface-muted disabled:opacity-50"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10 text-brand">
                      <LayoutTemplate className="h-4 w-4" />
                    </span>
                    <span className="mt-1 text-[13px] font-medium text-ink">{p.namePlural}</span>
                    <span className="text-xs text-ink-muted">{p.fields.length} полей</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <Input
              label="Название в единственном числе"
              placeholder="Контрагент"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <Input
              label="Название во множественном числе"
              hint="Так раздел будет называться в меню"
              placeholder="Контрагенты"
              value={form.namePlural}
              onChange={(e) => setForm((f) => ({ ...f, namePlural: e.target.value }))}
            />
            {formError && <p className="text-xs text-danger">{formError}</p>}
          </div>
        )}
      </SlideOver>
    </div>
  );
}
