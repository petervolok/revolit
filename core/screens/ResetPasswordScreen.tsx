'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Eye, EyeOff, Lock } from 'lucide-react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import AuthLayout from './AuthLayout';

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('Пароли не совпадают');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Не удалось изменить пароль');
        return;
      }
      setDone(true);
    } catch {
      setError('Сервер недоступен. Попробуйте ещё раз.');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <AuthLayout>
        <h1 className="text-[26px] font-semibold tracking-tight text-ink">Ссылка недействительна</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Похоже, ссылка неполная. Запросите восстановление пароля заново.
        </p>
        <Button variant="secondary" size="lg" className="mt-7 w-full" onClick={() => router.push('/login')}>
          Вернуться ко входу
        </Button>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout>
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-success/10 text-success">
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <h1 className="mt-5 text-[26px] font-semibold tracking-tight text-ink">Пароль изменён</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Все активные сессии завершены. Войдите с новым паролем.
        </p>
        <Button variant="primary" size="lg" className="mt-7 w-full" onClick={() => router.push('/login')}>
          Войти
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h1 className="text-[26px] font-semibold tracking-tight text-ink">Новый пароль</h1>
      <p className="mt-2 text-sm text-ink-muted">Придумайте пароль не короче 10 символов</p>

      <form onSubmit={submit} className="mt-8 space-y-4">
        {error && (
          <div className="rounded-lg border border-danger/25 bg-danger/[0.07] px-3 py-2.5 text-[13px] text-danger">
            {error}
          </div>
        )}

        <Input
          label="Новый пароль"
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          leading={<Lock className="h-4 w-4" />}
          trailing={
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? 'Скрыть пароль' : 'Показать пароль'}
              className="pointer-events-auto transition-colors hover:text-ink"
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
        />

        <Input
          label="Повторите пароль"
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          leading={<Lock className="h-4 w-4" />}
        />

        <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full">
          Сохранить пароль
        </Button>
      </form>
    </AuthLayout>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetForm />
    </Suspense>
  );
}
