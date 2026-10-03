/**
 * Подстановки в значениях действий: {{record.title}}, {{event}}, {{now}}, {{today}}.
 * Целиком подстановка сохраняет тип значения (число останется числом), внутри текста — превращается в строку.
 * Неизвестный путь даёт пустое значение. Обращаться к служебным свойствам объекта нельзя.
 */
export interface TemplateContext {
  record?: Record<string, unknown>;
  template?: { key: string; name: string };
  event?: string;
  automation?: { id: string; name: string };
  now?: string;
  today?: string;
}

const PLACEHOLDER = /\{\{\s*([^{}]+?)\s*\}\}/g;
const WHOLE = /^\{\{\s*([^{}]+?)\s*\}\}$/;
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);

export function lookup(ctx: TemplateContext, path: string): unknown {
  let cur: unknown = ctx;
  for (const part of path.split('.')) {
    if (FORBIDDEN.has(part) || cur === null || typeof cur !== 'object' || !Object.prototype.hasOwnProperty.call(cur, part)) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export function withClock(ctx: TemplateContext, now = new Date()): TemplateContext {
  return { ...ctx, now: now.toISOString(), today: now.toISOString().slice(0, 10) };
}

/** Подставляет значения в строку, массив или объект (рекурсивно) */
export function render(value: unknown, ctx: TemplateContext): unknown {
  if (typeof value === 'string') {
    const whole = WHOLE.exec(value);
    if (whole) return lookup(ctx, whole[1]) ?? null;
    return value.replace(PLACEHOLDER, (_m, path: string) => {
      const found = lookup(ctx, path);
      if (found === undefined || found === null) return '';
      return typeof found === 'object' ? JSON.stringify(found) : String(found);
    });
  }
  if (Array.isArray(value)) return value.map((v) => render(v, ctx));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, render(v, ctx)]));
  }
  return value;
}

export function renderText(value: string, ctx: TemplateContext): string {
  const out = render(value, ctx);
  return out === null || out === undefined ? '' : typeof out === 'string' ? out : JSON.stringify(out);
}
