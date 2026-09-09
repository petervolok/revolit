'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Paperclip, Trash2, Upload } from 'lucide-react';
import type { AttachmentDef } from './types';
import { MAX_ATTACHMENT_SIZE } from './types';

type Parent = { entityRecordId: string } | { processInstanceId: string } | { taskId: string };

function parentQuery(parent: Parent): string {
  const [key, value] = Object.entries(parent)[0];
  return `${key}=${encodeURIComponent(value)}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

/**
 * Вложения записи, дела или задачи (Р-38) — переиспользуемый блок, чтобы
 * правило хранения и лимит размера не расходились между тремя местами,
 * где он нужен.
 */
export default function AttachmentsSection({ parent }: { parent: Parent }) {
  const [items, setItems] = useState<AttachmentDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const query = parentQuery(parent);

  const load = useCallback(async () => {
    const res = await fetch(`/api/attachments?${query}`);
    setItems(res.ok ? await res.json() : []);
    setLoading(false);
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  const onFileChosen = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    if (file.size > MAX_ATTACHMENT_SIZE) {
      setError(`Файл больше ${Math.floor(MAX_ATTACHMENT_SIZE / 1024 / 1024)} МБ — сервер пока не принимает такие`);
      return;
    }

    setUploading(true);
    const form = new FormData();
    form.append('file', file);
    const [key, value] = Object.entries(parent)[0];
    form.append(key, value);

    const res = await fetch('/api/attachments', { method: 'POST', body: form });
    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'Не удалось загрузить файл');
      return;
    }
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('Удалить файл?')) return;
    const res = await fetch(`/api/attachments/${id}`, { method: 'DELETE' });
    if (res.ok) setItems((prev) => prev.filter((i) => i.id !== id));
  };

  if (loading) return null;

  return (
    <div>
      <h3 className="mb-1.5 text-[13px] font-semibold text-ink">Вложения</h3>

      {items.length > 0 && (
        <div className="mb-2 flex flex-col gap-1.5">
          {items.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-muted px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <Paperclip className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
                <span className="truncate text-[13px] text-ink">{a.fileName}</span>
                <span className="shrink-0 text-xs text-ink-faint">{formatSize(a.size)}</span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <a
                  href={`/api/attachments/${a.id}/download`}
                  className="rounded-md p-1 text-ink-faint transition-colors hover:bg-surface hover:text-brand"
                  aria-label="Скачать"
                >
                  <Download className="h-3.5 w-3.5" />
                </a>
                <button
                  onClick={() => remove(a.id)}
                  className="rounded-md p-1 text-ink-faint transition-colors hover:bg-surface hover:text-danger"
                  aria-label="Удалить"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <label className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] text-brand hover:underline">
        <Upload className="h-3.5 w-3.5" />
        {uploading ? 'Загружаю…' : 'Прикрепить файл'}
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          disabled={uploading}
          onChange={(e) => onFileChosen(e.target.files?.[0])}
        />
      </label>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
