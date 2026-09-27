/* eslint-disable @typescript-eslint/no-explicit-any */
import type { EntityDef, FieldDef, Row } from './types';

/** Соответствие «ключ поля в лаборатории → ключ поля в Revolit» и ключ сущности в Revolit */
export interface SchemaEntry {
  templateKey: string;
  realKeys: Record<string, string>;
}
export type Schema = Record<string, SchemaEntry>;

export const BOOL_CHOICES = ['да', 'нет'];

/** Какой тип поля движка сущностей соответствует полю лаборатории */
export function revolitType(f: FieldDef): 'text' | 'number' | 'date' | 'select' | 'relation' {
  switch (f.type) {
    case 'number':
    case 'percent':
    case 'currency':
      return 'number';
    case 'date':
      return 'date';
    case 'select':
    case 'bool':
      return 'select';
    case 'relation':
      return 'relation';
    default:
      return 'text';
  }
}

export function fieldChoices(f: FieldDef): string[] | undefined {
  if (f.type === 'bool') return BOOL_CHOICES;
  if (f.type === 'select') return f.options;
  return undefined;
}

function toApiValue(f: FieldDef, v: unknown): unknown {
  if (v === undefined || v === null || v === '') return undefined;
  if (f.type === 'bool') return v ? 'да' : 'нет';
  if (revolitType(f) === 'number') return Number(v);
  return v;
}

function fromApiValue(f: FieldDef, v: unknown): unknown {
  if (v === undefined || v === null) return f.type === 'bool' ? false : undefined;
  if (f.type === 'bool') return v === 'да';
  if (f.type === 'date') return String(v).slice(0, 10);
  return v;
}

export function rowToApi(entity: EntityDef, entry: SchemaEntry, row: Record<string, any>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of entity.fields) {
    const real = entry.realKeys[f.key];
    const v = toApiValue(f, row[f.key]);
    if (real && v !== undefined) out[real] = v;
  }
  return out;
}

export function apiToRow(entity: EntityDef, entry: SchemaEntry, record: { id: string; data: Record<string, unknown> }): Row {
  const row: Row = { id: record.id };
  for (const f of entity.fields) {
    const real = entry.realKeys[f.key];
    if (!real) continue;
    const v = fromApiValue(f, record.data[real]);
    if (v !== undefined) row[f.key] = v;
  }
  return row;
}
