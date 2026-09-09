'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, Plus, Sparkles, Trash2 } from 'lucide-react';
import Badge from '../../ui/Badge';
import Button from '../../ui/Button';
import Input from '../../ui/Input';
import RowMenu from '../../ui/RowMenu';
import Select from '../../ui/Select';
import SlideOver from '../../ui/SlideOver';
import type { AiKeyGroupSummary, AiProvider } from '../../ai/types';

const PROVIDER_LABEL: Record<AiProvider, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI (GPT)',
  gemini: 'Google (Gemini)',
};

const DEFAULT_MODEL_PLACEHOLDER: Record<AiProvider, string> = {
  anthropic: 'claude-sonnet-5',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-3.6-flash',
};

export default function AiSettingsClient() {
  const [groups, setGroups] = useState<AiKeyGroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [groupOpen, setGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupProvider, setGroupProvider] = useState<AiProvider>('anthropic');
  const [groupModel, setGroupModel] = useState('');

  const [keyGroupId, setKeyGroupId] = useState<string | null>(null);
  const [keyValue, setKeyValue] = useState('');
  const [keyLabel, setKeyLabel] = useState('');

  const load = async () => {
    const res = await fetch('/api/ai-groups');
    setGroups(res.ok ? await res.json() : []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const openCreateGroup = () => {
    setGroupName('');
    setGroupProvider('anthropic');
    setGroupModel('');
    setError('');
    setGroupOpen(true);
  };

  const createGroup = async () => {
    setBusy(true);
    setError('');
    const res = await fetch('/api/ai-groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: groupName, provider: groupProvider, model: groupModel || undefined }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'Не удалось создать группу');
      return;
    }
    setGroupOpen(false);
    setNotice('Группа создана — добавьте в неё хотя бы один ключ');
    load();
  };

  const setActive = async (group: AiKeyGroupSummary) => {
    setBusy(true);
    setNotice('');
    await fetch(`/api/ai-groups/${group.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !group.active }),
    });
    setBusy(false);
    setNotice(group.active ? `Группа «${group.name}» больше не активна` : `Группа «${group.name}» теперь активна`);
    load();
  };

  const removeGroup = async (group: AiKeyGroupSummary) => {
    if (!confirm(`Удалить группу «${group.name}» вместе со всеми её ключами?`)) return;
    setBusy(true);
    await fetch(`/api/ai-groups/${group.id}`, { method: 'DELETE' });
    setBusy(false);
    setNotice('Группа удалена');
    load();
  };

  const openAddKey = (groupId: string) => {
    setKeyGroupId(groupId);
    setKeyValue('');
    setKeyLabel('');
    setError('');
  };

  const addKey = async () => {
    if (!keyGroupId) return;
    setBusy(true);
    setError('');
    const res = await fetch(`/api/ai-groups/${keyGroupId}/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: keyValue, label: keyLabel || undefined }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'Не удалось добавить ключ');
      return;
    }
    setKeyGroupId(null);
    setNotice('Ключ добавлен');
    load();
  };

  const removeKey = async (groupId: string, keyId: string) => {
    if (!confirm('Удалить этот ключ из группы?')) return;
    setBusy(true);
    await fetch(`/api/ai-groups/${groupId}/keys/${keyId}`, { method: 'DELETE' });
    setBusy(false);
    setNotice('Ключ удалён');
    load();
  };

  if (loading) return null;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink">ИИ-консультант</h1>
          <p className="mt-1 text-[13px] text-ink-muted">
            Ключи — ваши собственные. Несколько ключей можно объединить в группу: если у активного
            кончился лимит, система сама пробует следующий ключ группы по порядку.
          </p>
        </div>
        <Button variant="primary" onClick={openCreateGroup}>
          <Plus className="h-4 w-4" /> Группа
        </Button>
      </div>

      {notice && (
        <div className="mb-4 rounded-lg border border-line bg-surface-muted px-3.5 py-2.5 text-[13px] text-ink">{notice}</div>
      )}

      {groups.length === 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-line p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-ink-faint">
            <Sparkles className="h-4.5 w-4.5" />
          </span>
          <div>
            <p className="text-[13px] font-medium text-ink">Групп ключей пока нет</p>
            <p className="mt-1 text-xs text-ink-muted">
              Создайте группу, добавьте в неё ключ и сделайте её активной — консультант заработает.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {groups.map((group) => (
          <div key={group.id} className="rounded-xl border border-line p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-[13px] font-medium text-ink">{group.name}</p>
                  {group.active && (
                    <Badge tone="success">
                      <CheckCircle2 className="mr-1 h-3 w-3" /> активна
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {PROVIDER_LABEL[group.provider]} · модель {group.model}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button variant={group.active ? 'secondary' : 'primary'} size="sm" loading={busy} onClick={() => setActive(group)}>
                  {group.active ? 'Деактивировать' : 'Сделать активной'}
                </Button>
                <RowMenu
                  items={[
                    { label: 'Удалить группу', icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: () => removeGroup(group) },
                  ]}
                />
              </div>
            </div>

            <div className="mt-3 flex flex-col gap-1.5">
              {group.keys.length === 0 && <p className="text-xs text-ink-faint">Ключей пока нет</p>}
              {group.keys.map((key, i) => (
                <div key={key.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-muted px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="text-2xs text-ink-faint">{i + 1}.</span>
                    <KeyRound className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
                    <span className="truncate text-[13px] text-ink">{key.label || 'Без подписи'}</span>
                    <span className="shrink-0 font-mono text-xs text-ink-faint">{key.keyTail}</span>
                  </div>
                  <button
                    onClick={() => removeKey(group.id, key.id)}
                    className="shrink-0 rounded-md p-1 text-ink-faint transition-colors hover:bg-surface hover:text-danger"
                    aria-label="Удалить ключ"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <Button variant="ghost" size="sm" className="mt-2" onClick={() => openAddKey(group.id)}>
              <Plus className="h-4 w-4" /> Добавить ключ
            </Button>
          </div>
        ))}
      </div>

      <SlideOver
        open={groupOpen}
        onClose={() => setGroupOpen(false)}
        title="Новая группа ключей"
        footer={
          <>
            <Button variant="secondary" onClick={() => setGroupOpen(false)}>
              Отмена
            </Button>
            <Button variant="primary" loading={busy} onClick={createGroup}>
              Создать
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input label="Название группы" placeholder="Основные ключи" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-ink">Поставщик</label>
            <Select value={groupProvider} onChange={(e) => setGroupProvider(e.target.value as AiProvider)}>
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="openai">OpenAI (GPT)</option>
              <option value="gemini">Google (Gemini)</option>
            </Select>
          </div>
          <Input
            label="Модель (необязательно)"
            placeholder={DEFAULT_MODEL_PLACEHOLDER[groupProvider]}
            value={groupModel}
            onChange={(e) => setGroupModel(e.target.value)}
          />
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
      </SlideOver>

      <SlideOver
        open={keyGroupId !== null}
        onClose={() => setKeyGroupId(null)}
        title="Новый ключ"
        footer={
          <>
            <Button variant="secondary" onClick={() => setKeyGroupId(null)}>
              Отмена
            </Button>
            <Button variant="primary" loading={busy} onClick={addKey}>
              Добавить
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            type="password"
            label="Ключ API"
            placeholder="sk-... / AIzaSy..."
            value={keyValue}
            onChange={(e) => setKeyValue(e.target.value)}
          />
          <Input
            label="Подпись (необязательно)"
            placeholder="Например, «второй кабинет»"
            value={keyLabel}
            onChange={(e) => setKeyLabel(e.target.value)}
          />
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
      </SlideOver>
    </div>
  );
}
