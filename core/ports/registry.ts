import path from 'path';
import { createSmtpMail } from './smtp';
import { createDiskStorage } from './storage';
import type { MailPort, StoragePort } from './types';

/**
 * Хранилище сменных частей. Модуль может подставить свою реализацию
 * при запуске — остальной код продолжит обращаться к порту как раньше.
 */
let mailPort: MailPort | null = null;
let storagePort: StoragePort | null = null;

export function setMailPort(port: MailPort): void {
  mailPort = port;
}

export function getMailPort(): MailPort {
  if (!mailPort) mailPort = createSmtpMail();
  return mailPort;
}

export function setStoragePort(port: StoragePort): void {
  storagePort = port;
}

export function getStoragePort(): StoragePort {
  if (!storagePort) {
    storagePort = createDiskStorage(process.env.STORAGE_DIR ?? path.join(process.cwd(), 'storage'));
  }
  return storagePort;
}
