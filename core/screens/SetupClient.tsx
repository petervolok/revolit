'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import AuthLayout from './AuthLayout';
import Button from '../ui/Button';
import Checkbox from '../ui/Checkbox';
import Input from '../ui/Input';

export default function SetupClient() {
  const router = useRouter();

  const [programName, setProgramName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminPasswordRepeat, setAdminPasswordRepeat] = useState('');

  const [mailEnabled, setMailEnabled] = useState(false);
  const [mailHost, setMailHost] = useState('');
  const [mailPort, setMailPort] = useState('587');
  const [mailSecure, setMailSecure] = useState(false);
  const [mailUser, setMailUser] = useState('');
  const [mailPass, setMailPass] = useState('');
  const [mailFrom, setMailFrom] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (adminPassword !== adminPasswordRepeat) {
      setError('Пароли не совпадают');
      return;
    }

    setLoading(true);
    const res = await fetch('/api/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        programName,
        adminName,
        adminEmail,
        adminPassword,
        mail: mailEnabled
          ? { host: mailHost, port: Number(mailPort), secure: mailSecure, user: mailUser, pass: mailPass, from: mailFrom }
          : null,
      }),
    });
    setLoading(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'Не удалось выполнить установку');
      return;
    }

    router.push('/login');
  };

  return (
    <AuthLayout footnote="Эта форма доступна только один раз — сразу после установки.">
      <h1 className="mb-1.5 text-xl font-semibold text-ink">Первый запуск</h1>
      <p className="mb-7 text-[13px] text-ink-muted">
        Создайте программу и учётную запись администратора
      </p>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <Input
          label="Название программы"
          placeholder="Моя компания"
          value={programName}
          onChange={(e) => setProgramName(e.target.value)}
          required
        />

        <div className="my-1 border-t border-line" />

        <Input
          label="Имя администратора"
          placeholder="Иван Петров"
          value={adminName}
          onChange={(e) => setAdminName(e.target.value)}
          required
        />
        <Input
          label="Почта администратора"
          type="email"
          placeholder="you@company.ru"
          value={adminEmail}
          onChange={(e) => setAdminEmail(e.target.value)}
          required
        />
        <Input
          label="Пароль"
          type="password"
          hint="Не короче 10 символов, буквы и цифры"
          value={adminPassword}
          onChange={(e) => setAdminPassword(e.target.value)}
          required
        />
        <Input
          label="Повторите пароль"
          type="password"
          value={adminPasswordRepeat}
          onChange={(e) => setAdminPasswordRepeat(e.target.value)}
          required
        />

        <div className="my-1 border-t border-line" />

        <Checkbox
          checked={mailEnabled}
          onChange={setMailEnabled}
          label="Настроить почту сейчас"
          hint="Можно пропустить — письма тогда будут только в журнале сервера, настроить получится позже"
        />

        {mailEnabled && (
          <div className="flex flex-col gap-3 rounded-lg border border-line p-3">
            <Input
              label="Адрес сервера"
              placeholder="smtp.example.ru"
              value={mailHost}
              onChange={(e) => setMailHost(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Порт"
                type="number"
                value={mailPort}
                onChange={(e) => setMailPort(e.target.value)}
              />
              <div className="flex items-end pb-2.5">
                <Checkbox checked={mailSecure} onChange={setMailSecure} label="Защищённое соединение" />
              </div>
            </div>
            <Input label="Логин" value={mailUser} onChange={(e) => setMailUser(e.target.value)} />
            <Input
              label="Пароль"
              type="password"
              value={mailPass}
              onChange={(e) => setMailPass(e.target.value)}
            />
            <Input
              label="Адрес отправителя"
              placeholder="Моя компания <no-reply@company.ru>"
              value={mailFrom}
              onChange={(e) => setMailFrom(e.target.value)}
            />
          </div>
        )}

        {error && <p className="text-xs text-danger">{error}</p>}

        <Button type="submit" variant="primary" size="lg" loading={loading} className="mt-2 w-full">
          <CheckCircle2 className="h-4 w-4" /> Завершить установку
        </Button>
      </form>
    </AuthLayout>
  );
}
