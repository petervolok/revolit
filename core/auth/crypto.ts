import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import bcrypt from 'bcryptjs';
import { SECURITY } from './config';

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SECURITY.bcryptRounds);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Проверка пароля на соответствие политике. Возвращает текст ошибки или null. */
export function validatePasswordStrength(password: string): string | null {
  if (password.length < SECURITY.minPasswordLength) {
    return `Пароль должен быть не короче ${SECURITY.minPasswordLength} символов`;
  }
  if (!/[a-zA-Zа-яА-Я]/.test(password)) return 'Пароль должен содержать буквы';
  if (!/[0-9]/.test(password)) return 'Пароль должен содержать хотя бы одну цифру';
  return null;
}

/** Случайный токен для сессии или ссылки восстановления */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Шестизначный код подтверждения */
export function generateLoginCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/** В базе храним только хеш — сам токен/код виден лишь получателю */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Сравнение хешей без утечки времени сравнения */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
