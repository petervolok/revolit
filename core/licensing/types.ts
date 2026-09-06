/**
 * Описания лицензии — общие для сервера и браузера. Проверка подписи —
 * серверная (см. verify.ts), здесь только форма данных (Р-30).
 */

/** Что зашито внутри подписанного ключа */
export interface LicensePayload {
  /** Ключи платных модулей, которые открывает лицензия */
  features: string[];
  /** Кому выпущена — для порядка на нашей стороне, ни на что не влияет технически */
  issuedTo: string;
  issuedAt: string;
  /** null — бессрочная */
  expiresAt: string | null;
}

export interface LicenseStatus {
  /** Есть проверенный, не просроченный ключ */
  active: boolean;
  payload: LicensePayload | null;
  /** Почему active=false, если введённый ключ есть, но не подошёл */
  reason: 'none' | 'invalid' | 'expired' | null;
}
