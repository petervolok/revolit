/**
 * Порты — сменные части ядра. Ядро объявляет, ЧТО делается,
 * реализация отвечает, КАК. Замена реализации не затрагивает остальной код.
 *
 * Правило: у каждого порта есть реализация по умолчанию, работающая
 * без внешних сервисов. Иначе установка у клиента станет невозможной.
 */

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface MailPort {
  send(mail: OutgoingMail): Promise<void>;
}

export interface StoredFile {
  key: string;
  size: number;
  mimeType: string;
}

export interface StoragePort {
  put(key: string, data: Buffer, mimeType: string): Promise<StoredFile>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  /** Публичная ссылка либо null, если файл отдаётся только через приложение */
  url(key: string): string | null;
}
