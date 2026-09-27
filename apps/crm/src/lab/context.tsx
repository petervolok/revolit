'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Schema } from './convert';
import { INITIAL_DATA } from './entities';
import { deployToRevolit, liveCreate, liveDelete, liveUpdate, loadLive } from './live';
import type { LiveStatus } from './live';
import type { Data, Row } from './types';

interface Modal {
  entity: string;
  row?: Row;
}

export type Mode = 'loading' | 'demo' | 'live';

interface LabState {
  data: Data;
  modal: Modal | null;
  selected: Record<string, Row | null>;
  toasts: string[];
  /** live — данные из Revolit; demo — в памяти (не вошли или сущности не созданы) */
  mode: Mode;
  liveStatus: LiveStatus | 'loading';
  run: (action: string, arg: { entity?: string; row?: Row }) => void;
  closeModal: () => void;
  saveRow: (entity: string, values: Record<string, unknown>, id?: string) => void;
  notify: (message: string) => void;
  deploy: () => Promise<void>;
}

const LabCtx = createContext<LabState | null>(null);

export function useLab(): LabState {
  const ctx = useContext(LabCtx);
  if (!ctx) throw new Error('LabProvider не найден');
  return ctx;
}

/** Объект, к которому относится слот (строка таблицы, карточка, элемент списка) */
const RowCtx = createContext<{ entity: string; row: Row } | null>(null);
export const useRow = () => useContext(RowCtx);
export function RowScope({ entity, row, children }: { entity: string; row: Row; children: React.ReactNode }) {
  return <RowCtx.Provider value={{ entity, row }}>{children}</RowCtx.Provider>;
}

let counter = 0;
const newId = () => `n${Date.now().toString(36)}${counter++}`;

const ENTITY_VIRTUAL = new Set(['Position']);

export function LabProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<Data>(INITIAL_DATA);
  const [modal, setModal] = useState<Modal | null>(null);
  const [selected, setSelected] = useState<Record<string, Row | null>>({});
  const [toasts, setToasts] = useState<string[]>([]);
  const [liveStatus, setLiveStatus] = useState<LiveStatus | 'loading'>('loading');
  const schema = useRef<Schema | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  const notify = useCallback((message: string) => setToasts((t) => [message, ...t].slice(0, 6)), []);

  const load = useCallback(async () => {
    try {
      const result = await loadLive();
      setLiveStatus(result.status);
      if (result.status === 'ok' && result.schema && result.data) {
        schema.current = result.schema;
        // Позиции с биржи — живые данные, в Revolit их нет: остаются демонстрационными
        setData({ ...INITIAL_DATA, ...result.data });
      } else {
        schema.current = null;
      }
    } catch {
      setLiveStatus('error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const isLive = (entity: string) => schema.current !== null && !ENTITY_VIRTUAL.has(entity);
  const fail = (e: unknown) => notify(`Ошибка: ${(e as Error).message}`);

  const createRow = async (entity: string, values: Record<string, unknown>): Promise<Row | null> => {
    try {
      const row = isLive(entity) ? await liveCreate(schema.current as Schema, entity, values) : ({ ...values, id: newId() } as Row);
      setData((d) => ({ ...d, [entity]: [...d[entity], row] }));
      return row;
    } catch (e) {
      fail(e);
      return null;
    }
  };

  const updateRow = async (entity: string, id: string, change: Partial<Row>) => {
    const current = dataRef.current[entity].find((r) => r.id === id);
    if (!current) return;
    const next = { ...current, ...change } as Row;
    setData((d) => ({ ...d, [entity]: d[entity].map((r) => (r.id === id ? next : r)) }));
    if (isLive(entity)) await liveUpdate(schema.current as Schema, entity, next).catch(fail);
  };

  const removeRow = async (entity: string, id: string) => {
    setData((d) => ({ ...d, [entity]: d[entity].filter((r) => r.id !== id) }));
    setSelected((s) => (s[entity]?.id === id ? { ...s, [entity]: null } : s));
    if (isLive(entity)) await liveDelete(schema.current as Schema, entity, id).catch(fail);
  };

  const saveRow = useCallback(
    async (entity: string, values: Record<string, unknown>, id?: string) => {
      if (id) await updateRow(entity, id, values as Partial<Row>);
      else await createRow(entity, values);
      notify(`${id ? 'Сохранено' : 'Создано'}: ${entity}`);
      setModal(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const run: LabState['run'] = (action, { entity, row }) => {
    if (action === 'open-modal-editor' && entity) return setModal({ entity, row });
    if (action === 'open-create-dataset') return setModal({ entity: 'Dataset' });
    if (action === 'open-detail-panel' && entity && row) {
      setSelected((s) => ({ ...s, [entity]: s[entity]?.id === row.id ? null : row }));
      return;
    }
    if (action === 'seed-new-plant') {
      const n = dataRef.current.Plant.length + 1;
      void createRow('Plant', { name: `Росток-${n}`, phase: 'seed', generation: 1, try_no: 0, streak_fail: 0, metrics_summary: 'ещё не запускалось' });
      return;
    }
    if (!entity || !row) return notify(`Действие «${action}» (без объекта) — заглушка`);

    if (action === 'toggle-enabled') return void updateRow(entity, row.id, { enabled: !row.enabled });
    if (action === 'champion-enable') return void updateRow(entity, row.id, { enabled: true });
    if (action === 'plant-revive') return void updateRow(entity, row.id, { phase: 'grow', streak_fail: 0 });
    if (action === 'plant-step') {
      const tryNo = (row.try_no as number) + 1;
      void updateRow(entity, row.id, { try_no: tryNo, phase: row.phase === 'seed' ? 'grow' : row.phase });
      void createRow('PlantRun', {
        plantId: row.id, try_no: tryNo, gene_key: 'ema_fast', old_value: 9, new_value: 8 + (tryNo % 3),
        verdict: tryNo % 2 ? 'better' : 'worse', profit_factor: 1 + (tryNo % 5) / 10, reason: 'шаг (демо)',
      });
      return;
    }
    if (action === 'dataset-update') return void updateRow(entity, row.id, { updated_at: new Date().toISOString().slice(0, 10) });
    if (/^(delete-|plant-delete|dataset-delete|close-position)/.test(action)) {
      if (entity === 'Plant') {
        // связанные попытки не должны остаться «висеть» без растения
        for (const child of dataRef.current.PlantRun.filter((r) => r.plantId === row.id)) void removeRow("PlantRun", child.id);
      }
      void removeRow(entity, row.id);
      return notify(`Удалено: ${entity} «${row.name ?? row.symbol ?? row.id}»`);
    }
    notify(`Действие «${action}» — заглушка (нет бэкенда в тестовой сборке)`);
  };

  const deploy = async () => {
    try {
      const r = await deployToRevolit();
      notify(`Развёрнуто в Revolit: сущностей ${r.entities}, записей ${r.records}`);
      setLiveStatus('loading');
      await load();
    } catch (e) {
      fail(e);
    }
  };

  const closeModal = useCallback(() => setModal(null), []);
  const mode: Mode = liveStatus === 'loading' ? 'loading' : liveStatus === 'ok' ? 'live' : 'demo';

  return (
    <LabCtx.Provider value={{ data, modal, selected, toasts, mode, liveStatus, run, closeModal, saveRow, notify, deploy }}>
      {children}
    </LabCtx.Provider>
  );
}
