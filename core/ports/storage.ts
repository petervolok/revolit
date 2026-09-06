import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import path from 'path';
import type { StoragePort, StoredFile } from './types';

/**
 * Хранение файлов на диске сервера — реализация по умолчанию.
 * Работает без внешних сервисов, что обязательно для коробочной поставки.
 * Облачное хранилище подключается заменой этого порта.
 */
export function createDiskStorage(rootDir: string): StoragePort {
  const safePath = (key: string) => {
    // Ключ не должен уводить за пределы папки хранения
    const resolved = path.resolve(rootDir, key);
    if (!resolved.startsWith(path.resolve(rootDir) + path.sep)) {
      throw new Error('Недопустимый путь к файлу');
    }
    return resolved;
  };

  return {
    async put(key, data, mimeType): Promise<StoredFile> {
      const target = safePath(key);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, data);
      return { key, size: data.length, mimeType };
    },

    async get(key) {
      return readFile(safePath(key));
    },

    async delete(key) {
      await unlink(safePath(key)).catch(() => undefined);
    },

    url() {
      // Файлы с диска отдаёт само приложение — прямых ссылок нет
      return null;
    },
  };
}
