import { prisma } from '../data/prisma';

export class ModuleToggleError extends Error {}

/** Ядро выключить нельзя — без него не работает ничего остальное */
const PROTECTED_MODULE = 'core';

/** Ключи модулей, выключенных для программы. Отсутствие строки = модуль включён. */
export async function listDisabledModuleKeys(programId: string): Promise<Set<string>> {
  const rows = await prisma.moduleToggle.findMany({ where: { programId, enabled: false } });
  return new Set(rows.map((r) => r.moduleKey));
}

export async function isModuleEnabled(programId: string, moduleKey: string): Promise<boolean> {
  const row = await prisma.moduleToggle.findUnique({
    where: { programId_moduleKey: { programId, moduleKey } },
  });
  return row?.enabled ?? true;
}

/** Бросает ModuleToggleError, если модуль выключен для программы — плагин
 * не должен работать «из-под полы», даже если у сотрудника есть право. */
export async function assertModuleEnabled(programId: string, moduleKey: string): Promise<void> {
  if (!(await isModuleEnabled(programId, moduleKey))) {
    throw new ModuleToggleError('Плагин отключён в настройках программы');
  }
}

export async function setModuleEnabled(programId: string, moduleKey: string, enabled: boolean): Promise<void> {
  if (moduleKey === PROTECTED_MODULE) {
    throw new ModuleToggleError('Ядро нельзя отключить');
  }

  await prisma.moduleToggle.upsert({
    where: { programId_moduleKey: { programId, moduleKey } },
    create: { programId, moduleKey, enabled },
    update: { enabled },
  });
}
