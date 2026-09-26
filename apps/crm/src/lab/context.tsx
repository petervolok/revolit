'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import { INITIAL_DATA } from './entities';
import type { Data, Row } from './types';

interface Modal {
  entity: string;
  row?: Row;
}

interface LabState {
  data: Data;
  modal: Modal | null;
  selected: Record<string, Row | null>;
  toasts: string[];
  run: (action: string, arg: { entity?: string; row?: Row }) => void;
  closeModal: () => void;
  saveRow: (entity: string, values: Record<string, unknown>, id?: string) => void;
  notify: (message: string) => void;
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

export function LabProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<Data>(INITIAL_DATA);
  const [modal, setModal] = useState<Modal | null>(null);
  const [selected, setSelected] = useState<Record<string, Row | null>>({});
  const [toasts, setToasts] = useState<string[]>([]);

  const notify = useCallback((message: string) => setToasts((t) => [message, ...t].slice(0, 6)), []);

  const patch = (entity: string, id: string, change: (r: Row) => Partial<Row>) =>
    setData((d) => ({ ...d, [entity]: d[entity].map((r) => (r.id === id ? { ...r, ...change(r) } : r)) }));
  const remove = (entity: string, id: string) => {
    setData((d) => ({ ...d, [entity]: d[entity].filter((r) => r.id !== id) }));
    setSelected((s) => (s[entity]?.id === id ? { ...s, [entity]: null } : s));
  };

  const saveRow = useCallback(
    (entity: string, values: Record<string, unknown>, id?: string) => {
      if (id) patch(entity, id, () => values as Partial<Row>);
      else setData((d) => ({ ...d, [entity]: [...d[entity], { ...values, id: newId() } as Row] }));
      notify(`${id ? 'Сохранено' : 'Создано'}: ${entity}`);
      setModal(null);
    },
    [notify]
  );

  const run: LabState['run'] = (action, { entity, row }) => {
    if (action === 'open-modal-editor' && entity) return setModal({ entity, row });
    if (action === 'open-create-dataset') return setModal({ entity: 'Dataset' });
    if (action === 'open-detail-panel' && entity && row) {
      setSelected((s) => ({ ...s, [entity]: s[entity]?.id === row.id ? null : row }));
      return;
    }
    if (!entity || !row) return notify(`Действие «${action}» (без объекта) — заглушка`);

    if (action === 'toggle-enabled') return patch(entity, row.id, (r) => ({ enabled: !r.enabled }));
    if (action === 'champion-enable') return patch(entity, row.id, () => ({ enabled: true }));
    if (action === 'plant-revive') return patch(entity, row.id, () => ({ phase: 'grow', streak_fail: 0 }));
    if (action === 'plant-step') {
      const tryNo = (row.try_no as number) + 1;
      patch(entity, row.id, () => ({ try_no: tryNo, phase: row.phase === 'seed' ? 'grow' : row.phase }));
      setData((d) => ({
        ...d,
        PlantRun: [
          ...d.PlantRun,
          { id: newId(), plantId: row.id, try_no: tryNo, gene_key: 'ema_fast', old_value: 9, new_value: 8 + (tryNo % 3), verdict: tryNo % 2 ? 'better' : 'worse', profit_factor: 1 + (tryNo % 5) / 10, reason: 'шаг (демо)' },
        ],
      }));
      return;
    }
    if (action === 'dataset-update') return patch(entity, row.id, () => ({ updated_at: new Date().toISOString().slice(0, 10) }));
    if (/^(delete-|plant-delete|dataset-delete|close-position)/.test(action)) {
      remove(entity, row.id);
      return notify(`Удалено: ${entity} «${row.name ?? row.symbol ?? row.id}»`);
    }
    notify(`Действие «${action}» — заглушка (нет бэкенда в тестовой сборке)`);
  };

  const closeModal = useCallback(() => setModal(null), []);

  return (
    <LabCtx.Provider value={{ data, modal, selected, toasts, run, closeModal, saveRow, notify }}>
      {children}
    </LabCtx.Provider>
  );
}
