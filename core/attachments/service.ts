/**
 * Вложения — серверная часть (Р-38). Файл хранится через StoragePort
 * (по умолчанию — на диске сервера, core/ports/storage.ts); привязка ровно
 * к одному родителю — записи сущности, делу процесса или задаче.
 */
import { randomBytes } from 'crypto';
import { prisma } from '../data/prisma';
import { newId } from '../data/ids';
import { resolveUserNames } from '../data/userNames';
import type { UserNames } from '../data/userNames';
import { getStoragePort } from '../ports/registry';
import { MAX_ATTACHMENT_SIZE } from './types';
import type { AttachmentDef } from './types';

export class AttachmentError extends Error {}

export type AttachmentParent =
  | { entityRecordId: string }
  | { processInstanceId: string }
  | { taskId: string };

function toDef(
  row: { id: string; fileName: string; mimeType: string; size: number; uploadedById: string | null; createdAt: Date },
  users: UserNames
): AttachmentDef {
  return {
    id: row.id,
    fileName: row.fileName,
    mimeType: row.mimeType,
    size: row.size,
    uploadedByName: (row.uploadedById && users.get(row.uploadedById)?.name) || null,
    createdAt: row.createdAt.toISOString(),
  };
}

async function requireParentInProgram(programId: string, parent: AttachmentParent): Promise<void> {
  if ('entityRecordId' in parent) {
    const record = await prisma.entityRecord.findFirst({ where: { id: parent.entityRecordId, programId } });
    if (!record) throw new AttachmentError('Запись не найдена');
  } else if ('processInstanceId' in parent) {
    const instance = await prisma.processInstance.findFirst({ where: { id: parent.processInstanceId, programId } });
    if (!instance) throw new AttachmentError('Дело не найдено');
  } else {
    const task = await prisma.task.findFirst({ where: { id: parent.taskId, programId } });
    if (!task) throw new AttachmentError('Задача не найдена');
  }
}

export async function listAttachments(programId: string, parent: AttachmentParent): Promise<AttachmentDef[]> {
  const rows = await prisma.attachment.findMany({
    where: { programId, ...parent },
    orderBy: { createdAt: 'desc' },
  });
  const users = await resolveUserNames(rows.map((r) => r.uploadedById));
  return rows.map((r) => toDef(r, users));
}

export async function uploadAttachment(
  programId: string,
  uploadedById: string,
  parent: AttachmentParent,
  file: { name: string; mimeType: string; data: Buffer }
): Promise<AttachmentDef> {
  if (file.data.length === 0) throw new AttachmentError('Файл пустой');
  if (file.data.length > MAX_ATTACHMENT_SIZE) {
    throw new AttachmentError(`Файл больше ${Math.floor(MAX_ATTACHMENT_SIZE / 1024 / 1024)} МБ — сервер пока не принимает такие`);
  }
  await requireParentInProgram(programId, parent);

  const storageKey = `${programId}/${Date.now()}-${randomBytes(6).toString('hex')}-${file.name.replace(/[^\w.\-]+/g, '_')}`;
  const storage = getStoragePort();
  await storage.put(storageKey, file.data, file.mimeType);

  const row = await prisma.attachment.create({
    data: {
      id: newId(),
      programId,
      storageKey,
      fileName: file.name,
      mimeType: file.mimeType,
      size: file.data.length,
      uploadedById,
      ...parent,
    },
  });
  return toDef(row, await resolveUserNames([row.uploadedById]));
}

export async function getAttachmentFile(
  programId: string,
  attachmentId: string
): Promise<{ data: Buffer; fileName: string; mimeType: string }> {
  const row = await prisma.attachment.findFirst({ where: { id: attachmentId, programId } });
  if (!row) throw new AttachmentError('Вложение не найдено');

  const data = await getStoragePort().get(row.storageKey);
  return { data, fileName: row.fileName, mimeType: row.mimeType };
}

export async function deleteAttachment(programId: string, attachmentId: string): Promise<void> {
  const row = await prisma.attachment.findFirst({ where: { id: attachmentId, programId } });
  if (!row) throw new AttachmentError('Вложение не найдено');

  await getStoragePort().delete(row.storageKey);
  await prisma.attachment.delete({ where: { id: row.id } });
}
