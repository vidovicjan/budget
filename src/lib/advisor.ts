import type { AppData, Transaction } from './types';
import { addMonths, monthOf, todayISO } from './dates';
import { accountBalance, categoryLookup, inMonth, spendByCategory, totals } from './data';
import { moneyWhole } from './format';
import { monthlyCost } from './services';
import { positionValue, type Quotes } from './market';

/**
 * A rule-based money check-up. Everything runs locally on the user's own data;
 * the rules are common personal-finance guidelines, not personal financial advice.
 */

export type Area = 'spending' | 'saving' | 'investing';
export type Level = 'alert' | 'tip' | 'good';

export interface Advice {
  id: string;
  area: Area;
  level: Level;
  title: string;
  detail: string;
  /** Estimated money that could be kept each month by following the advice (app currency). */
  saving?: number;
  /** Optional rows to show under the advice, e.g. the subscriptions. */
  items?: { label: string; value: number; note?: string }[];
}

export interface Analysis {
  month: string;
  income: number;
  expense: number;
  net: number;
  /** Share of income kept, 0–1; null without income. */
  savingsRate: number | null;
  /** Average expense of up to 3 earlier months with data. */
  avgExpense: number | null;
  baselineMonths: number;
  /** Cash across non-investment accounts today. */
  cash: number;
  /** Months of expenses the cash covers. */
  runwayMonths: number | null;
  /** 0–100. */
  score: number;
  advice: Advice[];
  potentialSaving: number;
  txCount: number;
}

/** Spending people usually can trim (matched by category name). */
const FLEXIBLE = /dining|restaurant|takeaway|take-out|food out|coffee|caf|bar|shopping|clothes|clothing|entertain|fun|hobb|games?|travel|vacation|holiday|beauty|gifts?|alcohol|tobacco|lottery|bett|subscri/i;

const round = (n: number) => Math.round(n * 100) / 100;

interface Ctx {
  quotes: Quotes;
  /** Portfolio currency → app currency. */
  fx: number | null;
}

export function analyze(d: AppData, month: string, { quotes, fx }: Ctx, today = todayISO()): Analysis {
  const cat = categoryLookup(d);
  const tx = inMonth(d, month);
  const t = totals(tx);
  const net = t.income - t.expense;
  const savingsRate = t.income > 0 ? net / t.income : null;
  const spent = spendByCategory(tx);
  const advice: Advice[] = [];

  // Up to 3 earlier months that have any transactions, as the "usual" baseline.
  const baseline: Transaction[][] = [];
  for (let i = 1, m = addMonths(month, -1); i <= 12 && baseline.length < 3; i++, m = addMonths(m, -1)) {
    const list = inMonth(d, m);
    if (list.length) baseline.push(list);
  }
  const avgOf = (fn: (l: Transaction[]) => number) => (baseline.length ? baseline.reduce((s, l) => s + fn(l), 0) / baseline.length : null);
  const avgExpense = avgOf((l) => totals(l).expense);
  const avgIncome = avgOf((l) => totals(l).income);
  const avgByCat = new Map<string, number>();
  for (const l of baseline) for (const [id, v] of spendByCategory(l)) avgByCat.set(id, (avgByCat.get(id) || 0) + v / baseline.length);

  // ---------- saving ----------
  if (t.income > 0 || t.expense > 0) {
    if (net < 0) {
      advice.push({
        id: 'deficit',
        area: 'saving',
        level: 'alert',
        title: `You spent ${fmtPct(t.income ? -net / t.income : 1)} more than you earned`,
        detail:
          'Spending above income eats into savings or adds debt. Start with the biggest flexible categories below and set a budget for each one so the gap closes next month.',
        saving: round(-net),
      });
    } else if (savingsRate !== null && savingsRate < 0.1) {
      advice.push({
        id: 'low-savings',
        area: 'saving',
        level: 'tip',
        title: `You kept ${fmtPct(savingsRate)} of your income`,
        detail:
          'A common target is 20%. Try "pay yourself first": move a fixed amount to savings on payday, before spending, then live on what is left.',
        saving: round(t.income * 0.2 - net),
      });
    } else if (savingsRate !== null && savingsRate < 0.2) {
      advice.push({
        id: 'ok-savings',
        area: 'saving',
        level: 'tip',
        title: `You kept ${fmtPct(savingsRate)} of your income: close to the 20% target`,
        detail: 'Automating a transfer on payday for the missing part usually closes the gap without noticing it.',
        saving: round(t.income * 0.2 - net),
      });
    } else if (savingsRate !== null) {
      advice.push({
        id: 'good-savings',
        area: 'saving',
        level: 'good',
        title: `Great month: you kept ${fmtPct(savingsRate)} of your income`,
        detail: 'That is above the 20% guideline. Make sure the surplus goes somewhere on purpose: an emergency fund first, then investments.',
      });
    }
  }

  if (avgIncome && t.income < avgIncome * 0.85 && avgIncome - t.income > 0) {
    advice.push({
      id: 'income-drop',
      area: 'saving',
      level: 'tip',
      title: `Income was ${fmtPct(1 - t.income / avgIncome)} lower than usual`,
      detail: 'If this was a one-off, keep spending at your usual level rather than borrowing. If it continues, lower your budgets to match the new income.',
    });
  }

  // Emergency fund: cash in everyday accounts vs. monthly spending.
  const cash = d.accounts.filter((a) => a.kind !== 'investment').reduce((s, a) => s + accountBalance(d, a.id, today), 0);
  const monthlyNeed = avgExpense ?? t.expense;
  const runwayMonths = monthlyNeed > 0 ? cash / monthlyNeed : null;
  if (runwayMonths !== null) {
    if (runwayMonths < 3) {
      advice.push({
        id: 'emergency',
        area: 'saving',
        level: runwayMonths < 1 ? 'alert' : 'tip',
        title: `Your cash covers ${runwayMonths < 0.1 ? 'less than a week' : `${runwayMonths.toFixed(1)} months`} of spending`,
        detail: `Aim for an emergency fund of 3–6 months of expenses (about ${moneyWhole(monthlyNeed * 3)} for 3 months) in an easy-to-reach savings account before taking investment risk.`,
      });
    } else if (runwayMonths > 6) {
      advice.push({
        id: 'idle-cash',
        area: 'investing',
        level: 'tip',
        title: `You hold ${runwayMonths.toFixed(1)} months of spending in cash`,
        detail: `Beyond a 6-month emergency fund, cash loses value to inflation. The extra (about ${moneyWhole(cash - monthlyNeed * 6)}) could earn interest in a savings deposit or go into long-term investments.`,
      });
    } else {
      advice.push({
        id: 'emergency-ok',
        area: 'saving',
        level: 'good',
        title: `Emergency fund looks healthy: ${runwayMonths.toFixed(1)} months of spending`,
        detail: 'That is inside the 3–6 month range. New savings can now go toward goals or investments.',
      });
    }
  }

  // ---------- spending ----------
  const over = d.categories
    .filter((c) => c.type === 'expense' && c.budget > 0 && (spent.get(c.id) || 0) > c.budget)
    .map((c) => ({ label: c.name, value: (spent.get(c.id) || 0) - c.budget, note: `budget ${moneyWhole(c.budget)}` }))
    .sort((a, b) => b.value - a.value);
  if (over.length) {
    advice.push({
      id: 'over-budget',
      area: 'spending',
      level: 'alert',
      title: `${over.length} categor${over.length === 1 ? 'y' : 'ies'} went over budget`,
      detail: 'Either the budget is unrealistic (raise it and lower another one) or this spending needs a limit. Check the Budgets page during the month to catch it earlier.',
      saving: round(over.reduce((s, o) => s + o.value, 0)),
      items: over,
    });
  }

  if (baseline.length) {
    const spikes = [...spent.entries()]
      .map(([id, v]) => ({ id, v, avg: avgByCat.get(id) || 0 }))
      .filter((x) => x.v - x.avg > Math.max(t.expense * 0.03, 20) && x.v > x.avg * 1.3)
      .sort((a, b) => b.v - b.avg - (a.v - a.avg))
      .slice(0, 4);
    if (spikes.length) {
      advice.push({
        id: 'spikes',
        area: 'spending',
        level: 'tip',
        title: 'Spending jumped in some categories',
        detail: `Compared with your average of the previous ${baseline.length} month${baseline.length === 1 ? '' : 's'}. If it wasn't planned, getting back to your usual level saves the difference.`,
        saving: round(spikes.reduce((s, x) => s + (x.v - x.avg), 0)),
        items: spikes.map((x) => ({ label: cat(x.id).name, value: x.v - x.avg, note: x.avg > 0 ? `+${Math.round((x.v / x.avg - 1) * 100)}% vs usual` : 'new this month' })),
      });
    }
  }

  const flexible = [...spent.entries()]
    .filter(([id]) => FLEXIBLE.test(cat(id).name) && !/subscri/i.test(cat(id).name))
    .map(([id, v]) => ({ label: cat(id).name, value: v }))
    .sort((a, b) => b.value - a.value);
  const flexTotal = flexible.reduce((s, x) => s + x.value, 0);
  if (t.expense > 0 && flexTotal > t.expense * 0.2) {
    advice.push({
      id: 'flexible',
      area: 'spending',
      level: 'tip',
      title: `${fmtPct(flexTotal / t.expense)} of spending went to things you can easily trim`,
      detail:
        'Cutting these by a fifth rarely hurts: cook a few more meals at home, wait 48 hours before non-essential purchases, and set a fixed monthly "fun money" amount.',
      saving: round(flexTotal * 0.2),
      items: flexible.slice(0, 5),
    });
  }

  // Many small purchases in the same category add up.
  const small = new Map<string, { n: number; sum: number }>();
  const smallLimit = Math.max(t.expense * 0.01, 5);
  for (const x of tx) {
    if (x.type !== 'expense' || x.amount > smallLimit || x.serviceId || x.sourceId) continue;
    const s = small.get(x.categoryId) ?? { n: 0, sum: 0 };
    s.n++;
    s.sum += x.amount;
    small.set(x.categoryId, s);
  }
  const habit = [...small.entries()].filter(([, s]) => s.n >= 8).sort((a, b) => b[1].sum - a[1].sum)[0];
  if (habit) {
    const [id, s] = habit;
    advice.push({
      id: 'small-buys',
      area: 'spending',
      level: 'tip',
      title: `${s.n} small purchases in ${cat(id).name} added up to ${moneyWhole(s.sum)}`,
      detail: 'Small, frequent buys are easy to miss. Halving them is one of the simplest savings; over a year that is 6× this month\'s amount.',
      saving: round(s.sum / 2),
    });
  }

  // Subscriptions and bills.
  const services = d.services.map((s) => ({ s, m: monthlyCost(s) })).sort((a, b) => b.m - a.m);
  const svcMonthly = services.reduce((sum, x) => sum + x.m, 0);
  if (services.length) {
    advice.push({
      id: 'subscriptions',
      area: 'spending',
      level: services.length >= 4 || svcMonthly > t.income * 0.05 ? 'tip' : 'good',
      title: `Subscriptions cost ${moneyWhole(svcMonthly)} a month (${moneyWhole(svcMonthly * 12)} a year)`,
      detail:
        'Go through the list once: cancel what you didn\'t use last month, switch to yearly plans for what you keep (often ~15% cheaper), and share family plans where allowed.',
      saving: services.length >= 2 ? round(services[services.length - 1].m + (services.length >= 4 ? services[services.length - 2].m : 0)) : undefined,
      items: services.slice(0, 6).map((x) => ({ label: x.s.name, value: x.m, note: x.s.frequency === 'yearly' ? 'yearly, per month' : 'monthly' })),
    });
  }

  const big = tx
    .filter((x) => x.type === 'expense' && !x.serviceId && !x.sourceId && x.amount > Math.max(t.expense * 0.15, 1))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);
  if (big.length && !/rent|housing|mortgage/i.test(cat(big[0].categoryId).name)) {
    advice.push({
      id: 'big',
      area: 'spending',
      level: 'tip',
      title: 'A few large purchases shaped this month',
      detail: 'For big one-off costs, a "sinking fund" helps: save a small amount every month for things you know will come (car repairs, gifts, travel) so they don\'t hit one month.',
      items: big.map((x) => ({ label: x.description || cat(x.categoryId).name, value: x.amount, note: cat(x.categoryId).name })),
    });
  }

  // ---------- investing ----------
  const rate = fx ?? (d.settings.portfolioCurrency === d.settings.currency ? 1 : null);
  const priced = d.positions.map((p) => ({ p, v: positionValue(p, quotes) })).filter((x): x is { p: (typeof d.positions)[number]; v: number } => x.v !== null);
  const portfolio = priced.reduce((s, x) => s + x.v, 0);
  if (!d.positions.length) {
    if (runwayMonths !== null && runwayMonths >= 3 && net > 0) {
      advice.push({
        id: 'start-investing',
        area: 'investing',
        level: 'tip',
        title: 'You could start investing your monthly surplus',
        detail:
          'With an emergency fund in place, a fixed monthly amount into a low-cost, broadly diversified index fund or ETF (for example a world or S&P 500 index) is the usual long-term approach. Investing the same amount every month ("dollar-cost averaging") avoids timing the market.',
      });
    }
  } else if (portfolio > 0) {
    const top = [...priced].sort((a, b) => b.v - a.v)[0];
    const share = top.v / portfolio;
    if (priced.length > 1 && share > 0.5) {
      advice.push({
        id: 'concentration',
        area: 'investing',
        level: 'tip',
        title: `${top.p.symbol} is ${fmtPct(share)} of your portfolio`,
        detail: 'A single asset carrying most of the portfolio makes it swing with that one asset. Many investors cap any single position at 10–25% and spread the rest.',
      });
    }
    const crypto = priced.filter((x) => x.p.assetType === 'crypto').reduce((s, x) => s + x.v, 0);
    const worth = rate ? cash + portfolio * rate : null;
    if (worth && worth > 0 && crypto * (rate ?? 0) > worth * 0.3) {
      advice.push({
        id: 'crypto-share',
        area: 'investing',
        level: 'tip',
        title: `Crypto is ${fmtPct((crypto * (rate ?? 0)) / worth)} of your net worth`,
        detail: 'Crypto can drop 50–80% in a downturn. A common rule is to only hold what you could afford to lose, often under 5–10% of net worth, and balance it with broad index funds.',
      });
    }
    const costed = priced.filter((x) => x.p.avgPrice > 0);
    const cost = costed.reduce((s, x) => s + x.p.avgPrice * x.p.quantity, 0);
    const value = costed.reduce((s, x) => s + x.v, 0);
    if (cost > 0) {
      const pl = value / cost - 1;
      advice.push({
        id: 'pl',
        area: 'investing',
        level: pl >= 0 ? 'good' : 'tip',
        title: `Your positions are ${pl >= 0 ? 'up' : 'down'} ${fmtPct(Math.abs(pl))} overall`,
        detail:
          pl >= 0
            ? 'Consider rebalancing if one asset grew far beyond its planned share, rather than letting winners take over the portfolio.'
            : 'Short-term drops are normal. Avoid panic-selling; check whether each position still fits your plan and time horizon.',
      });
    }
    if (d.positions.length > priced.length) {
      advice.push({
        id: 'unpriced',
        area: 'investing',
        level: 'tip',
        title: 'Some positions have no live price yet',
        detail: 'Open the Portfolio page with an internet connection so they are included in this analysis.',
      });
    }
  }

  // ---------- score ----------
  let score = 50;
  if (savingsRate !== null) score += Math.max(-30, Math.min(25, savingsRate * 125));
  else if (t.expense > 0) score -= 20;
  if (runwayMonths !== null) score += Math.min(15, runwayMonths * 5) - 5;
  score -= Math.min(15, over.length * 5);
  score = Math.max(0, Math.min(100, Math.round(score)));

  const order: Record<Level, number> = { alert: 0, tip: 1, good: 2 };
  advice.sort((a, b) => order[a.level] - order[b.level] || (b.saving ?? 0) - (a.saving ?? 0));
  // Over-budget, spikes, flexible and small buys often point at the same money: count only the largest,
  // plus subscriptions (separate spending). Never more than was spent.
  const savingOf = (id: string) => advice.find((x) => x.id === id)?.saving ?? 0;
  const potentialSaving = Math.min(
    t.expense,
    Math.max(savingOf('over-budget'), savingOf('spikes'), savingOf('flexible'), savingOf('small-buys')) + savingOf('subscriptions')
  );

  return {
    month,
    income: t.income,
    expense: t.expense,
    net,
    savingsRate,
    avgExpense,
    baselineMonths: baseline.length,
    cash,
    runwayMonths,
    score,
    advice,
    potentialSaving: round(potentialSaving),
    txCount: tx.length,
  };
}

/** The last month that is fully over, or the current one if there's no earlier data. */
export function defaultAnalysisMonth(d: AppData, today = todayISO()): string {
  const prev = addMonths(monthOf(today), -1);
  return d.transactions.some((t) => monthOf(t.date) === prev) ? prev : monthOf(today);
}

function fmtPct(x: number) {
  const p = x * 100;
  return `${p < 10 && p > -10 ? p.toFixed(1).replace(/\.0$/, '') : Math.round(p)}%`;
}
