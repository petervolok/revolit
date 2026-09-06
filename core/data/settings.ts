import { prisma } from './prisma';
import { getCurrentProgram } from './program';

/** Настройки текущей программы — то немногое, что уже переехало в базу (Р-25, Р-28) */
export async function getCurrentSettings() {
  const program = await getCurrentProgram().catch(() => null);
  if (!program) return null;
  return prisma.programSettings.findUnique({ where: { programId: program.id } });
}

/**
 * Адрес, по которому программа доступна извне — нужен для ссылок в письмах.
 * Порядок: значение в базе → переменная окружения → адрес самого запроса.
 * Последнее звено было запасным вариантом и до переноса в базу (Р-28).
 */
export async function getEffectiveAppUrl(requestOrigin: string): Promise<string> {
  const settings = await getCurrentSettings();
  return settings?.appUrl || process.env.APP_URL || requestOrigin;
}
