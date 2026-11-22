import type { AppData, Transaction, TxType } from './types';
import { emptyData, uid } from './data';
import { addMonths, daysInMonth, monthOf, pad, todayISO } from './dates';
import { round2 } from './format';

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BUDGETS: Record<string, number> = {
  Housing: 1450,
  Groceries: 600,
  'Dining out': 350,
  Shopping: 300,
  Utilities: 260,
  Transport: 250,
  Entertainment: 150,
  Health: 120,
  Subscriptions: 60,
};

/** Twelve months of realistic demo data, ending today. */
export function sampleData(today = todayISO()): AppData {
  const d = emptyData();
  d.categories = d.categories.map((c) => (c.type === 'expense' ? { ...c, budget: BUDGETS[c.name] ?? 0 } : c));
  d.accounts = d.accounts.map((a) => ({
    ...a,
    openingBalance: a.name === 'Checking' ? 1840 : a.name === 'Savings' ? 2500 : 0,
  }));

  const R = rng(20261117);
  const between = (lo: number, hi: number) => round2(lo + R() * (hi - lo));
  const int = (lo: number, hi: number) => Math.floor(lo + R() * (hi - lo + 1));
  const pick = <T,>(list: T[]) => list[Math.floor(R() * list.length)];
  const cat = (name: string) => d.categories.find((c) => c.name === name)?.id ?? '';
  const acc = (name: string) => d.accounts.find((a) => a.name === name)?.id ?? d.accounts[0].id;

  const tx: Transaction[] = [];
  let created = 1;
  const current = monthOf(today);

  for (let k = 11; k >= 0; k--) {
    const m = addMonths(current, -k);
    // In the current month, spread random purchases over the days that have passed.
    const dim = daysInMonth(m);
    const last = m === current ? Number(today.slice(8, 10)) : dim;
    const add = (day: number, description: string, category: string, account: string, amount: number, type: TxType = 'expense') => {
      const date = `${m}-${pad(Math.max(1, Math.min(day, dim)))}`;
      if (date > today) return;
      tx.push({
        id: uid(),
        date,
        description,
        amount: round2(amount),
        type,
        categoryId: cat(category),
        accountId: acc(account),
        note: '',
        repeat: null,
        created: created++,
      });
    };

    add(1, 'Salary', 'Salary', 'Checking', 2600, 'income');
    add(15, 'Salary', 'Salary', 'Checking', 2600, 'income');
    add(1, 'Rent', 'Housing', 'Checking', 1450);
    add(28, 'Savings interest', 'Interest', 'Savings', between(7, 14), 'income');
    if (R() < 0.3) add(int(18, 26), 'Freelance project', 'Freelance', 'Checking', between(300, 900), 'income');

    for (let i = int(5, 6); i > 0; i--)
      add(int(1, last), pick(['Greenleaf Market', 'FreshCo', 'Corner Grocer', 'Greenleaf Market']), 'Groceries', 'Checking', between(48, 132));
    for (let i = int(4, 7); i > 0; i--)
      add(int(1, last), pick(['Pasta Bar', 'Noodle House', 'Sunny Café', 'Taco Stand', 'Bistro 21']), 'Dining out', 'Checking', between(22, 78));

    add(14, 'City Transit pass', 'Transport', 'Checking', 45);
    for (let i = int(1, 3); i > 0; i--) add(int(1, last), pick(['Ride share', 'Fuel station']), 'Transport', 'Checking', between(9, 48));

    add(3, 'Phone plan', 'Utilities', 'Checking', 35);
    add(7, 'Internet', 'Utilities', 'Checking', 49);
    add(12, 'Electric bill', 'Utilities', 'Checking', between(78, 128));
    add(20, 'Water', 'Utilities', 'Checking', between(26, 41));

    for (let i = int(2, 4); i > 0; i--)
      add(int(1, last), pick(['Corner Bookshop', 'Hardware store', 'Online order', 'Clothing store']), 'Shopping', 'Checking', between(18, 115));
    for (let i = int(1, 3); i > 0; i--)
      add(int(1, last), pick(['Cinema tickets', 'Concert', 'Bowling', 'Museum']), 'Entertainment', 'Checking', between(12, 48));
    for (let i = int(0, 2); i > 0; i--)
      add(int(1, last), pick(['Pharmacy', 'Dentist co-pay', 'Gym day pass']), 'Health', 'Checking', between(15, 62));
  }

  d.transactions = tx;

  // Subscriptions: their payments are generated automatically when the data is loaded.
  const start = (monthsAgo: number, day: number) => `${addMonths(current, -monthsAgo)}-${pad(day)}`;
  const service = (name: string, amount: number, frequency: 'monthly' | 'yearly', startDate: string) => ({
    id: uid(),
    name,
    amount,
    categoryId: cat('Subscriptions'),
    accountId: acc('Checking'),
    frequency,
    startDate,
    autoAdd: true,
  });
  d.services = [
    service('Video streaming', 15.99, 'monthly', start(11, 5)),
    service('Music streaming', 10.99, 'monthly', start(11, 12)),
    service('Cloud storage', 2.99, 'monthly', start(8, 21)),
    service('Password manager', 36, 'yearly', start(9, 14)),
  ];

  // Savings: 2.5% interest paid monthly, plus a 200 transfer from Checking each month.
  const savings = d.accounts.find((a) => a.name === 'Savings');
  if (savings) {
    savings.interest = { rate: 2.5, payout: 'monthly', since: `${addMonths(current, -11)}-01`, tax: 0 };
    for (let m = 11; m >= 0; m--) {
      const date = start(m, 2);
      if (date <= today) d.transfers.push({ id: uid(), date, from: acc('Checking'), to: savings.id, amount: 200, note: 'Monthly savings', created: Date.now() + m });
    }
  }

  // Investments: a crypto account and a brokerage account with a few holdings (prices load live).
  const crypto = { id: uid(), name: 'Crypto', kind: 'investment' as const, openingBalance: 0 };
  const broker = { id: uid(), name: 'Brokerage', kind: 'investment' as const, openingBalance: 0 };
  d.accounts.push(crypto, broker);
  const pos = (accountId: string, assetType: 'crypto' | 'stock', sourceId: string, symbol: string, name: string, quantity: number) => ({
    id: uid(),
    accountId,
    assetType,
    sourceId,
    symbol,
    name,
    quantity,
    avgPrice: 0,
  });
  d.positions = [
    pos(crypto.id, 'crypto', 'bitcoin', 'BTC', 'Bitcoin', 0.042),
    pos(crypto.id, 'crypto', 'ethereum', 'ETH', 'Ethereum', 0.85),
    pos(crypto.id, 'crypto', 'solana', 'SOL', 'Solana', 12),
    pos(broker.id, 'stock', 'VOO', 'VOO', 'Vanguard S&P 500 ETF', 6),
    pos(broker.id, 'stock', 'AAPL', 'AAPL', 'Apple Inc.', 4),
  ];
  return d;
}
