'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, KeyRound, Trash2 } from 'lucide-react';
import Badge from '../../ui/Badge';
import Button from '../../ui/Button';
import Checkbox from '../../ui/Checkbox';
import Input from '../../ui/Input';
import Select from '../../ui/Select';

interface TokenRow {
  id: string;
  name: string;
  prefix: string;
  readOnly: boolean;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
  user: { id: string; name: string; email: string };
}

const dateTime = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });

function status(t: TokenRow): { label: string; tone: 'success' | 'neutral' | 'danger' } {
  if (t.revokedAt) return { label: 'отозван', tone: 'danger' };
  if (t.expiresAt && new Date(t.expiresAt) < new Date()) return { label: 'истёк', tone: 'neutral' };
  return { label: 'действует', tone: 'success' };
}

/** Токены доступа к REST API и краткая справка по нему */
export default function ApiClient() {
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [readOnly, setReadOnly] = useState(false);
  const [days, setDays] = useState('90');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState('');

  const load = useCallback(async () => {
    const res = await fetch('/api/api-tokens');
    setTokens(res.ok ? await res.json() : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
    load();
  }, [load]);

  const create = async () => {
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/api-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, readOnly, expiresInDays: days || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Не удалось выпустить токен');
        return;
      }
      setFresh(data.token);
      setCopied(false);
      setName('');
      load();
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (t: TokenRow) => {
    if (!confirm(`Отозвать токен «${t.name}»? Всё, что работает по нему, перестанет получать данные.`)) return;
    const res = await fetch(`/api/api-tokens/${t.id}`, { method: 'DELETE' });
    if (res.ok) load();
    else setError((await res.json().catch(() => ({}))).error || 'Не удалось отозвать токен');
  };

  const copy = async () => {
    if (!fresh) return;
    await navigator.clipboard.writeText(fresh).catch(() => undefined);
    setCopied(true);
  };

  const downloadSpec = async () => {
    const res = await fetch('/api/api-tokens/openapi');
    if (!res.ok) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(await res.json(), null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'openapi.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const base = `${origin}/api/v1`;
  const code = 'rounded-lg border border-line bg-surface-muted px-3 py-2 font-mono text-xs text-ink overflow-x-auto whitespace-pre';

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6">
        <h2 className="text-xl font-semibold tracking-tight text-ink">Доступ к API</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Токен даёт внешней программе или скрипту те же права на данные, что и у вас. Отнимете у себя роль — токен потеряет доступ.
        </p>
      </div>

      {fresh && (
        <div className="mb-6 rounded-xl border border-success/30 bg-success/[0.07] p-4">
          <p className="text-[13px] font-medium text-ink">Токен выпущен. Скопируйте его сейчас — потом он не покажется.</p>
          <div className={`mt-2 ${code}`}>{fresh}</div>
          <div className="mt-2 flex items-center gap-2">
            <Button variant="secondary" onClick={copy}>
              <Copy className="h-4 w-4" /> {copied ? 'Скопировано' : 'Копировать'}
            </Button>
            <Button variant="ghost" onClick={() => setFresh(null)}>
              Я сохранил токен
            </Button>
          </div>
        </div>
      )}

      <div className="mb-8 rounded-xl border border-line p-4">
        <h3 className="mb-3 text-sm font-semibold text-ink">Новый токен</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Название" placeholder="Например: сайт, выгрузка в бухгалтерию" value={name} onChange={(e) => setName(e.target.value)} />
          <Select label="Срок действия" value={days} onChange={(e) => setDays(e.target.value)}>
            <option value="30">30 дней</option>
            <option value="90">90 дней</option>
            <option value="365">1 год</option>
            <option value="">Без срока</option>
          </Select>
        </div>
        <div className="mt-2">
          <Checkbox label="Только чтение — изменять данные по этому токену нельзя" checked={readOnly} onChange={setReadOnly} />
        </div>
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        <div className="mt-3">
          <Button variant="primary" onClick={create} loading={creating}>
            <KeyRound className="h-4 w-4" /> Выпустить токен
          </Button>
        </div>
      </div>

      <h3 className="mb-2 text-sm font-semibold text-ink">Токены программы</h3>
      {loading ? (
        <div className="h-16 animate-pulse rounded-xl border border-line bg-surface-muted" />
      ) : tokens.length === 0 ? (
        <p className="text-sm text-ink-muted">Токенов пока нет.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-line bg-surface-muted/60 text-xs text-ink-muted">
                <th className="px-4 py-2.5 font-medium">Название</th>
                <th className="px-4 py-2.5 font-medium">Сотрудник</th>
                <th className="px-4 py-2.5 font-medium">Статус</th>
                <th className="px-4 py-2.5 font-medium">Использован</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {tokens.map((t) => {
                const st = status(t);
                return (
                  <tr key={t.id} className="border-b border-line last:border-b-0">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-ink">{t.name}</div>
                      <div className="font-mono text-xs text-ink-faint">{t.prefix}…{t.readOnly ? ' · только чтение' : ''}</div>
                    </td>
                    <td className="px-4 py-2.5 text-ink">{t.user.name}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={st.tone}>{st.label}</Badge>
                      {t.expiresAt && !t.revokedAt && <div className="mt-0.5 text-xs text-ink-faint">до {dateTime.format(new Date(t.expiresAt))}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-ink-muted">{t.lastUsedAt ? dateTime.format(new Date(t.lastUsedAt)) : 'не использовался'}</td>
                    <td className="px-2 py-2.5 text-right">
                      {!t.revokedAt && (
                        <button type="button" aria-label="Отозвать" className="rounded-md p-1.5 text-ink-muted hover:bg-surface-muted" onClick={() => revoke(t)}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h3 className="mb-2 mt-8 text-sm font-semibold text-ink">Как пользоваться</h3>
      <div className="space-y-3 text-[13px] text-ink-muted">
        <p>Токен передаётся в заголовке Authorization. Адрес API: <span className="font-mono text-ink">{base}</span></p>
        <div className={code}>{`curl -H "Authorization: Bearer <токен>" \\\n  "${base}/entities"`}</div>
        <p>Записи сущности — с поиском, фильтрами, сортировкой и страницами:</p>
        <div className={code}>{`curl -H "Authorization: Bearer <токен>" \\\n  "${base}/entities/<сущность>/records?q=текст&sort=-price&page=1&pageSize=25&filter[price][gte]=100&filter[kind]=еда"`}</div>
        <p>Создание и изменение — тело вида {'{ "data": { "поле": значение } }'}; при изменении передаются только меняемые поля, null очищает поле:</p>
        <div className={code}>{`curl -X POST -H "Authorization: Bearer <токен>" -H "Content-Type: application/json" \\\n  -d '{"data":{"title":"Новый заказ"}}' "${base}/entities/<сущность>/records"`}</div>
        <p>
          Операции фильтра: eq, ne, contains, gt, gte, lt, lte, in, empty, notEmpty. Не больше 120 запросов в минуту на токен.
          Ошибки приходят в виде {'{ "error": { "code": …, "message": … } }'}.
        </p>
        <Button variant="secondary" onClick={downloadSpec}>
          Скачать описание API (OpenAPI)
        </Button>
      </div>
    </div>
  );
}
