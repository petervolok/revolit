/**
 * Сериализация аргументов и результатов Prisma для передачи по шине (ТЗ 3.2).
 * JSON не различает Date, BigInt и Buffer — они кодируются тегом `__t` и
 * восстанавливаются на приёмной стороне. Одна и та же пара функций нужна и
 * приложению, и агенту.
 */
const TAG = '__t';

export function encode(value: unknown): unknown {
  if (value instanceof Date) return { [TAG]: 'date', v: value.toISOString() };
  if (typeof value === 'bigint') return { [TAG]: 'bigint', v: value.toString() };
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) return { [TAG]: 'buffer', v: value.toString('base64') };
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = encode(v);
    // Обычный объект, случайно содержащий ключ-тег, оборачиваем, чтобы не спутать с закодированным значением
    return TAG in out ? { [TAG]: 'obj', v: out } : out;
  }
  return value;
}

export function decode(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    switch (obj[TAG]) {
      case 'date':
        return new Date(obj.v as string);
      case 'bigint':
        return BigInt(obj.v as string);
      case 'buffer':
        return Buffer.from(obj.v as string, 'base64');
      case 'obj': {
        const inner: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(obj.v as Record<string, unknown>)) inner[k] = decode(v);
        return inner;
      }
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = decode(v);
    return out;
  }
  return value;
}
