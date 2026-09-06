/**
 * Собирает schema.prisma из частей: настройки подключения, модели ядра,
 * модели модулей. Каждый модуль везёт свои таблицы — здесь они складываются
 * в один файл, который понимает Prisma.
 *
 * Запускается перед generate и migrate.
 */
const fs = require('fs');
const path = require('path');

const appDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appDir, '..', '..');

const parts = [
  { title: 'подключение', file: path.join(appDir, 'prisma', 'base.prisma') },
  { title: 'ядро', file: path.join(repoRoot, 'core', 'prisma', 'core.prisma') },
  { title: 'модуль CRM', file: path.join(appDir, 'prisma', 'crm.prisma') },
];

const chunks = ['// ФАЙЛ СОБИРАЕТСЯ АВТОМАТИЧЕСКИ — правьте части, а не этот файл.', ''];

for (const part of parts) {
  if (!fs.existsSync(part.file)) {
    console.error(`Не найдена часть схемы: ${part.file}`);
    process.exit(1);
  }
  chunks.push(`// ─── ${part.title} ───`, fs.readFileSync(part.file, 'utf8').trim(), '');
}

const target = path.join(appDir, 'prisma', 'schema.prisma');
fs.writeFileSync(target, chunks.join('\n') + '\n');
console.log(`Схема собрана из ${parts.length} частей → prisma/schema.prisma`);
