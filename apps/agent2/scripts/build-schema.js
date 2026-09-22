/**
 * Собирает schema.prisma агента №2: подключение + ядро + приватную модель
 * чувствительности. Ядро (core.prisma) переиспользуется как есть — сервер №1
 * про существование этого файла ничего не знает, потому что его сборка сюда
 * никогда не заглядывает (см. Dockerfile: apps/agent2 не копируется в runner).
 */
const fs = require('fs');
const path = require('path');

const appDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appDir, '..', '..');

const parts = [
  { title: 'подключение', file: path.join(appDir, 'prisma', 'base.prisma') },
  { title: 'ядро', file: path.join(repoRoot, 'core', 'prisma', 'core.prisma') },
  { title: 'чувствительность (только сервер №2)', file: path.join(appDir, 'prisma', 'sensitivity.prisma') },
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
console.log(`Схема agent2 собрана из ${parts.length} частей → apps/agent2/prisma/schema.prisma`);
