'use client';

import { useState } from 'react';
import { Send, Sparkles } from 'lucide-react';
import Button from '../ui/Button';
import type { ChatMessage } from '../ai/types';

export default function AiConsultClient() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;

    const history = messages;
    const next: ChatMessage[] = [...history, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setSending(true);
    setError('');

    const res = await fetch('/api/ai-consult', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history }),
    });
    setSending(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'Не удалось получить ответ');
      return;
    }

    const body = await res.json();
    setMessages([...next, { role: 'assistant', content: body.reply }]);
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-2xl flex-col">
      <h1 className="mb-1 text-lg font-semibold text-ink">ИИ-консультант</h1>
      <p className="mb-4 text-[13px] text-ink-muted">
        Спросите, как решить рабочую задачу в системе. Консультант подскажет, что нажать и где найти —
        сам он ничего в системе не меняет.
      </p>

      <div className="flex-1 overflow-y-auto rounded-xl border border-line p-4">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-ink-faint">
            <Sparkles className="h-6 w-6" />
            <p className="text-[13px]">Например: «Как завести раздел для учёта договоров?»</p>
          </div>
        )}
        <div className="flex flex-col gap-3">
          {messages.map((m, i) => (
            <div
              key={i}
              className={
                'max-w-[85%] whitespace-pre-line rounded-lg px-3.5 py-2.5 text-[13px] ' +
                (m.role === 'user' ? 'ml-auto bg-brand text-white' : 'bg-surface-muted text-ink')
              }
            >
              {m.content}
            </div>
          ))}
          {sending && <div className="max-w-[85%] rounded-lg bg-surface-muted px-3.5 py-2.5 text-[13px] text-ink-muted">Думаю…</div>}
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      <div className="mt-3 flex gap-2">
        <textarea
          className="h-10 flex-1 resize-none rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
          placeholder="Ваш вопрос…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <Button variant="primary" loading={sending} onClick={send}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
