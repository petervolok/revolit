/**
 * Открытый ключ проверки релизов. Отдельный от ключа лицензий (Р-30) —
 * у подписи версии кода и подписи «что купил клиент» разное назначение,
 * смешивать их в одном ключе неправильно (Р-31).
 */
export const RELEASE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAucDcTKjeCmFAOQpZ7SUw0t7MY3v8ZdNHfhH38wUOKT4=
-----END PUBLIC KEY-----
`;
