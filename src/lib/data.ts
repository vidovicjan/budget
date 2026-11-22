import type { Account, AccountInterest, AppData, Category, Member, Note, Position, Service, Settlement, Split, Transaction, Transfer, TxType } from './types';
import { monthOf, todayISO } from './dates';
import { occurrences } from './services';
import { existingKeys, isRepeat, occurrenceKey, repeatDates } from './repeat';
import { applyInterest } from './interest';

export const uid = () => crypto.randomUUID();

/** Display color: the darkest palette navy follows the theme so it stays visible in dark mode. */
export const shade = (hex: string) => (hex.toUpperCase() === '#1A2744' ? 'var(--series-ink)' : hex);

/** Colors for people in a shared space. */
export const MEMBER_COLORS = ['#E86F56', '#2F6466', '#7186B0', '#C9A06A', '#8C6A9E', '#4A5D86', '#9A5B45', '#D6B98C'];

export const UNCATEGORIZED_COLOR = '#A9AFBF';
export const OTHER_COLOR = '#DCD3C2';

/** Colors from the style guide, then a few extra steps for categories you add. */
export const CATEGORY_COLORS = [
  '#1A2744', '#7186B0', '#E86F56', '#D6B98C', '#B3BDD3', '#4A5D86',
  '#F2A48F', '#C9A06A', '#2F6466', '#8C6A9E', '#9A5B45', '#5E6476',
];

const EXPENSE_DEFAULTS: [string, string][] = [
  ['Housing', '#1A2744'],
  ['Groceries', '#7186B0'],
  ['Dining out', '#E86F56'],
  ['Shopping', '#D6B98C'],
  ['Utilities', '#B3BDD3'],
  ['Transport', '#4A5D86'],
  ['Entertainment', '#F2A48F'],
  ['Health', '#C9A06A'],
  ['Subscriptions', '#2F6466'],
];

const INCOME_DEFAULTS: [string, string][] = [
  ['Salary', '#1A2744'],
  ['Freelance', '#7186B0'],
  ['Interest', '#D6B98C'],
  ['Gift', '#F2A48F'],
  ['Other income', '#B3BDD3'],
];

export function defaultCategories(): Category[] {
  const make = (type: TxType) => ([name, color]: [string, string]): Category => ({
    id: uid(),
    name,
    color,
    type,
    budget: 0,
  });
  return [...EXPENSE_DEFAULTS.map(make('expense')), ...INCOME_DEFAULTS.map(make('income'))];
}

export function defaultAccounts(): Account[] {
  return ['Checking', 'Credit card', 'Savings'].map((name) => ({ id: uid(), name, kind: 'cash' as const, openingBalance: 0 }));
}

export function emptyData(): AppData {
  return {
    version: 1,
    accounts: defaultAccounts(),
    categories: defaultCategories(),
    transactions: [],
    services: [],
    positions: [],
    notes: [],
    settings: { currency: 'USD', lastBackup: null, livePrices: true, portfolioCurrency: 'USD', theme: 'system' },
    recurringSkips: [],
    members: [],
    settlements: [],
    transfers: [],
    deleted: {},
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Keeps a record's change stamp through normalization. */
const stamp = (o: Record<string, unknown>) => (typeof o.updatedAt === 'number' ? { updatedAt: o.updatedAt } : {});

function readSplit(v: unknown): Split | undefined {
  if (!isObj(v)) return undefined;
  if (v.mode === 'personal') return { mode: 'personal' };
  if (v.mode === 'shares' && isObj(v.shares)) {
    const shares: Record<string, number> = {};
    for (const [k, n] of Object.entries(v.shares)) if (typeof n === 'number' && n >= 0) shares[k] = n;
    return { mode: 'shares', shares };
  }
  if (v.mode === 'equal') return { mode: 'equal', members: Array.isArray(v.members) ? v.members.filter((m): m is string => typeof m === 'string') : [] };
  return undefined;
}

/** Checks and cleans data loaded from storage or a backup file. Throws if it isn't Budget Tracker data. */
export function normalizeData(raw: unknown): AppData {
  if (!isObj(raw) || !Array.isArray(raw.accounts) || !Array.isArray(raw.categories) || !Array.isArray(raw.transactions)) {
    throw new Error('This file is not a Budget Tracker backup.');
  }
  const accounts: Account[] = raw.accounts.filter(isObj).map((a) => ({
    id: str(a.id) || uid(),
    name: str(a.name, 'Account'),
    kind: a.kind === 'investment' ? 'investment' : 'cash',
    openingBalance: num(a.openingBalance),
    ...(readInterest(a.interest) ? { interest: readInterest(a.interest)! } : {}),
    ...stamp(a),
  }));
  if (!accounts.length) accounts.push(...defaultAccounts());
  const categories: Category[] = raw.categories.filter(isObj).map((c) => ({
    id: str(c.id) || uid(),
    name: str(c.name, 'Category'),
    type: c.type === 'income' ? 'income' : 'expense',
    color: /^#[0-9a-f]{6}$/i.test(str(c.color)) ? str(c.color) : CATEGORY_COLORS[0],
    budget: Math.max(0, num(c.budget)),
    ...stamp(c),
  }));
  const transactions: Transaction[] = raw.transactions
    .filter(isObj)
    .filter((t) => ISO_DATE.test(str(t.date)) && num(t.amount, NaN) >= 0)
    .map((t, i) => ({
      id: str(t.id) || uid(),
      date: str(t.date),
      description: str(t.description),
      amount: num(t.amount),
      type: t.type === 'income' ? 'income' : 'expense',
      categoryId: str(t.categoryId),
      accountId: str(t.accountId) || accounts[0].id,
      note: str(t.note),
      // Older data stored only "repeat every month" as a flag.
      repeat: isRepeat(t.repeat) ? { every: t.repeat.every, unit: t.repeat.unit } : t.repeatMonthly === true ? { every: 1, unit: 'month' as const } : null,
      sourceId: typeof t.sourceId === 'string' ? t.sourceId : undefined,
      serviceId: typeof t.serviceId === 'string' ? t.serviceId : undefined,
      ...(typeof t.interestOf === 'string' ? { interestOf: t.interestOf } : {}),
      created: num(t.created, i),
      ...(typeof t.paidBy === 'string' ? { paidBy: t.paidBy } : {}),
      ...(readSplit(t.split) ? { split: readSplit(t.split) } : {}),
      ...stamp(t),
    }));
  // Older data has no services; that's fine.
  const services: Service[] = (Array.isArray(raw.services) ? raw.services : [])
    .filter(isObj)
    .filter((s) => ISO_DATE.test(str(s.startDate)) && num(s.amount, NaN) > 0 && categories.some((c) => c.id === s.categoryId))
    .map((s) => ({
      id: str(s.id) || uid(),
      name: str(s.name, 'Service'),
      amount: num(s.amount),
      categoryId: str(s.categoryId),
      accountId: accounts.some((a) => a.id === s.accountId) ? str(s.accountId) : accounts[0].id,
      frequency: s.frequency === 'yearly' ? 'yearly' : 'monthly',
      startDate: str(s.startDate),
      autoAdd: s.autoAdd !== false,
      ...stamp(s),
    }));
  const positions: Position[] = (Array.isArray(raw.positions) ? raw.positions : [])
    .filter(isObj)
    .filter((p) => str(p.sourceId) && num(p.quantity, NaN) > 0 && accounts.some((a) => a.id === p.accountId))
    .map((p) => ({
      id: str(p.id) || uid(),
      accountId: str(p.accountId),
      assetType: p.assetType === 'stock' ? 'stock' : 'crypto',
      sourceId: str(p.sourceId),
      symbol: str(p.symbol, str(p.sourceId)).toUpperCase(),
      name: str(p.name, str(p.symbol)),
      quantity: num(p.quantity),
      avgPrice: Math.max(0, num(p.avgPrice)),
      ...stamp(p),
    }));
  const notes: Note[] = (Array.isArray(raw.notes) ? raw.notes : []).filter(isObj).map((n) => ({
    id: str(n.id) || uid(),
    title: str(n.title),
    body: str(n.body),
    pinned: n.pinned === true,
    ...(Array.isArray(n.checklist)
      ? {
          checklist: n.checklist
            .filter(isObj)
            .slice(0, 500)
            .map((c) => ({ id: str(c.id) || uid(), text: str(c.text).slice(0, 1000), done: c.done === true })),
        }
      : {}),
    updated: num(n.updated, Date.now()),
    ...stamp(n),
  }));
  const members: Member[] = (Array.isArray(raw.members) ? raw.members : [])
    .filter(isObj)
    .filter((m) => str(m.id))
    .map((m, i) => ({
      id: str(m.id),
      name: str(m.name, 'Member'),
      color: /^#[0-9a-f]{6}$/i.test(str(m.color)) ? str(m.color) : MEMBER_COLORS[i % MEMBER_COLORS.length],
      role: m.role === 'owner' ? 'owner' : 'member',
      ...(typeof m.email === 'string' && m.email ? { email: m.email } : {}),
      status: m.status === 'invited' ? 'invited' : 'active',
      ...(typeof m.uid === 'string' ? { uid: m.uid } : {}),
      ...(typeof m.photo === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(m.photo) && m.photo.length < 200_000 ? { photo: m.photo } : {}),
      ...stamp(m),
    }));
  const settlements: Settlement[] = (Array.isArray(raw.settlements) ? raw.settlements : [])
    .filter(isObj)
    .filter((x) => ISO_DATE.test(str(x.date)) && num(x.amount, NaN) > 0 && str(x.from) && str(x.to))
    .map((x, i) => ({
      id: str(x.id) || uid(),
      date: str(x.date),
      from: str(x.from),
      to: str(x.to),
      amount: num(x.amount),
      note: str(x.note),
      created: num(x.created, i),
      ...stamp(x),
    }));
  const accountIds = new Set(accounts.map((a) => a.id));
  const transfers: Transfer[] = (Array.isArray(raw.transfers) ? raw.transfers : [])
    .filter(isObj)
    .filter((x) => ISO_DATE.test(str(x.date)) && num(x.amount, NaN) > 0 && accountIds.has(str(x.from)) && accountIds.has(str(x.to)) && x.from !== x.to)
    .map((x, i) => ({
      id: str(x.id) || uid(),
      date: str(x.date),
      from: str(x.from),
      to: str(x.to),
      amount: num(x.amount),
      note: str(x.note),
      created: num(x.created, i),
      ...stamp(x),
    }));
  const deleted: Record<string, number> = {};
  if (isObj(raw.deleted)) for (const [k, v] of Object.entries(raw.deleted)) if (typeof v === 'number') deleted[k] = v;
  const s = isObj(raw.settings) ? raw.settings : {};
  return {
    version: 1,
    accounts,
    categories,
    transactions,
    services,
    positions,
    notes,
    settings: {
      currency: /^[A-Z]{3}$/.test(str(s.currency)) ? str(s.currency) : 'USD',
      lastBackup: typeof s.lastBackup === 'string' ? s.lastBackup : null,
      livePrices: s.livePrices !== false,
      portfolioCurrency: /^[A-Z]{3}$/.test(str(s.portfolioCurrency)) ? str(s.portfolioCurrency) : 'USD',
      theme: s.theme === 'light' || s.theme === 'dark' ? s.theme : 'system',
    },
    recurringSkips: Array.isArray(raw.recurringSkips) ? raw.recurringSkips.filter((k): k is string => typeof k === 'string') : [],
    members,
    settlements,
    transfers,
    deleted,
  };
}

function readInterest(v: unknown): AccountInterest | null {
  if (!isObj(v)) return null;
  const rate = num(v.rate);
  if (!(rate > 0 && rate <= 100)) return null;
  return {
    rate,
    payout: v.payout === 'quarterly' || v.payout === 'yearly' ? v.payout : 'monthly',
    since: ISO_DATE.test(str(v.since)) ? str(v.since) : todayISO(),
    tax: Math.min(100, Math.max(0, num(v.tax))),
  };
}

/** Creates the copies of "repeat every month" transactions and due service payments, up to today. */
export function applyRecurring(d: AppData, today = todayISO()): AppData {
  const existing = existingKeys(d);
  const skips = new Set(d.recurringSkips);
  const added: Transaction[] = [];
  let created = Date.now();
  for (const t of d.transactions) {
    if (!t.repeat || t.sourceId) continue;
    for (const date of repeatDates(t.date, t.repeat, today)) {
      const key = occurrenceKey(t.id, date, t.repeat);
      if (existing.has(key) || skips.has(key)) continue;
      existing.add(key);
      added.push({ ...t, id: uid(), date, repeat: null, sourceId: t.id, created: created++ });
    }
  }
  for (const s of d.services) {
    if (!s.autoAdd) continue;
    for (const date of occurrences(s, today)) {
      const key = `${s.id}:${monthOf(date)}`;
      if (existing.has(key) || skips.has(key)) continue;
      added.push({
        id: uid(),
        date,
        description: s.name,
        amount: s.amount,
        type: 'expense',
        categoryId: s.categoryId,
        accountId: s.accountId,
        note: '',
        repeat: null,
        serviceId: s.id,
        created: created++,
      });
    }
  }
  return applyInterest(added.length ? { ...d, transactions: [...d.transactions, ...added] } : d, today);
}

// ---------- selectors ----------

export const byDateDesc = (a: Transaction, b: Transaction) =>
  a.date < b.date ? 1 : a.date > b.date ? -1 : b.created - a.created;

export const inMonth = (d: AppData, month: string) => d.transactions.filter((t) => monthOf(t.date) === month);

export function totals(list: Transaction[]) {
  let income = 0;
  let expense = 0;
  let deposits = 0;
  for (const t of list) {
    if (t.type === 'income') {
      income += t.amount;
      deposits++;
    } else expense += t.amount;
  }
  return { income, expense, net: income - expense, deposits };
}

export function spendByCategory(list: Transaction[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of list) if (t.type === 'expense') m.set(t.categoryId, (m.get(t.categoryId) || 0) + t.amount);
  return m;
}

export function accountBalance(d: AppData, accountId: string, upTo = todayISO()): number {
  const acc = d.accounts.find((a) => a.id === accountId);
  let b = acc ? acc.openingBalance : 0;
  for (const t of d.transactions) {
    if (t.accountId !== accountId || t.date > upTo) continue;
    b += t.type === 'income' ? t.amount : -t.amount;
  }
  for (const x of d.transfers) {
    if (x.date > upTo) continue;
    if (x.from === accountId) b -= x.amount;
    if (x.to === accountId) b += x.amount;
  }
  return b;
}

export function totalBalance(d: AppData, upTo = todayISO()): number {
  return d.accounts.reduce((s, a) => s + accountBalance(d, a.id, upTo), 0);
}

export interface CatInfo {
  name: string;
  color: string;
  missing: boolean;
}

export function categoryLookup(d: AppData): (id: string) => CatInfo {
  const map = new Map(d.categories.map((c) => [c.id, c]));
  return (id) => {
    const c = map.get(id);
    return c ? { name: c.name, color: shade(c.color), missing: false } : { name: 'Uncategorized', color: UNCATEGORIZED_COLOR, missing: true };
  };
}

export function accountName(d: AppData, id: string): string {
  return d.accounts.find((a) => a.id === id)?.name ?? 'Unknown account';
}

export const nextColor = (d: AppData, type: TxType) => {
  const used = new Set(d.categories.filter((c) => c.type === type).map((c) => c.color));
  return CATEGORY_COLORS.find((c) => !used.has(c)) ?? CATEGORY_COLORS[d.categories.length % CATEGORY_COLORS.length];
};
