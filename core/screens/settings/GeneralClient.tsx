'use client';

import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import Button from '../../ui/Button';
import Checkbox from '../../ui/Checkbox';
import Input from '../../ui/Input';

interface Settings {
  programName: string;
  appUrl: string;
  mailHost: string;
  mailPort: number;
  mailSecure: boolean;
  mailUser: string;
  mailFrom: string;
  mailPassSet: boolean;
}

const EMPTY: Settings = {
  programName: '',
  appUrl: '',
  mailHost: '',
  mailPort: 587,
  mailSecure: false,
  mailUser: '',
  mailFrom: '',
  mailPassSet: false,
};

export default function GeneralClient() {
  const [data, setData] = useState<Settings>(EMPTY);
  const [mailPass, setMailPass] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [banner, setBanner] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => (res.ok ? res.json() : EMPTY))
      .then((body) => {
        setData(body);
        setLoading(false);
      });
  }, []);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setData((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    setSaving(true);
    setBanner(null);
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, mailPass }),
    });
    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setBanner({ tone: 'err', text: body.error ?? 'Не удалось сохранить' });
      return;
    }

    setMailPass('');
    setData((prev) => ({ ...prev, mailPassSet: prev.mailPassSet || Boolean(mailPass) }));
    setBanner({ tone: 'ok', text: 'Настройки сохранены' });
  };

  const sendTest = async () => {
    setTesting(true);
    setBanner(null);
    const res = await fetch('/api/settings/test-mail', { method: 'POST' });
    setTesting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setBanner({ tone: 'err', text: body.error ?? 'Не удалось отправить письмо' });
      return;
    }
    setBanner({ tone: 'ok', text: 'Письмо отправлено на вашу почту' });
  };

  if (loading) return null;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-lg font-semibold text-ink">Общие настройки</h1>
      <p className="mb-6 text-[13px] text-ink-muted">Название, адрес и почта программы</p>

      {banner && (
        <div
          className={
            'mb-5 rounded-lg border px-3.5 py-2.5 text-[13px] ' +
            (banner.tone === 'ok' ? 'border-line bg-surface-muted text-ink' : 'border-danger/30 bg-danger/5 text-danger')
          }
        >
          {banner.text}
        </div>
      )}

      <section className="mb-6">
        <h2 className="mb-3 text-[13px] font-semibold text-ink">Программа</h2>
        <div className="flex flex-col gap-4 rounded-xl border border-line p-4">
          <Input
            label="Название"
            value={data.programName}
            onChange={(e) => set('programName', e.target.value)}
          />
          <Input
            label="Адрес программы"
            hint="Используется в ссылках из писем. Пусто — определяется автоматически по адресу запроса."
            placeholder="https://crm.company.ru"
            value={data.appUrl}
            onChange={(e) => set('appUrl', e.target.value)}
          />
        </div>
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-[13px] font-semibold text-ink">Почта</h2>
        <div className="flex flex-col gap-4 rounded-xl border border-line p-4">
          <Input
            label="Адрес сервера"
            hint="Пусто — письма только записываются в журнал сервера, не отправляются"
            placeholder="smtp.example.ru"
            value={data.mailHost}
            onChange={(e) => set('mailHost', e.target.value)}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Порт"
              type="number"
              value={data.mailPort}
              onChange={(e) => set('mailPort', Number(e.target.value))}
            />
            <div className="flex items-end pb-2.5">
              <Checkbox
                checked={data.mailSecure}
                onChange={(v) => set('mailSecure', v)}
                label="Защищённое соединение"
              />
            </div>
          </div>
          <Input label="Логин" value={data.mailUser} onChange={(e) => set('mailUser', e.target.value)} />
          <Input
            label="Пароль"
            type="password"
            hint={data.mailPassSet ? 'Пароль уже задан — оставьте пустым, чтобы не менять' : undefined}
            placeholder={data.mailPassSet ? '••••••••' : ''}
            value={mailPass}
            onChange={(e) => setMailPass(e.target.value)}
          />
          <Input
            label="Адрес отправителя"
            placeholder="Моя компания <no-reply@company.ru>"
            value={data.mailFrom}
            onChange={(e) => set('mailFrom', e.target.value)}
          />

          <div>
            <Button variant="secondary" onClick={sendTest} loading={testing} disabled={!data.mailHost}>
              <Send className="h-4 w-4" /> Отправить тестовое письмо
            </Button>
          </div>
        </div>
      </section>

      <Button variant="primary" size="lg" loading={saving} onClick={save}>
        Сохранить
      </Button>
    </div>
  );
}
