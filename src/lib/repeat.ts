import type { AppData, Repeat, RepeatUnit, Transaction } from './types';
import { addMonths, daysInMonth, monthOf, pad, toISO } from './dates';

/** Safety cap so a daily rule from years ago can't create an unbounded number of copies. */
const MAX_OCCURRENCES = 3000;

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return toISO(new Date(y, m - 1, d + n, 12));
}

/** The date `n` steps after `start` (n = 0 is `start`). Month and year steps keep the day of month, clamped to the month's length. */
function step(start: string, r: Repeat, n: number): string {
  if (r.unit === 'day') return addDays(start, n * r.every);
  if (r.unit === 'week') return addDays(start, n * r.every * 7);
  const months = n * r.every * (r.unit === 'year' ? 12 : 1);
  const m = addMonths(monthOf(start), months);
  return `${m}-${pad(Math.min(Number(start.slice(8, 10)), daysInMonth(m)))}`;
}

/** Every date after `start` (not including it) up to and including `until`. */
export function repeatDates(start: string, r: Repeat, until: string): string[] {
  const out: string[] = [];
  for (let n = 1; n <= MAX_OCCURRENCES; n++) {
    const date = step(start, r, n);
    if (date > until) break;
    out.push(date);
  }
  return out;
}

/**
 * Identifies one occurrence of a repeating transaction. Month and year rules use the month
 * (compatible with data made before weekly repeats existed); day and week rules use the date.
 */
export function occurrenceKey(templateId: string, date: string, r: Repeat | null): string {
  return r && (r.unit === 'day' || r.unit === 'week') ? `${templateId}:${date}` : `${templateId}:${monthOf(date)}`;
}

/** Keys of copies that already exist. Each copy is registered under both forms, so changing a rule never duplicates. */
export function existingKeys(d: AppData): Set<string> {
  const keys = new Set<string>();
  for (const t of d.transactions) {
    const src = t.sourceId ?? t.serviceId;
    if (!src) continue;
    keys.add(`${src}:${monthOf(t.date)}`);
    keys.add(`${src}:${t.date}`);
  }
  return keys;
}

/** Key to record when the user deletes a generated copy, so it isn't recreated. */
export function skipKeyFor(d: AppData, copy: Transaction): string | null {
  if (copy.interestOf) return copy.id;
  if (copy.serviceId) return `${copy.serviceId}:${monthOf(copy.date)}`;
  if (!copy.sourceId) return null;
  const tpl = d.transactions.find((t) => t.id === copy.sourceId);
  return occurrenceKey(copy.sourceId, copy.date, tpl?.repeat ?? null);
}

const UNIT: Record<RepeatUnit, [string, string]> = {
  day: ['day', 'days'],
  week: ['week', 'weeks'],
  month: ['month', 'months'],
  year: ['year', 'years'],
};

/** "Every week", "Every 2 weeks", "Every 10 days" */
export function repeatLabel(r: Repeat): string {
  if (r.every === 2 && r.unit === 'week') return 'Every 2 weeks (bi-weekly)';
  return r.every === 1 ? `Every ${UNIT[r.unit][0]}` : `Every ${r.every} ${UNIT[r.unit][1]}`;
}

export const unitName = (u: RepeatUnit, n: number) => UNIT[u][n === 1 ? 0 : 1];

export function isRepeat(v: unknown): v is Repeat {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.every === 'number' && Number.isInteger(r.every) && r.every >= 1 && r.every <= 365 && ['day', 'week', 'month', 'year'].includes(r.unit as string)
  );
}
