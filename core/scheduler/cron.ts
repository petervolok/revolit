/**
 * Минимальный разбор и вычисление cron-выражений из 5 полей: минута час день-месяца месяц день-недели.
 * Поддержано: `*`, число, список `a,b`, диапазон `a-b`, шаг `*\/n` и `a-b/n`. Не поддержано: названия
 * месяцев и дней (`JAN`, `MON`), специальные слова (`@daily`), поле секунд. Своя реализация,
 * а не зависимость — чтобы не тащить пакет ради сотни строк (ТЗ переработки ядра, 7).
 *
 * День месяца и день недели, если ограничены ОБА, срабатывают по «или» — как в классическом cron.
 * Время считается в UTC со сдвигом `offsetMinutes` (для «9 утра по Москве» — 180).
 */
export interface CronSpec {
  minute: Set<number>;
  hour: Set<number>;
  dayOfMonth: Set<number>;
  month: Set<number>;
  dayOfWeek: Set<number>;
  dayOfMonthAny: boolean;
  dayOfWeekAny: boolean;
}

function parseField(field: string, min: number, max: number): Set<number> | null {
  const result = new Set<number>();

  for (const part of field.split(',')) {
    const match = part.match(/^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/);
    if (!match) return null;

    const [, range, stepText] = match;
    const step = stepText === undefined ? 1 : Number(stepText);
    if (step < 1) return null;

    let from: number;
    let to: number;
    if (range === '*') {
      from = min;
      to = max;
    } else if (range.includes('-')) {
      [from, to] = range.split('-').map(Number);
    } else {
      from = Number(range);
      // «5/10» без диапазона в этой реализации не поддерживаем — только одиночное число
      to = stepText === undefined ? from : max;
    }

    if (from < min || to > max || from > to) return null;
    for (let v = from; v <= to; v += step) result.add(v);
  }

  return result.size > 0 ? result : null;
}

export function parseCron(expression: string): CronSpec | null {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return null;

  const minute = parseField(fields[0], 0, 59);
  const hour = parseField(fields[1], 0, 23);
  const dayOfMonth = parseField(fields[2], 1, 31);
  const month = parseField(fields[3], 1, 12);
  const dowRaw = parseField(fields[4], 0, 7);
  if (!minute || !hour || !dayOfMonth || !month || !dowRaw) return null;

  // 7 — тоже воскресенье
  const dayOfWeek = new Set([...dowRaw].map((d) => (d === 7 ? 0 : d)));

  return {
    minute,
    hour,
    dayOfMonth,
    month,
    dayOfWeek,
    dayOfMonthAny: fields[2] === '*',
    dayOfWeekAny: fields[4] === '*',
  };
}

export function matches(spec: CronSpec, date: Date, offsetMinutes = 0): boolean {
  const d = new Date(date.getTime() + offsetMinutes * 60_000);
  if (!spec.minute.has(d.getUTCMinutes()) || !spec.hour.has(d.getUTCHours()) || !spec.month.has(d.getUTCMonth() + 1)) {
    return false;
  }

  const domOk = spec.dayOfMonth.has(d.getUTCDate());
  const dowOk = spec.dayOfWeek.has(d.getUTCDay());
  if (spec.dayOfMonthAny && spec.dayOfWeekAny) return true;
  if (spec.dayOfMonthAny) return dowOk;
  if (spec.dayOfWeekAny) return domOk;
  return domOk || dowOk;
}

/**
 * Последний момент расписания, не позже `now` (с точностью до минуты), либо null,
 * если за отведённый горизонт (по умолчанию год) его не было. Перебор идёт назад по минутам.
 */
export function latestOccurrence(
  spec: CronSpec,
  now: Date,
  offsetMinutes = 0,
  maxMinutesBack = 366 * 24 * 60
): Date | null {
  const start = Math.floor(now.getTime() / 60_000) * 60_000;
  for (let i = 0; i <= maxMinutesBack; i++) {
    const candidate = new Date(start - i * 60_000);
    if (matches(spec, candidate, offsetMinutes)) return candidate;
  }
  return null;
}
