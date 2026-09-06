/**
 * Лицензия программы — серверная часть (Р-30). Хранится единственной строкой
 * (сам ключ) в тех же настройках, где почта и адрес (Р-25, Р-28) — проверяется
 * заново при каждом обращении, ничего из содержимого отдельно не кешируется.
 */
import { prisma } from '../data/prisma';
import { getCurrentProgram } from '../data/program';
import { evaluateLicenseKey } from './verify';
import type { LicenseStatus } from './types';

export class LicenseError extends Error {}

export async function getLicenseStatus(programId: string): Promise<LicenseStatus> {
  const settings = await prisma.programSettings.findUnique({ where: { programId } });
  return evaluateLicenseKey(settings?.licenseKey);
}

export async function activateLicense(programId: string, rawKey: string): Promise<LicenseStatus> {
  const status = evaluateLicenseKey(rawKey);
  if (!status.payload) throw new LicenseError('Ключ повреждён или не подходит к этой программе');
  if (status.reason === 'expired') throw new LicenseError('Срок действия ключа истёк');

  await prisma.programSettings.upsert({
    where: { programId },
    create: { programId, licenseKey: rawKey },
    update: { licenseKey: rawKey },
  });

  return status;
}

export async function deactivateLicense(programId: string): Promise<void> {
  await prisma.programSettings.updateMany({ where: { programId }, data: { licenseKey: null } });
}

/** Открыта ли конкретная платная часть для текущей программы */
export async function hasFeature(featureKey: string): Promise<boolean> {
  const program = await getCurrentProgram().catch(() => null);
  if (!program) return false;

  const status = await getLicenseStatus(program.id);
  return status.active && (status.payload?.features.includes(featureKey) ?? false);
}
