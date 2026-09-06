/**
 * Проверка релиза — серверная часть. Формат ключа тот же, что и у лицензий
 * (Р-30): `<данные>.<подпись>` в base64url, только ключ проверки другой (Р-31).
 */
import { verify as verifySignature } from 'crypto';
import { RELEASE_PUBLIC_KEY_PEM } from './publicKey';
import { APP_VERSION } from './version';
import type { ReleaseManifest, UpdateCheckResult } from './types';

function isManifestShape(value: unknown): value is ReleaseManifest {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.version === 'string' && typeof v.notes === 'string' && typeof v.publishedAt === 'string';
}

export function verifyReleaseManifest(raw: string): ReleaseManifest | null {
  const parts = raw.trim().split('.');
  if (parts.length !== 2) return null;

  const [dataPart, signaturePart] = parts;

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(dataPart, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!isManifestShape(payload)) return null;

  const signature = Buffer.from(signaturePart, 'base64url');
  const ok = verifySignature(null, Buffer.from(dataPart, 'utf8'), RELEASE_PUBLIC_KEY_PEM, signature);
  return ok ? payload : null;
}

/** Сравнение версий вида «1.2.3». Нестандартный формат считается младше любого валидного. */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function checkForUpdate(raw: string): UpdateCheckResult {
  const manifest = verifyReleaseManifest(raw);
  if (!manifest) {
    return { updateAvailable: false, currentVersion: APP_VERSION, manifest: null, reason: 'invalid' };
  }

  const newer = compareVersions(manifest.version, APP_VERSION) > 0;
  return {
    updateAvailable: newer,
    currentVersion: APP_VERSION,
    manifest,
    reason: newer ? 'valid' : 'not-newer',
  };
}
