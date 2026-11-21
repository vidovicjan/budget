import type { Service } from './types';
import { addMonths, daysInMonth, monthOf, pad, parseISO } from './dates';

/** Payment date of a service in a given month (day clamped to the month's length). */
function dateIn(month: string, day: number) {
  return `${month}-${pad(Math.min(day, daysInMonth(month)))}`;
}

/** Every payment date from the first one up to and including `until`. */
export function occurrences(s: Service, until: string): string[] {
  const out: string[] = [];
  const day = Number(s.startDate.slice(8, 10));
  const step = s.frequency === 'yearly' ? 12 : 1;
  let m = monthOf(s.startDate);
  for (let guard = 0; guard < 1200; guard++, m = addMonths(m, step)) {
    const date = dateIn(m, day);
    if (date > until) break;
    out.push(date);
  }
  return out;
}

/** The next payment on or after `from`. */
export function nextPayment(s: Service, from: string): string {
  if (s.startDate >= from) return s.startDate;
  const day = Number(s.startDate.slice(8, 10));
  const step = s.frequency === 'yearly' ? 12 : 1;
  let m = monthOf(s.startDate);
  // jump close to `from`, then walk forward
  const months = (Number(from.slice(0, 4)) - Number(m.slice(0, 4))) * 12 + Number(from.slice(5, 7)) - Number(m.slice(5, 7));
  m = addMonths(m, Math.max(0, Math.floor(months / step) - 1) * step);
  for (;;) {
    const date = dateIn(m, day);
    if (date >= from) return date;
    m = addMonths(m, step);
  }
}

/** Cost per month: yearly payments are spread over 12 months. */
export const monthlyCost = (s: Service) => (s.frequency === 'yearly' ? s.amount / 12 : s.amount);

function ordinal(n: number) {
  const r = n % 100;
  if (r >= 11 && r <= 13) return `${n}th`;
  return n + (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
}

/** "Monthly on the 5th" / "Yearly on Mar 14" */
export function scheduleLabel(s: Service): string {
  if (s.frequency === 'monthly') return `Monthly on the ${ordinal(Number(s.startDate.slice(8, 10)))}`;
  return `Yearly on ${parseISO(s.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

/** Whole days from `from` to `to` (both YYYY-MM-DD). */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseISO(to).getTime() - parseISO(from).getTime()) / 86400000);
}

export function dueLabel(next: string, today: string): string {
  const d = daysBetween(today, next);
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  return `in ${d} days`;
}
