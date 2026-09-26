'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import Button from '@revolit/core/ui/Button';
import Badge from '@revolit/core/ui/Badge';
import { RowScope, useLab, useRow } from './context';
import { ENTITIES } from './entities';
import { RenderNode, Slot, registerCube } from './registry';
import type { CubeNode, EntityDef, FieldDef, Row } from './types';

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

const STATUS_TONE: Record<string, Tone> = {
  grow: 'success', better: 'success', active: 'success', running: 'brand',
  seed: 'warning', dead: 'danger', worse: 'danger', error: 'danger',
};

function fieldOf(entity: EntityDef | undefined, key: string): FieldDef {
  return entity?.fields.find((f) => f.key === key) ?? { key, label: key, type: 'text' };
}

function formatValue(value: unknown, type: FieldDef['type']): string {
  if (value === null || value === undefined || value === '') return '—';
  if (type === 'percent') return `${Number(value).toFixed(1)}%`;
  if (type === 'currency') return `${Number(value) >= 0 ? '+' : ''}${Number(value).toFixed(2)}`;
  return String(value);
}

/** Значение поля как содержимое ячейки/карточки: бейдж для флагов и статусов, иначе текст */
function Cell({ field, row }: { field: FieldDef; row: Row }) {
  const value = row[field.key];
  if (field.type === 'bool') return <Badge tone={value ? 'success' : 'neutral'}>{value ? 'включена' : 'выключена'}</Badge>;
  if (field.type === 'select' && STATUS_TONE[String(value)]) return <Badge tone={STATUS_TONE[String(value)]}>{String(value)}</Badge>;
  if (field.type === 'currency') {
    const cls = Number(value) < 0 ? 'text-danger' : 'text-success';
    return <span className={cls}>{formatValue(value, field.type)}</span>;
  }
  return <>{formatValue(value, field.type)}</>;
}

const RULE_COLOR: Record<string, string> = { green: 'text-success font-medium', red: 'text-danger font-medium' };

/* ---------- action-button ---------- */
function ActionButton({ node }: { node: CubeNode }) {
  const { run } = useLab();
  const scope = useRow();
  const p = node.props ?? {};
  return (
    <Button
      size="sm"
      variant={p.variant ?? 'secondary'}
      onClick={(e) => {
        e.stopPropagation();
        if (p.confirmRequired && !window.confirm(`${p.label}? Подтвердите действие`)) return;
        run(p.action, { entity: scope?.entity, row: scope?.row });
      }}
    >
      {p.label}
    </Button>
  );
}

/* ---------- summary-tiles ---------- */
function metricValue(field: string, data: Record<string, Row[]>): number {
  const sum = (rows: Row[], k: string) => rows.reduce((a, r) => a + Number(r[k] ?? 0), 0);
  const strategies = data.Strategy ?? [];
  const plants = data.Plant ?? [];
  switch (field) {
    case 'trades_total': return sum(strategies, 'trades_total');
    case 'win_rate': {
      const trades = sum(strategies, 'trades_total');
      return trades ? strategies.reduce((a, r) => a + Number(r.win_rate) * Number(r.trades_total), 0) / trades : 0;
    }
    case 'pnl_total': return sum(strategies, 'pnl_total');
    case 'pnl_today': return 42.5;
    case 'plants_alive': return plants.filter((r) => r.phase !== 'dead').length;
    case 'plants_dead': return plants.filter((r) => r.phase === 'dead').length;
    case 'plants_total': return plants.length;
    case 'fruits_total': return 7;
    default: return 0;
  }
}

function SummaryTiles({ node }: { node: CubeNode }) {
  const { data } = useLab();
  const metrics: { label: string; field: string; format: 'number' | 'percent' | 'currency' }[] = node.props?.metrics ?? [];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {metrics.map((m) => {
        const v = metricValue(m.field, data);
        const text = m.format === 'percent' ? `${v.toFixed(1)}%` : m.format === 'currency' ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}` : String(Math.round(v));
        const tone = m.format === 'currency' ? (v < 0 ? 'text-danger' : 'text-success') : 'text-ink';
        return (
          <div key={m.field} className="rounded-xl border border-line bg-surface p-4">
            <div className="text-xs text-ink-muted">{m.label}</div>
            <div className={`mt-1 text-2xl font-semibold ${tone}`}>{text}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- card-grid ---------- */
function CardGrid({ node }: { node: CubeNode }) {
  const { data, run } = useLab();
  const p = node.props ?? {};
  const entity = ENTITIES[p.entity];
  const fields: string[] = p.fields ?? [];
  const [title, ...rest] = fields;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {(data[p.entity] ?? []).map((row) => (
        <div
          key={row.id}
          onClick={() => p.onCardClick && run(p.onCardClick, { entity: p.entity, row })}
          className="cursor-pointer rounded-xl border border-line bg-surface p-4 transition-colors hover:bg-surface-muted"
        >
          <div className="font-medium text-ink">{String(row[title] ?? '')}</div>
          <dl className="mt-2 space-y-1 text-sm">
            {rest.map((k) => {
              const f = fieldOf(entity, k);
              return (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-ink-muted">{f.label}</dt>
                  <dd className="text-right text-ink"><Cell field={f} row={row} /></dd>
                </div>
              );
            })}
          </dl>
          <div className="mt-3 flex flex-wrap gap-2">
            <RowScope entity={p.entity} row={row}><Slot nodes={node.slots?.['card-actions']} /></RowScope>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- record-table ---------- */
function RecordTable({ node }: { node: CubeNode }) {
  const { data } = useLab();
  const parent = useRow();
  const p = node.props ?? {};
  const entity = ENTITIES[p.entity];
  const columns: string[] = p.columns ?? [];
  const rules: { field: string; value: string; color: string }[] = p.colorRules ?? [];
  // Внутри панели деталей таблица показывает только дочерние записи (parentId по соглашению `<родитель>Id`)
  const link = parent ? `${parent.entity.charAt(0).toLowerCase()}${parent.entity.slice(1)}Id` : null;
  let rows = data[p.entity] ?? [];
  if (parent && link && rows.some((r) => link in r)) rows = rows.filter((r) => r[link] === parent.row.id);
  const hasActions = Boolean(node.slots?.['row-actions']?.length);

  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full text-sm">
        <thead className="bg-surface-muted text-left text-xs text-ink-muted">
          <tr>
            {columns.map((c) => <th key={c} className="px-3 py-2 font-medium">{fieldOf(entity, c).label}</th>)}
            {hasActions && <th className="px-3 py-2" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-line">
              {columns.map((c) => {
                const rule = rules.find((r) => r.field === c && String(row[c]) === r.value);
                return (
                  <td key={c} className={`px-3 py-2 ${rule ? RULE_COLOR[rule.color] ?? '' : ''}`}>
                    <Cell field={fieldOf(entity, c)} row={row} />
                  </td>
                );
              })}
              {hasActions && (
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1.5">
                    <RowScope entity={p.entity} row={row}><Slot nodes={node.slots?.['row-actions']} /></RowScope>
                  </div>
                </td>
              )}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={columns.length + 1} className="px-3 py-6 text-center text-ink-faint">Нет записей</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- item-list ---------- */
function ItemList({ node }: { node: CubeNode }) {
  const { data, run, selected } = useLab();
  const p = node.props ?? {};
  const entity = ENTITIES[p.entity];
  const fields: string[] = p.fields ?? [];
  const [title, ...rest] = fields;
  return (
    <div className="space-y-2">
      {(data[p.entity] ?? []).map((row) => {
        const open = selected[p.entity]?.id === row.id;
        return (
          <div key={row.id} className="rounded-xl border border-line bg-surface">
            <div
              onClick={() => p.onItemClick && run(p.onItemClick, { entity: p.entity, row })}
              className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-2 p-3 hover:bg-surface-muted"
            >
              <div className="min-w-[8rem] font-medium text-ink">{String(row[title] ?? '')}</div>
              {p.statusField && <Cell field={fieldOf(entity, p.statusField)} row={row} />}
              <div className="flex flex-1 flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
                {rest.filter((k) => k !== p.statusField).map((k) => (
                  <span key={k}>{fieldOf(entity, k).label}: <span className="text-ink">{formatValue(row[k], fieldOf(entity, k).type)}</span></span>
                ))}
              </div>
              <div className="flex gap-1.5">
                <RowScope entity={p.entity} row={row}><Slot nodes={node.slots?.['item-actions']} /></RowScope>
              </div>
            </div>
            {open && (
              <div className="border-t border-line p-3">
                <RowScope entity={p.entity} row={row}><Slot nodes={node.slots?.['item-detail']} /></RowScope>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- detail-panel ---------- */
function DetailPanel({ node }: { node: CubeNode }) {
  const scope = useRow();
  const entity = ENTITIES[node.props?.entity];
  if (!scope || !entity) return <div className="text-sm text-ink-faint">Объект не выбран</div>;
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-3">
        {entity.fields.filter((f) => f.key !== entity.titleField).map((f) => (
          <div key={f.key} className="flex justify-between gap-2">
            <dt className="text-ink-muted">{f.label}</dt>
            <dd><Cell field={f} row={scope.row} /></dd>
          </div>
        ))}
      </dl>
      <Slot nodes={node.slots?.sections} />
      <div className="flex gap-2"><Slot nodes={node.slots?.['panel-actions']} /></div>
    </div>
  );
}

/* ---------- modal-editor ---------- */
const PARAMS_BY_TYPE: Record<string, string> = {
  ema_cross: '{"fast":9,"slow":21}', rsi_reversal: '{"period":14,"low":30,"high":70}',
  bollinger: '{"len":20,"dev":2}', engulfing: '{"min_body":0.5}',
  donchian: '{"len":55}', vwap: '{"band":1.5}',
};

function ModalEditor({ node }: { node: CubeNode }) {
  const { modal, closeModal, saveRow } = useLab();
  const p = node.props ?? {};
  const entity = ENTITIES[p.entity];
  const [values, setValues] = useState<Record<string, any>>({});
  const active = modal?.entity === p.entity;

  useEffect(() => {
    if (active) setValues(modal?.row ? { ...modal.row } : {});
  }, [active, modal]);

  if (!active || !entity) return null;
  const editable = entity.fields.filter((f) => !f.computed);
  const set = (k: string, v: unknown) => setValues((s) => {
    const next = { ...s, [k]: v };
    // динамические поля: смена типа стратегии подставляет шаблон параметров
    if (p.dynamicFields && k === 'type' && typeof v === 'string' && PARAMS_BY_TYPE[v]) next.params = PARAMS_BY_TYPE[v];
    return next;
  });

  const isEdit = Boolean(modal?.row);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeModal}>
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 text-base font-semibold text-ink">{isEdit ? 'Редактирование' : 'Создание'}: {entity.name}</h3>
        <div className="space-y-3">
          {editable.map((f) => (
            <label key={f.key} className="block text-sm">
              <span className="mb-1 block text-ink-muted">{f.label}</span>
              {f.type === 'select' || f.type === 'bool' ? (
                <select
                  className="h-9 w-full rounded-lg border border-line bg-surface px-2"
                  value={f.type === 'bool' ? String(Boolean(values[f.key])) : values[f.key] ?? ''}
                  onChange={(e) => set(f.key, f.type === 'bool' ? e.target.value === 'true' : e.target.value)}
                >
                  {f.type === 'bool'
                    ? [<option key="t" value="true">да</option>, <option key="f" value="false">нет</option>]
                    : [<option key="" value="">—</option>, ...(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)]}
                </select>
              ) : (
                <input
                  className="h-9 w-full rounded-lg border border-line bg-surface px-3"
                  type={f.type === 'number' ? 'number' : 'text'}
                  value={values[f.key] ?? ''}
                  onChange={(e) => set(f.key, f.type === 'number' ? Number(e.target.value) : e.target.value)}
                />
              )}
            </label>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={closeModal}>Отмена</Button>
          <Button size="sm" variant="primary" onClick={() => saveRow(p.entity, values, modal?.row?.id)}>Сохранить</Button>
        </div>
      </div>
    </div>
  );
}

/* ---------- progress-indicator ---------- */
function ProgressIndicator({ node }: { node: CubeNode }) {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setPct((v) => (v >= 100 ? 0 : v + 5)), 500);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-2 flex justify-between text-sm">
        <span className="text-ink">{node.props?.label}</span>
        <span className="text-ink-muted">{pct}% <span className="text-ink-faint">(имитация, источник: {node.props?.operationRef})</span></span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
        <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ---------- settings-form ---------- */
function SettingsForm({ node }: { node: CubeNode }) {
  const { notify } = useLab();
  const fields: { key: string; label: string; type: string }[] = node.props?.fields ?? [];
  const [values, setValues] = useState<Record<string, string>>({});
  return (
    <div className="max-w-lg space-y-3 rounded-xl border border-line bg-surface p-4">
      {fields.map((f) => (
        <label key={f.key} className="block text-sm">
          <span className="mb-1 block text-ink-muted">{f.label}</span>
          <input
            className="h-9 w-full rounded-lg border border-line bg-surface px-3"
            type={f.type === 'password' ? 'password' : 'text'}
            value={values[f.key] ?? ''}
            onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value }))}
          />
        </label>
      ))}
      <Button size="sm" variant="primary" onClick={() => notify('Настройки сохранены (демо, никуда не отправляется)')}>Сохранить</Button>
    </div>
  );
}

registerCube('action-button', ActionButton);
registerCube('summary-tiles', SummaryTiles);
registerCube('card-grid', CardGrid);
registerCube('record-table', RecordTable);
registerCube('item-list', ItemList);
registerCube('detail-panel', DetailPanel);
registerCube('modal-editor', ModalEditor);
registerCube('progress-indicator', ProgressIndicator);
registerCube('settings-form', SettingsForm);

export { RenderNode };
