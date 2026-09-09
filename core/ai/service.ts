/**
 * ИИ-консультант — серверная часть (Р-33, Р-35). Ключи — свои ключи клиента,
 * хранятся тем же приёмом, что и пароль почты (Р-25): пишутся, не читаются
 * обратно. Несколько ключей можно объединить в группу — если у одного
 * кончился лимит (HTTP 429), система сама пробует следующий по порядку.
 */
import { prisma } from '../data/prisma';
import { SYSTEM_CONTEXT } from './systemContext';
import type { AiKeyGroupSummary, AiProvider, ChatMessage } from './types';

export class AiError extends Error {
  /** HTTP-статус ответа провайдера, если это ошибка на его стороне */
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

const DEFAULT_MODEL: Record<AiProvider, string> = {
  anthropic: 'claude-sonnet-5',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-3.6-flash',
};

const PROVIDERS: AiProvider[] = ['anthropic', 'openai', 'gemini'];

function isProvider(value: unknown): value is AiProvider {
  return typeof value === 'string' && (PROVIDERS as string[]).includes(value);
}

function keyTail(apiKey: string): string {
  return apiKey.length <= 4 ? '••••' : `···${apiKey.slice(-4)}`;
}

async function toSummary(group: {
  id: string;
  name: string;
  provider: string;
  model: string | null;
  order: number;
  keys: { id: string; apiKey: string; label: string | null; order: number }[];
}, activeGroupId: string | null): Promise<AiKeyGroupSummary> {
  return {
    id: group.id,
    name: group.name,
    provider: group.provider as AiProvider,
    model: group.model || DEFAULT_MODEL[group.provider as AiProvider],
    order: group.order,
    active: group.id === activeGroupId,
    keys: group.keys
      .sort((a, b) => a.order - b.order)
      .map((k) => ({ id: k.id, label: k.label, keyTail: keyTail(k.apiKey), order: k.order })),
  };
}

/** Все группы ключей программы, с активной отмеченной */
export async function listAiGroups(programId: string): Promise<AiKeyGroupSummary[]> {
  const [settings, groups] = await Promise.all([
    prisma.programSettings.findUnique({ where: { programId } }),
    prisma.aiKeyGroup.findMany({ where: { programId }, include: { keys: true }, orderBy: { order: 'asc' } }),
  ]);

  return Promise.all(groups.map((g) => toSummary(g, settings?.activeAiGroupId ?? null)));
}

export async function createAiGroup(
  programId: string,
  input: { name: string; provider: AiProvider; model?: string }
): Promise<AiKeyGroupSummary> {
  if (!input.name.trim()) throw new AiError('Укажите название группы');
  if (!isProvider(input.provider)) throw new AiError('Неизвестный поставщик ИИ');

  const count = await prisma.aiKeyGroup.count({ where: { programId } });

  try {
    const group = await prisma.aiKeyGroup.create({
      data: {
        programId,
        name: input.name.trim(),
        provider: input.provider,
        model: input.model?.trim() || null,
        order: count,
      },
      include: { keys: true },
    });
    const settings = await prisma.programSettings.findUnique({ where: { programId } });
    return toSummary(group, settings?.activeAiGroupId ?? null);
  } catch {
    throw new AiError('Группа с таким названием уже есть');
  }
}

async function requireOwnGroup(programId: string, groupId: string) {
  const group = await prisma.aiKeyGroup.findUnique({ where: { id: groupId } });
  if (!group || group.programId !== programId) throw new AiError('Группа не найдена');
  return group;
}

export async function renameAiGroup(
  programId: string,
  groupId: string,
  input: { name?: string; model?: string }
): Promise<void> {
  await requireOwnGroup(programId, groupId);
  await prisma.aiKeyGroup.update({
    where: { id: groupId },
    data: {
      ...(input.name?.trim() ? { name: input.name.trim() } : {}),
      ...(input.model !== undefined ? { model: input.model.trim() || null } : {}),
    },
  });
}

export async function deleteAiGroup(programId: string, groupId: string): Promise<void> {
  await requireOwnGroup(programId, groupId);
  await prisma.aiKeyGroup.delete({ where: { id: groupId } });
  // Если удалили активную группу — консультант честно скажет «не настроен»,
  // а не будет молча пользоваться чужой группой
  await prisma.programSettings.updateMany({
    where: { programId, activeAiGroupId: groupId },
    data: { activeAiGroupId: null },
  });
}

export async function setActiveAiGroup(programId: string, groupId: string | null): Promise<void> {
  if (groupId) await requireOwnGroup(programId, groupId);

  await prisma.programSettings.upsert({
    where: { programId },
    create: { programId, activeAiGroupId: groupId },
    update: { activeAiGroupId: groupId },
  });
}

export async function addAiKey(
  programId: string,
  groupId: string,
  input: { apiKey: string; label?: string }
): Promise<void> {
  await requireOwnGroup(programId, groupId);
  if (!input.apiKey.trim()) throw new AiError('Вставьте ключ');

  const count = await prisma.aiKey.count({ where: { groupId } });
  await prisma.aiKey.create({
    data: { groupId, apiKey: input.apiKey.trim(), label: input.label?.trim() || null, order: count },
  });
}

export async function removeAiKey(programId: string, groupId: string, keyId: string): Promise<void> {
  await requireOwnGroup(programId, groupId);
  await prisma.aiKey.deleteMany({ where: { id: keyId, groupId } });
}

async function callAnthropic(apiKey: string, model: string, history: ChatMessage[], message: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: SYSTEM_CONTEXT,
      messages: [...history, { role: 'user', content: message }],
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AiError(body?.error?.message || `Anthropic ответил с ошибкой (${res.status})`, res.status);
  }
  const text = body?.content?.[0]?.text;
  if (typeof text !== 'string') throw new AiError('Не удалось разобрать ответ Anthropic');
  return text;
}

async function callOpenAi(apiKey: string, model: string, history: ChatMessage[], message: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: SYSTEM_CONTEXT }, ...history, { role: 'user', content: message }],
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AiError(body?.error?.message || `OpenAI ответил с ошибкой (${res.status})`, res.status);
  }
  const text = body?.choices?.[0]?.message?.content;
  if (typeof text !== 'string') throw new AiError('Не удалось разобрать ответ OpenAI');
  return text;
}

async function callGemini(apiKey: string, model: string, history: ChatMessage[], message: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_CONTEXT }] },
        contents: [...history, { role: 'user', content: message }].map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
      }),
    }
  );

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // У Gemini ошибка лимита иногда приходит как 429, иногда как 400
    // с кодом RESOURCE_EXHAUSTED в теле — проверяем оба признака
    const status = body?.error?.status === 'RESOURCE_EXHAUSTED' ? 429 : res.status;
    throw new AiError(body?.error?.message || `Gemini ответил с ошибкой (${res.status})`, status);
  }
  const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string') throw new AiError('Не удалось разобрать ответ Gemini');
  return text;
}

async function callProvider(
  provider: AiProvider,
  apiKey: string,
  model: string,
  history: ChatMessage[],
  message: string
): Promise<string> {
  if (provider === 'anthropic') return callAnthropic(apiKey, model, history, message);
  if (provider === 'openai') return callOpenAi(apiKey, model, history, message);
  return callGemini(apiKey, model, history, message);
}

export async function consult(programId: string, message: string, history: ChatMessage[]): Promise<string> {
  const settings = await prisma.programSettings.findUnique({ where: { programId } });
  if (!settings?.activeAiGroupId) {
    throw new AiError('ИИ-консультант не настроен — выберите активную группу ключей в настройках');
  }

  const group = await prisma.aiKeyGroup.findUnique({
    where: { id: settings.activeAiGroupId },
    include: { keys: { orderBy: { order: 'asc' } } },
  });
  if (!group || group.programId !== programId || group.keys.length === 0) {
    throw new AiError('В активной группе нет ни одного ключа');
  }

  const model = group.model || DEFAULT_MODEL[group.provider as AiProvider];

  let lastError: AiError | null = null;
  for (const key of group.keys) {
    try {
      return await callProvider(group.provider as AiProvider, key.apiKey, model, history, message);
    } catch (error) {
      if (error instanceof AiError && error.status === 429) {
        // Лимит этого ключа исчерпан — честно пробуем следующий в группе,
        // а не проваливаемся сразу (Р-35)
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  throw lastError ?? new AiError('Все ключи группы недоступны');
}
