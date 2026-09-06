// Единое место для параметров безопасности входа
export const SECURITY = {
  /** Стоимость хеширования пароля */
  bcryptRounds: 12,
  /** Сколько неудачных попыток пароля до временной блокировки */
  maxFailedAttempts: 5,
  /** На сколько минут блокируется учётная запись */
  lockMinutes: 15,
  /** Время жизни кода подтверждения */
  codeTtlMinutes: 10,
  /** Сколько раз можно ошибиться в коде, прежде чем он сгорит */
  codeMaxAttempts: 5,
  /** Время жизни сессии */
  sessionTtlDays: 7,
  /** Время жизни ссылки восстановления пароля */
  resetTtlMinutes: 60,
  /** Минимальная длина пароля */
  minPasswordLength: 10,
} as const;

export const SESSION_COOKIE = 'revolit_session';
