import type { Data, EntityDef } from './types';

/** Описание сущностей проекта «Торговый бот» (data_model_notes из project.yaml) */
export const ENTITIES: Record<string, EntityDef> = {
  Strategy: {
    key: 'Strategy',
    name: 'Стратегия',
    titleField: 'name',
    fields: [
      { key: 'name', label: 'Название', type: 'text' },
      { key: 'type', label: 'Тип', type: 'select', options: ['ema_cross', 'rsi_reversal', 'bollinger', 'engulfing', 'donchian', 'vwap'] },
      { key: 'symbols', label: 'Символы', type: 'text' },
      { key: 'timeframe', label: 'Таймфрейм', type: 'select', options: ['1', '5', '15', '30', '60', '240', 'D'] },
      { key: 'enabled', label: 'Включена', type: 'bool' },
      { key: 'params', label: 'Параметры (JSON)', type: 'text' },
      { key: 'trades_total', label: 'Сделок', type: 'number', computed: true },
      { key: 'win_rate', label: '% побед', type: 'percent', computed: true },
      { key: 'pnl_total', label: 'PnL', type: 'currency', computed: true },
    ],
  },
  Position: {
    key: 'Position',
    name: 'Позиция',
    titleField: 'symbol',
    fields: [
      { key: 'symbol', label: 'Символ', type: 'text' },
      { key: 'side', label: 'Сторона', type: 'select', options: ['Buy', 'Sell'] },
      { key: 'qty', label: 'Кол-во', type: 'number' },
      { key: 'entry_price', label: 'Вход', type: 'number' },
      { key: 'mark_price', label: 'Текущая', type: 'number' },
      { key: 'sl', label: 'SL', type: 'number' },
      { key: 'tp', label: 'TP', type: 'number' },
      { key: 'leverage', label: 'Плечо', type: 'number' },
      { key: 'margin', label: 'Маржа', type: 'currency' },
      { key: 'unrealized_pnl', label: 'PnL', type: 'currency' },
    ],
  },
  Plant: {
    key: 'Plant',
    name: 'Растение',
    titleField: 'name',
    fields: [
      { key: 'name', label: 'Имя', type: 'text' },
      { key: 'phase', label: 'Фаза', type: 'select', options: ['seed', 'grow', 'dead'] },
      { key: 'generation', label: 'Поколение', type: 'number' },
      { key: 'try_no', label: 'Попытка', type: 'number' },
      { key: 'streak_fail', label: 'Неудач подряд', type: 'number' },
      { key: 'metrics_summary', label: 'Сводка', type: 'text' },
    ],
  },
  PlantRun: {
    key: 'PlantRun',
    name: 'Попытка мутации',
    titleField: 'gene_key',
    fields: [
      { key: 'try_no', label: '№', type: 'number' },
      { key: 'gene_key', label: 'Ген', type: 'text' },
      { key: 'old_value', label: 'Было', type: 'number' },
      { key: 'new_value', label: 'Стало', type: 'number' },
      { key: 'verdict', label: 'Вердикт', type: 'select', options: ['running', 'better', 'worse', 'error'] },
      { key: 'profit_factor', label: 'PF', type: 'number' },
      { key: 'reason', label: 'Причина', type: 'text' },
    ],
  },
  Champion: {
    key: 'Champion',
    name: 'Чемпион',
    titleField: 'name',
    fields: [
      { key: 'name', label: 'Имя', type: 'text' },
      { key: 'description', label: 'Описание', type: 'text' },
      { key: 'symbol', label: 'Символ', type: 'text' },
      { key: 'timeframe', label: 'Таймфрейм', type: 'text' },
      { key: 'profit_factor', label: 'PF', type: 'number' },
      { key: 'win_rate', label: '% побед', type: 'percent' },
      { key: 'enabled', label: 'В торговле', type: 'bool' },
    ],
  },
  Dataset: {
    key: 'Dataset',
    name: 'Датасет',
    titleField: 'symbol',
    fields: [
      { key: 'symbol', label: 'Символ', type: 'text' },
      { key: 'timeframe', label: 'Таймфрейм', type: 'select', options: ['1', '5', '15', '60', '240', 'D'] },
      { key: 'target_bars', label: 'Баров (цель)', type: 'number' },
      { key: 'bars_actual', label: 'Баров (факт)', type: 'number', computed: true },
      { key: 'source', label: 'Источник', type: 'text' },
      { key: 'updated_at', label: 'Обновлён', type: 'date', computed: true },
    ],
  },
};

export const INITIAL_DATA: Data = {
  Strategy: [
    { id: 's1', name: 'EMA-кросс BTC', type: 'ema_cross', symbols: 'BTCUSDT', timeframe: '15', enabled: true, params: '{"fast":9,"slow":21}', trades_total: 128, win_rate: 54.7, pnl_total: 312.4 },
    { id: 's2', name: 'RSI-разворот ETH', type: 'rsi_reversal', symbols: 'ETHUSDT', timeframe: '60', enabled: true, params: '{"period":14}', trades_total: 76, win_rate: 48.7, pnl_total: -41.2 },
    { id: 's3', name: 'Боллинджер альты', type: 'bollinger', symbols: 'SOLUSDT,XRPUSDT', timeframe: '5', enabled: false, params: '{"len":20,"dev":2}', trades_total: 203, win_rate: 51.2, pnl_total: 88.9 },
    { id: 's4', name: 'Дончиан BTC', type: 'donchian', symbols: 'BTCUSDT', timeframe: '240', enabled: false, params: '{"len":55}', trades_total: 31, win_rate: 41.9, pnl_total: -12.0 },
  ],
  Position: [
    { id: 'p1', symbol: 'BTCUSDT', side: 'Buy', qty: 0.02, entry_price: 64210, mark_price: 64480, sl: 63500, tp: 66000, leverage: 5, margin: 257.1, unrealized_pnl: 5.4 },
    { id: 'p2', symbol: 'ETHUSDT', side: 'Sell', qty: 0.5, entry_price: 3120, mark_price: 3151, sl: 3200, tp: 2950, leverage: 3, margin: 520.0, unrealized_pnl: -15.5 },
    { id: 'p3', symbol: 'SOLUSDT', side: 'Buy', qty: 10, entry_price: 142.3, mark_price: 143.9, sl: 138, tp: 152, leverage: 4, margin: 355.7, unrealized_pnl: 16.0 },
  ],
  Plant: [
    { id: 'pl1', name: 'Фиалка-7', phase: 'grow', generation: 3, try_no: 12, streak_fail: 1, metrics_summary: 'PF 1.42 · WR 55%' },
    { id: 'pl2', name: 'Дуб-2', phase: 'seed', generation: 1, try_no: 0, streak_fail: 0, metrics_summary: 'ещё не запускалось' },
    { id: 'pl3', name: 'Мак-11', phase: 'dead', generation: 5, try_no: 30, streak_fail: 9, metrics_summary: 'PF 0.81 · WR 44%' },
    { id: 'pl4', name: 'Лён-4', phase: 'grow', generation: 2, try_no: 8, streak_fail: 0, metrics_summary: 'PF 1.18 · WR 52%' },
  ],
  PlantRun: [
    { id: 'r1', plantId: 'pl1', try_no: 10, gene_key: 'ema_fast', old_value: 9, new_value: 8, verdict: 'worse', profit_factor: 1.05, reason: 'просадка выше порога' },
    { id: 'r2', plantId: 'pl1', try_no: 11, gene_key: 'ema_slow', old_value: 21, new_value: 24, verdict: 'better', profit_factor: 1.31, reason: 'PF вырос' },
    { id: 'r3', plantId: 'pl1', try_no: 12, gene_key: 'sl_pct', old_value: 1.5, new_value: 1.2, verdict: 'better', profit_factor: 1.42, reason: 'PF вырос' },
    { id: 'r4', plantId: 'pl4', try_no: 7, gene_key: 'rsi_len', old_value: 14, new_value: 10, verdict: 'worse', profit_factor: 0.97, reason: 'PF упал' },
    { id: 'r5', plantId: 'pl4', try_no: 8, gene_key: 'rsi_len', old_value: 14, new_value: 18, verdict: 'better', profit_factor: 1.18, reason: 'PF вырос' },
  ],
  Champion: [
    { id: 'c1', name: 'Чемпион BTC-15', description: 'Лучший по PF за квартал', symbol: 'BTCUSDT', timeframe: '15', profit_factor: 1.63, win_rate: 58.2, enabled: false },
    { id: 'c2', name: 'Чемпион ETH-60', description: 'Стабильный, малая просадка', symbol: 'ETHUSDT', timeframe: '60', profit_factor: 1.48, win_rate: 55.0, enabled: true },
    { id: 'c3', name: 'Чемпион SOL-5', description: 'Агрессивный, много сделок', symbol: 'SOLUSDT', timeframe: '5', profit_factor: 1.37, win_rate: 51.6, enabled: false },
  ],
  Dataset: [
    { id: 'd1', symbol: 'BTCUSDT', timeframe: '15', target_bars: 20000, bars_actual: 20000, source: 'Bybit', updated_at: '2026-09-24' },
    { id: 'd2', symbol: 'ETHUSDT', timeframe: '60', target_bars: 10000, bars_actual: 9874, source: 'Bybit', updated_at: '2026-09-25' },
  ],
};
