import type { AppData, TxType } from './types';
import { daysInMonth, monthOf, pad } from './dates';
import { occurrences } from './services';
import { existingKeys, occurrenceKey, repeatDates } from './repeat';

/** A payment that hasn't happened yet: it is added as a transaction automatically on its date. */
export interface Scheduled {
  key: string;
  date: string;
  description: string;
  amount: number;
  type: TxType;
  categoryId: string;
  accountId: string;
  /** 'service' = a subscription/bill; 'repeat' = a transaction set to repeat monthly. */
  source: 'service' | 'repeat';
  /** false for services that are only reminders (not added automatically). */
  autoAdd: boolean;
}

/** Upcoming payments in `month` after `today` that don't exist as transactions yet. */
export function scheduledIn(d: AppData, month: string, today: string): Scheduled[] {
  const end = `${month}-${pad(daysInMonth(month))}`;
  if (end <= today) return [];
  const existing = existingKeys(d);
  const skips = new Set(d.recurringSkips);
  const out: Scheduled[] = [];
  const open = (key: string) => !existing.has(key) && !skips.has(key);
  const start = `${month}-01`;

  for (const t of d.transactions) {
    if (!t.repeat || t.sourceId || t.date >= end) continue;
    for (const date of repeatDates(t.date, t.repeat, end)) {
      if (date <= today || date < start) continue;
      const key = occurrenceKey(t.id, date, t.repeat);
      if (!open(key)) continue;
      out.push({
        key,
        date,
        description: t.description,
        amount: t.amount,
        type: t.type,
        categoryId: t.categoryId,
        accountId: t.accountId,
        source: 'repeat',
        autoAdd: true,
      });
    }
  }

  for (const s of d.services) {
    if (!open(`${s.id}:${month}`)) continue;
    for (const date of occurrences(s, end)) {
      if (date <= today || monthOf(date) !== month) continue;
      out.push({
        key: `${s.id}:${month}`,
        date,
        description: s.name,
        amount: s.amount,
        type: 'expense',
        categoryId: s.categoryId,
        accountId: s.accountId,
        source: 'service',
        autoAdd: s.autoAdd,
      });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Monday-first weeks covering the month; days outside it are null. */
export function monthWeeks(month: string): (string | null)[][] {
  const first = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1);
  const lead = (first.getDay() + 6) % 7;
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let i = 1; i <= daysInMonth(month); i++) cells.push(`${month}-${pad(i)}`);
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
