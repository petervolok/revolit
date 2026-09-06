#!/usr/bin/env node
/**
 * Автономная проверка релиза для update.sh — без зависимости от собранного
 * приложения. Открытый ключ продублирован здесь намеренно: этот файл должен
 * работать сам по себе прямо на сервере, до того как новая версия собрана.
 *
 * Использование: node tools/verify-release.js "<манифест>"
 * Печатает версию в stdout при успехе и завершается кодом 0.
 * При неудаче — сообщение в stderr и код 1.
 */
const { verify } = require('crypto');

const RELEASE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAucDcTKjeCmFAOQpZ7SUw0t7MY3v8ZdNHfhH38wUOKT4=
-----END PUBLIC KEY-----
`;

function main() {
  const raw = process.argv[2];
  if (!raw) {
    console.error('Укажите манифест первым аргументом');
    process.exit(1);
  }

  const parts = raw.trim().split('.');
  if (parts.length !== 2) {
    console.error('Неверный формат релиза');
    process.exit(1);
  }

  const [dataPart, signaturePart] = parts;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(dataPart, 'base64url').toString('utf8'));
  } catch {
    console.error('Не удалось разобрать данные релиза');
    process.exit(1);
  }

  if (typeof payload.version !== 'string') {
    console.error('В релизе нет версии');
    process.exit(1);
  }

  const signature = Buffer.from(signaturePart, 'base64url');
  const ok = verify(null, Buffer.from(dataPart, 'utf8'), RELEASE_PUBLIC_KEY_PEM, signature);
  if (!ok) {
    console.error('Подпись не подтвердилась — релиз поддельный или повреждён');
    process.exit(1);
  }

  console.log(payload.version);
}

main();
