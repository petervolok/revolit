import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const PROGRAM_SLUG = process.env.PROGRAM_SLUG ?? 'demo';
const PROGRAM_NAME = process.env.PROGRAM_NAME ?? 'Новый проект';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? 'admin@revolit.local').toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'Revolit2026admin';
const ADMIN_NAME = process.env.ADMIN_NAME ?? 'Администратор';

// Базовые роли каркаса. Роли рабочих мест добавятся из конструктора.
const baseRoles = [
  {
    key: 'admin',
    name: 'Администратор',
    description: 'Полный доступ ко всем разделам и настройкам программы',
    permissions: ['*'],
    isSystem: true,
  },
  {
    key: 'manager',
    name: 'Менеджер',
    description: 'Работа с клиентами и документами в рамках своего рабочего места',
    permissions: [],
    isSystem: false,
  },
];

async function main() {
  const program = await prisma.program.upsert({
    where: { slug: PROGRAM_SLUG },
    update: {},
    create: { slug: PROGRAM_SLUG, name: PROGRAM_NAME },
  });

  for (const role of baseRoles) {
    await prisma.role.upsert({
      where: { programId_key: { programId: program.id, key: role.key } },
      update: { name: role.name, description: role.description, permissions: role.permissions },
      create: { ...role, programId: program.id },
    });
  }

  const adminRole = await prisma.role.findUniqueOrThrow({
    where: { programId_key: { programId: program.id, key: 'admin' } },
  });

  const existing = await prisma.user.findUnique({
    where: { programId_email: { programId: program.id, email: ADMIN_EMAIL } },
  });

  if (!existing) {
    const user = await prisma.user.create({
      data: {
        programId: program.id,
        email: ADMIN_EMAIL,
        name: ADMIN_NAME,
        passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12),
      },
    });
    await prisma.userRole.create({ data: { userId: user.id, roleId: adminRole.id } });

    console.log(`\nСоздана программа «${program.name}» (${program.slug})`);
    console.log(`Администратор: ${ADMIN_EMAIL}`);
    console.log(`Пароль: ${ADMIN_PASSWORD}`);
    console.log('Смените пароль после первого входа.\n');
  } else {
    console.log(`\nПрограмма «${program.name}» уже настроена, администратор: ${ADMIN_EMAIL}\n`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
