/** Описания релиза — общие для сервера и браузера (Р-31) */
export interface ReleaseManifest {
  version: string;
  notes: string;
  publishedAt: string;
}

export interface UpdateCheckResult {
  /** Манифест подлинный и содержит версию новее текущей */
  updateAvailable: boolean;
  currentVersion: string;
  manifest: ReleaseManifest | null;
  reason: 'valid' | 'invalid' | 'not-newer' | null;
}
