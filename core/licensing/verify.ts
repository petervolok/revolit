/**
 * Проверка лицензионного ключа — серверная часть. Ключ устроен как
 * `<данные>.<подпись>`, обе части в base64url. Проверяется без обращения
 * куда-либо — открытый ключ зашит в приложение (Р-30).
 */
import { verify as verifySignature } from 'crypto';
import { LICENSE_PUBLIC_KEY_PEM } from './publicKey';
import type { LicensePayload } from './types';

function isPayloadShape(value: unknown): value is LicensePayload {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.features) &&
    v.features.every((f) => typeof f === 'string') &&
    typeof v.issuedTo === 'string' &&
    typeof v.issuedAt === 'string' &&
    (v.expiresAt === null || typeof v.expiresAt === 'string')
  );
}

/** Разбирает и проверяет подпись. Возвращает данные ключа или null, если ключ поддельный либо повреждён. */
export function verifyLicenseKey(raw: string): LicensePayload | null {
  const parts = raw.trim().split('.');
  if (parts.length !== 2) return null;

  const [dataPart, signaturePart] = parts;

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(dataPart, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!isPayloadShape(payload)) return null;

  const signature = Buffer.from(signaturePart, 'base64url');
  const ok = verifySignature(null, Buffer.from(dataPart, 'utf8'), LICENSE_PUBLIC_KEY_PEM, signature);
  return ok ? payload : null;
}

/** Проверенный ключ, но с учётом срока действия */
export function evaluateLicenseKey(raw: string | null | undefined): {
  active: boolean;
  payload: LicensePayload | null;
  reason: 'none' | 'invalid' | 'expired' | null;
} {
  if (!raw) return { active: false, payload: null, reason: 'none' };

  const payload = verifyLicenseKey(raw);
  if (!payload) return { active: false, payload: null, reason: 'invalid' };

  if (payload.expiresAt && new Date(payload.expiresAt).getTime() < Date.now()) {
    return { active: false, payload, reason: 'expired' };
  }

  return { active: true, payload, reason: null };
}
