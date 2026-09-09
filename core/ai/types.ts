/** Описания ИИ-консультанта — общие для сервера и браузера (Р-33, Р-35) */

export type AiProvider = 'anthropic' | 'openai' | 'gemini';

export interface AiKeySummary {
  id: string;
  /** Сам ключ клиенту никогда не возвращается — только подпись и хвост для узнавания */
  label: string | null;
  keyTail: string;
  order: number;
}

export interface AiKeyGroupSummary {
  id: string;
  name: string;
  provider: AiProvider;
  model: string;
  order: number;
  active: boolean;
  keys: AiKeySummary[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ConsultRequest {
  message: string;
  history: ChatMessage[];
}

export interface ConsultResponse {
  reply: string;
}
