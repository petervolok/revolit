'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, Lock, Mail } from 'lucide-react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import AuthLayout from './AuthLayout';

type Step = 'credentials' | 'code' | 'forgot' | 'forgotSent';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const nextUrl = params.get('next') || '/home';

  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const submitCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Не удалось войти');
        return;
      }
      setChallengeId(data.challengeId);
      setMaskedEmail(data.maskedEmail || email);
      setCode('');
      setStep('code');
    } catch {
      setError('Сервер недоступен. Попробуйте ещё раз.');
    } finally {
      setLoading(false);
    }
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Не удалось подтвердить код');
        if (data.expired) setStep('credentials');
        return;
      }
      router.push(nextUrl);
      router.refresh();
    } catch {
      setError('Сервер недоступен. Попробуйте ещё раз.');
    } finally {
      setLoading(false);
    }
  };

  const resendCode = async () => {
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/auth/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Не удалось отправить код');
        if (data.expired) setStep('credentials');
        return;
      }
      setChallengeId(data.challengeId);
      setCode('');
      setNotice('Новый код отправлен');
    } finally {
      setLoading(false);
    }
  };

  const submitForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await fetch('/api/auth/password-reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setStep('forgotSent');
    } catch {
      setError('Сервер недоступен. Попробуйте ещё раз.');
    } finally {
      setLoading(false);
    }
  };

  const errorBox = error && (
    <div className="rounded-lg border border-danger/25 bg-danger/[0.07] px-3 py-2.5 text-[13px] text-danger">
      {error}
    </div>
  );

  if (step === 'code') {
    return (
      <AuthLayout>
        <button
          onClick={() => {
            setStep('credentials');
            setError('');
            setNotice('');
          }}
          className="mb-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Назад
        </button>

        <h1 className="text-[26px] font-semibold tracking-tight text-ink">Подтверждение входа</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Мы отправили шестизначный код на <span className="font-medium text-ink">{maskedEmail}</span>
        </p>

        <form onSubmit={submitCode} className="mt-8 space-y-4">
          {errorBox}
          {notice && (
            <div className="flex items-center gap-2 rounded-lg border border-success/25 bg-success/[0.07] px-3 py-2.5 text-[13px] text-success">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {notice}
            </div>
          )}

          <Input
            label="Код подтверждения"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            leading={<KeyRound className="h-4 w-4" />}
            className="text-center text-lg font-semibold tracking-[0.4em]"
          />

          <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full">
            Войти
          </Button>

          <p className="text-center text-[13px] text-ink-muted">
            Не пришёл код?{' '}
            <button
              type="button"
              onClick={resendCode}
              disabled={loading}
              className="font-medium text-brand hover:underline disabled:opacity-60"
            >
              Отправить повторно
            </button>
          </p>
        </form>
      </AuthLayout>
    );
  }

  if (step === 'forgotSent') {
    return (
      <AuthLayout>
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-success/10 text-success">
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <h1 className="mt-5 text-[26px] font-semibold tracking-tight text-ink">Проверьте почту</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Если учётная запись с адресом <span className="font-medium text-ink">{email}</span> существует,
          мы отправили на неё ссылку для смены пароля. Ссылка действует один час.
        </p>
        <Button
          variant="secondary"
          size="lg"
          className="mt-7 w-full"
          onClick={() => {
            setStep('credentials');
            setError('');
          }}
        >
          Вернуться ко входу
        </Button>
      </AuthLayout>
    );
  }

  if (step === 'forgot') {
    return (
      <AuthLayout>
        <button
          onClick={() => {
            setStep('credentials');
            setError('');
          }}
          className="mb-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Назад
        </button>

        <h1 className="text-[26px] font-semibold tracking-tight text-ink">Восстановление пароля</h1>
        <p className="mt-2 text-sm text-ink-muted">Мы пришлём ссылку для установки нового пароля</p>

        <form onSubmit={submitForgot} className="mt-8 space-y-4">
          {errorBox}
          <Input
            label="Электронная почта"
            type="email"
            autoComplete="username"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.ru"
            leading={<Mail className="h-4 w-4" />}
          />
          <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full">
            Отправить ссылку
          </Button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h1 className="text-[26px] font-semibold tracking-tight text-ink">Вход в систему</h1>
      <p className="mt-2 text-sm text-ink-muted">Введите данные вашей учётной записи</p>

      <form onSubmit={submitCredentials} className="mt-8 space-y-4">
        {errorBox}

        <Input
          label="Электронная почта"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@company.ru"
          leading={<Mail className="h-4 w-4" />}
        />

        <div>
          <Input
            label="Пароль"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            leading={<Lock className="h-4 w-4" />}
            trailing={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                className="pointer-events-auto transition-colors hover:text-ink"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
          />
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => {
                setStep('forgot');
                setError('');
              }}
              className="text-[13px] font-medium text-brand hover:underline"
            >
              Забыли пароль?
            </button>
          </div>
        </div>

        <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full">
          Продолжить
        </Button>
      </form>
    </AuthLayout>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
