#!/usr/bin/env node
/**
 * Выпуск лицензионного ключа. Не часть приложения — не собирается в образ,
 * запускается только с этой машины, только тем, у кого есть закрытый ключ (Р-30).
 *
 * Закрытый ключ передаётся через переменную окружения, а не файл —
 * в проект он не должен попасть ни в каком виде.
 *
 * Пример:
 *   LICENSE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----...-----END PRIVATE KEY-----" \
 *   node tools/issue-license.js --to "ООО Ромашка" --features ai-builder --days 365
 *
 * Без --days ключ бессрочный.
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
  const privateKeyPem = process.env.LICENSE_PRIVATE_KEY;
  if (!privateKeyPem) {
    console.error('Задайте переменную окружения LICENSE_PRIVATE_KEY с закрытым ключом.');
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));
  if (!args.to) {
    console.error('Укажите --to — кому выпускается ключ.');
    process.exit(1);
  }

  const features = typeof args.features === 'string' ? args.features.split(',').map((f) => f.trim()).filter(Boolean) : [];
  const expiresAt = args.days ? new Date(Date.now() + Number(args.days) * 24 * 60 * 60 * 1000).toISOString() : null;

  const payload = {
    features,
    issuedTo: args.to,
    issuedAt: new Date().toISOString(),
    expiresAt,
  };

  const dataPart = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = sign(null, Buffer.from(dataPart, 'utf8'), privateKeyPem);
  const key = `${dataPart}.${signature.toString('base64url')}`;

  console.log('\nЛицензионный ключ:\n');
  console.log(key);
  console.log('\nДанные:', JSON.stringify(payload, null, 2));
}

main();
