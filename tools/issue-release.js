#!/usr/bin/env node
/**
 * Подписывает релиз — отдельным ключом от лицензий (Р-31). Не часть
 * приложения, в сборку не попадает.
 *
 * Пример:
 *   RELEASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----...-----END PRIVATE KEY-----" \
 *   node tools/issue-release.js --version 1.1.0 --notes "Механизм обновлений"
 */
const { sign } = require('crypto');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      args[key] = value;
    }
  }
  return args;
}

function main() {
  const privateKeyPem = process.env.RELEASE_PRIVATE_KEY;
  if (!privateKeyPem) {
    console.error('Задайте переменную окружения RELEASE_PRIVATE_KEY с закрытым ключом релизов.');
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));
  if (!args.version) {
    console.error('Укажите --version, например 1.1.0');
    process.exit(1);
  }

  const payload = {
    version: args.version,
    notes: args.notes || '',
    publishedAt: new Date().toISOString(),
  };

  const dataPart = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = sign(null, Buffer.from(dataPart, 'utf8'), privateKeyPem);
  const manifest = `${dataPart}.${signature.toString('base64url')}`;

  console.log('\nПодписанный релиз:\n');
  console.log(manifest);
  console.log('\nДанные:', JSON.stringify(payload, null, 2));
}

main();
