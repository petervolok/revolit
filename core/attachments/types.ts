/** Описания вложений — общие для сервера и браузера (Р-38) */

export interface AttachmentDef {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedByName: string | null;
  createdAt: string;
}

/** Ограничение размера — диск сервера общий на всё, не только на вложения */
export const MAX_ATTACHMENT_SIZE = 15 * 1024 * 1024; // 15 МБ
