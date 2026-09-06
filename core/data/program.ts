import { prisma } from './prisma';

/**
 * Определяет, к какой собранной программе относится текущий запрос.
 *
 * Сейчас в развёрнутом экземпляре живёт одна программа, поэтому берём её по
 * адресу из переменной окружения либо единственную существующую. Когда
 * конструктор начнёт создавать программы, здесь появится разбор поддомена или
 * адреса — остальной код менять не придётся.
 */
export async function getCurrentProgram() {
  const slug = process.env.PROGRAM_SLUG;
  if (slug) {
    return prisma.program.findUnique({ where: { slug } });
  }
  return prisma.program.findFirst({ orderBy: { createdAt: 'asc' } });
}
