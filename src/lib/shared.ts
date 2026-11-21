import type { AppData, Member, Split, Transaction } from './types';
import { round2 } from './format';

/** A shared space has at least two members. */
export const isShared = (d: AppData) => d.members.length >= 2;

/** Member ids an expense is divided between, with each one's amount. */
export function shareOf(t: Transaction, members: Member[]): Record<string, number> {
  const ids = members.map((m) => m.id);
  const split: Split = t.split ?? { mode: 'equal' };
  if (split.mode === 'personal') return t.paidBy ? { [t.paidBy]: t.amount } : {};
  if (split.mode === 'shares' && split.shares) {
    const entries = Object.entries(split.shares).filter(([id, p]) => ids.includes(id) && p > 0);
    const total = entries.reduce((s, [, p]) => s + p, 0);
    if (total > 0) return distribute(t.amount, entries.map(([id, p]) => [id, p / total]));
  }
  const who = split.mode === 'equal' && split.members?.length ? split.members.filter((id) => ids.includes(id)) : ids;
  if (!who.length) return {};
  return distribute(t.amount, who.map((id) => [id, 1 / who.length]));
}

/** Splits an amount by weights so the cents add up exactly. */
function distribute(amount: number, weights: [string, number][]): Record<string, number> {
  const cents = Math.round(amount * 100);
  const parts = weights.map(([id, w]) => ({ id, c: Math.floor(cents * w), frac: cents * w - Math.floor(cents * w) }));
  let left = cents - parts.reduce((s, p) => s + p.c, 0);
  for (const p of [...parts].sort((a, b) => b.frac - a.frac)) {
    if (left <= 0) break;
    p.c++;
    left--;
  }
  return Object.fromEntries(parts.map((p) => [p.id, p.c / 100]));
}

export interface MemberBalance {
  member: Member;
  /** Shared expenses this member paid for. */
  paid: number;
  /** This member's part of all shared expenses. */
  share: number;
  /** Settlements sent minus received. */
  settled: number;
  /** > 0: others owe them; < 0: they owe others. */
  balance: number;
}

export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

export interface SharedSummary {
  balances: MemberBalance[];
  /** Fewest payments that bring everyone to zero. */
  transfers: Transfer[];
  /** Expenses that have no payer set yet (left out of balances). */
  unassigned: number;
  totalShared: number;
}

/** Who paid what, who owes whom. Only expenses count; income isn't split. */
export function summarize(d: AppData, upTo?: string): SharedSummary {
  const ids = new Set(d.members.map((m) => m.id));
  const paid = new Map<string, number>();
  const share = new Map<string, number>();
  const settled = new Map<string, number>();
  let unassigned = 0;
  let totalShared = 0;
  for (const t of d.transactions) {
    if (t.type !== 'expense' || (upTo && t.date > upTo)) continue;
    if (!t.paidBy || !ids.has(t.paidBy)) {
      unassigned++;
      continue;
    }
    if (t.split?.mode === 'personal') continue;
    paid.set(t.paidBy, (paid.get(t.paidBy) ?? 0) + t.amount);
    totalShared += t.amount;
    for (const [id, v] of Object.entries(shareOf(t, d.members))) share.set(id, (share.get(id) ?? 0) + v);
  }
  for (const s of d.settlements) {
    if (upTo && s.date > upTo) continue;
    settled.set(s.from, (settled.get(s.from) ?? 0) + s.amount);
    settled.set(s.to, (settled.get(s.to) ?? 0) - s.amount);
  }
  const balances = d.members.map((member) => {
    const p = round2(paid.get(member.id) ?? 0);
    const sh = round2(share.get(member.id) ?? 0);
    const st = round2(settled.get(member.id) ?? 0);
    return { member, paid: p, share: sh, settled: st, balance: round2(p - sh + st) };
  });
  return { balances, transfers: simplify(balances), unassigned, totalShared: round2(totalShared) };
}

/** Greedy settle-up: the biggest debtor pays the biggest creditor until everyone is even. */
export function simplify(balances: MemberBalance[]): Transfer[] {
  const owe = balances.filter((b) => b.balance < -0.005).map((b) => ({ id: b.member.id, v: -b.balance }));
  const get = balances.filter((b) => b.balance > 0.005).map((b) => ({ id: b.member.id, v: b.balance }));
  owe.sort((a, b) => b.v - a.v);
  get.sort((a, b) => b.v - a.v);
  const out: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < owe.length && j < get.length) {
    const amount = round2(Math.min(owe[i].v, get[j].v));
    if (amount > 0) out.push({ from: owe[i].id, to: get[j].id, amount });
    owe[i].v = round2(owe[i].v - amount);
    get[j].v = round2(get[j].v - amount);
    if (owe[i].v <= 0.005) i++;
    if (get[j].v <= 0.005) j++;
  }
  return out;
}

export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w))
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?';

/** Short label for a split, e.g. "Split equally", "60 / 40", "Only Ana". */
export function splitLabel(t: Transaction, members: Member[]): string {
  const s = t.split ?? { mode: 'equal' };
  const name = (id: string) => members.find((m) => m.id === id)?.name ?? 'someone';
  if (s.mode === 'personal') return t.paidBy ? `${name(t.paidBy)}'s own` : 'Not shared';
  if (s.mode === 'shares' && s.shares) {
    const parts = Object.entries(s.shares).filter(([, p]) => p > 0);
    return parts.map(([, p]) => `${Math.round(p)}`).join(' / ') + ' %';
  }
  if (s.mode === 'equal' && s.members?.length && s.members.length < members.length) return `Equally: ${s.members.map(name).join(', ')}`;
  return 'Split equally';
}
