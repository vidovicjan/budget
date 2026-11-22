import type { Account, AccountInterest, AppData, Category, InterestPayout, Transaction } from './types';
import { addMonths, daysInMonth, monthOf, pad, todayISO } from './dates';
import { round2 } from './format';

/** Income category interest is booked under. Fixed id so copies of a shared space agree. */
export const INTEREST_CATEGORY_ID = 'cat-interest';

export const PAYOUT_LABEL: Record<InterestPayout, string> = {
  monthly: 'Monthly',
  quarterly: 'Every 3 months',
  yearly: 'Yearly',
};

const PERIOD_MONTHS: Record<InterestPayout, number> = { monthly: 1, quarterly: 3, yearly: 12 };

/** Fixed id per account and period, so the same payment is never created twice (also across devices). */
export const interestId = (accountId: string, periodEnd: string) => `int-${accountId}-${periodEnd}`;

/** Last month of the payout period that `month` falls in (quarters end Mar/Jun/Sep/Dec, years in Dec). */
export function periodEnd(month: string, payout: InterestPayout): string {
  const n = PERIOD_MONTHS[payout];
  const m = Number(month.slice(5, 7));
  const end = Math.ceil(m / n) * n;
  return `${month.slice(0, 4)}-${pad(end)}`;
}

const lastDayOf = (month: string) => `${month}-${pad(daysInMonth(month))}`;

/** Every change to an account's balance: [date, signed amount]. */
function movements(d: AppData, accountId: string): [string, number][] {
  const out: [string, number][] = [];
  for (const t of d.transactions) if (t.accountId === accountId) out.push([t.date, t.type === 'income' ? t.amount : -t.amount]);
  for (const x of d.transfers) {
    if (x.from === accountId) out.push([x.date, -x.amount]);
    if (x.to === accountId) out.push([x.date, x.amount]);
  }
  return out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

/**
 * Interest earned from `from` to `to` (inclusive): each day's closing balance, if positive,
 * earns rate / 365. Returns the gross amount, unrounded.
 */
function earned(opening: number, moves: [string, number][], from: string, to: string, rate: number): number {
  let bal = opening;
  let i = 0;
  while (i < moves.length && moves[i][0] < from) bal += moves[i++][1];
  let sum = 0;
  const day = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  while (day <= end) {
    const iso = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
    while (i < moves.length && moves[i][0] <= iso) bal += moves[i++][1];
    if (bal > 0) sum += (bal * rate) / 100 / 365;
    day.setDate(day.getDate() + 1);
  }
  return sum;
}

/** Interest after the withheld tax, rounded to cents. */
const net = (gross: number, tax: number) => round2(gross * (1 - Math.min(100, Math.max(0, tax)) / 100));

/**
 * Books interest for every finished payout period, up to today, as income on the account.
 * Runs with the repeat engine on every change; already-booked or deleted periods are skipped.
 */
export function applyInterest(d: AppData, today = todayISO()): AppData {
  const withRate = d.accounts.filter((a) => a.interest && a.interest.rate > 0);
  if (!withRate.length) return d;
  const ids = new Set(d.transactions.map((t) => t.id));
  const skips = new Set(d.recurringSkips);
  let data = d;
  let created = Date.now();
  for (const a of withRate) {
    const cfg = a.interest as AccountInterest;
    let month = monthOf(cfg.since);
    let start = cfg.since;
    // Walk payout periods while the period's last day is in the past or today.
    for (let guard = 0; guard < 600; guard++) {
      const endMonth = periodEnd(month, cfg.payout);
      const endDay = lastDayOf(endMonth);
      if (endDay > today) break;
      const id = interestId(a.id, endMonth);
      if (!ids.has(id) && !skips.has(id)) {
        const amount = net(earned(a.openingBalance, movements(data, a.id), start, endDay, cfg.rate), cfg.tax);
        if (amount >= 0.01) {
          const [withCat, categoryId] = withCategory(data);
          data = withCat;
          const tx: Transaction = {
            id,
            date: endDay,
            description: `Interest · ${a.name}`,
            amount,
            type: 'income',
            categoryId,
            accountId: a.id,
            note: `${cfg.rate}% a year${cfg.tax ? `, after ${cfg.tax}% tax` : ''}`,
            repeat: null,
            interestOf: a.id,
            created: created++,
          };
          data = { ...data, transactions: [...data.transactions, tx] };
          ids.add(id);
        }
      }
      month = addMonths(endMonth, 1);
      start = `${month}-01`;
    }
  }
  return data;
}

/** The income category interest goes to: an existing "Interest" category, or a new one. */
function withCategory(d: AppData): [AppData, string] {
  const found =
    d.categories.find((c) => c.id === INTEREST_CATEGORY_ID) ?? d.categories.find((c) => c.type === 'income' && /^interest$/i.test(c.name.trim()));
  if (found) return [d, found.id];
  const cat: Category = { id: INTEREST_CATEGORY_ID, name: 'Interest', type: 'income', color: '#2F6466', budget: 0 };
  return [{ ...d, categories: [...d.categories, cat] }, cat.id];
}

/** What the account earns so far in the current period, and a 30-day estimate at today's balance. */
export function interestPreview(d: AppData, a: Account, today = todayISO()) {
  const cfg = a.interest;
  if (!cfg || cfg.rate <= 0) return null;
  const moves = movements(d, a.id);
  const endMonth = periodEnd(monthOf(today), cfg.payout);
  let startMonth = addMonths(endMonth, -(PERIOD_MONTHS[cfg.payout] - 1));
  let start = `${startMonth}-01`;
  if (cfg.since > start) {
    start = cfg.since;
    startMonth = monthOf(start);
  }
  const accrued = start <= today ? net(earned(a.openingBalance, moves, start, today, cfg.rate), cfg.tax) : 0;
  const balance = moves.filter((m) => m[0] <= today).reduce((s, m) => s + m[1], a.openingBalance);
  const perMonth = net((Math.max(0, balance) * cfg.rate) / 100 / 12, cfg.tax);
  return { accrued, perMonth, nextPayout: lastDayOf(endMonth), balance };
}
