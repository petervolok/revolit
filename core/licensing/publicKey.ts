/**
 * Открытый ключ проверки лицензий. Безопасен для публикации — им можно
 * только проверить подпись, не поставить новую (Р-30). Закрытый ключ,
 * которым лицензии выпускаются, в проекте не хранится нигде.
 */
export const LICENSE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAY8kQuYNm4kd5wXO4T1CvHiUelk8+Fn1lnRl+jWnIMXg=
-----END PUBLIC KEY-----
`;
