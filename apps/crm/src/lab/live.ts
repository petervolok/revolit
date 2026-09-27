import { apiToRow, rowToApi } from './convert';
import type { Schema } from './convert';
import { ENTITIES } from './entities';
import type { Data, Row } from './types';

export type LiveStatus = 'noauth' | 'notdeployed' | 'ok' | 'error';

export interface LiveLoad {
  status: LiveStatus;
  schema?: Schema;
  data?: Data;
}

async function fail(res: Response): Promise<never> {
  const body = await res.json().catch(() => ({}));
  throw new Error(body.error ?? `Ошибка сервера (${res.status})`);
}

/** Читает сущности и записи проекта из Revolit. Без входа или без развёртывания — соответствующий статус. */
export async function loadLive(): Promise<LiveLoad> {
  const res = await fetch('/api/entities');
  if (res.status === 401 || res.status === 403) return { status: 'noauth' };
  if (!res.ok) return { status: 'error' };

  const templates: { key: string; name: string; fields: { key: string; label: string }[] }[] = await res.json();
  const schema: Schema = {};
  for (const spec of Object.values(ENTITIES).filter((e) => !e.virtual)) {
    const t = templates.find((x) => x.name === spec.name);
    if (!t) return { status: 'notdeployed' };
    const realKeys: Record<string, string> = {};
    for (const f of spec.fields) {
      const real = t.fields.find((x) => x.label === f.label)?.key;
      if (real) realKeys[f.key] = real;
    }
    schema[spec.key] = { templateKey: t.key, realKeys };
  }

  const data: Data = {};
  await Promise.all(
    Object.entries(schema).map(async ([entityKey, entry]) => {
      const r = await fetch(`/api/entities/${entry.templateKey}/records`);
      if (!r.ok) return fail(r);
      const body: { records: { id: string; data: Record<string, unknown> }[] } = await r.json();
      // сервер отдаёт новые записи первыми — в интерфейсе порядок создания естественнее
      data[entityKey] = body.records.map((rec) => apiToRow(ENTITIES[entityKey], entry, rec)).reverse();
    })
  );
  return { status: 'ok', schema, data };
}

export async function liveCreate(schema: Schema, entity: string, values: Record<string, unknown>): Promise<Row> {
  const entry = schema[entity];
  const res = await fetch(`/api/entities/${entry.templateKey}/records`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rowToApi(ENTITIES[entity], entry, values)),
  });
  if (!res.ok) return fail(res);
  return apiToRow(ENTITIES[entity], entry, await res.json());
}

export async function liveUpdate(schema: Schema, entity: string, row: Row): Promise<void> {
  const entry = schema[entity];
  const res = await fetch(`/api/entities/${entry.templateKey}/records/${row.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rowToApi(ENTITIES[entity], entry, row)),
  });
  if (!res.ok) return fail(res);
}

export async function liveDelete(schema: Schema, entity: string, id: string): Promise<void> {
  const res = await fetch(`/api/entities/${schema[entity].templateKey}/records/${id}`, { method: 'DELETE' });
  if (!res.ok) return fail(res);
}

export async function deployToRevolit(): Promise<{ entities: number; records: number }> {
  const res = await fetch('/api/lab/deploy', { method: 'POST' });
  if (!res.ok) return fail(res);
  return res.json();
}
