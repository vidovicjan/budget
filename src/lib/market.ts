import type { AppData, AssetType, Position } from './types';
import { accountBalance } from './data';

/**
 * Free, key-less price sources:
 *  - CoinGecko public API: crypto prices + search      https://www.coingecko.com/en/api
 *  - Yahoo Finance (unofficial): stock / ETF prices + search
 *  - ExchangeRate-API open access: currency conversion  https://www.exchangerate-api.com
 * In the desktop app requests go through the main process (see electron/main.cjs).
 */

export interface AssetHit {
  type: AssetType;
  sourceId: string;
  symbol: string;
  name: string;
  detail: string;
}

export interface Quote {
  /** Price per unit in the portfolio currency. */
  price: number;
  /** Price per unit as quoted by the source. */
  native: number;
  nativeCurrency: string;
  /** Percent change over the last 24 h (crypto) or since the previous close (stocks). */
  change: number | null;
  at: number;
}

export type Quotes = Record<string, Quote>;

export const quoteKey = (p: Pick<Position, 'assetType' | 'sourceId'>) => `${p.assetType}:${p.sourceId}`;

async function directFetch<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Price service answered ${res.status}.`);
  return res.json();
}

async function getJson<T = any>(url: string): Promise<T> {
  if (window.desktop?.fetchJson) {
    try {
      return (await window.desktop.fetchJson(url)) as T;
    } catch (err) {
      const msg = String((err as Error).message);
      // The window was updated but the app's main process is still the old version.
      if (msg.includes('No handler registered')) {
        try {
          return await directFetch<T>(url);
        } catch {
          throw new Error('Close and reopen Budget Tracker to finish updating, then live prices will work.');
        }
      }
      // Strip Electron's "Error invoking remote method 'fetch-json': Error:" prefix.
      throw new Error(msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
    }
  }
  return directFetch<T>(url);
}

export async function searchAssets(type: AssetType, query: string): Promise<AssetHit[]> {
  const q = encodeURIComponent(query.trim());
  if (type === 'crypto') {
    const j = await getJson<{ coins?: any[] }>(`https://api.coingecko.com/api/v3/search?query=${q}`);
    return (j.coins ?? []).slice(0, 8).map((c) => ({
      type,
      sourceId: String(c.id),
      symbol: String(c.symbol ?? c.id).toUpperCase(),
      name: String(c.name ?? c.id),
      detail: c.market_cap_rank ? `#${c.market_cap_rank} by market cap` : 'Crypto',
    }));
  }
  const j = await getJson<{ quotes?: any[] }>(`https://query1.finance.yahoo.com/v1/finance/search?q=${q}&quotesCount=10&newsCount=0`);
  return (j.quotes ?? [])
    .filter((x) => x.symbol && ['EQUITY', 'ETF', 'MUTUALFUND'].includes(x.quoteType))
    .slice(0, 8)
    .map((x) => ({
      type,
      sourceId: String(x.symbol),
      symbol: String(x.symbol),
      name: String(x.longname || x.shortname || x.symbol),
      detail: [x.typeDisp || x.quoteType, x.exchDisp || x.exchange].filter(Boolean).join(' · '),
    }));
}

// ---------- exchange rates (units per 1 USD), cached for 6 hours ----------

let rateCache: { rates: Record<string, number>; at: number } | null = null;

async function usdRates(): Promise<Record<string, number>> {
  if (rateCache && Date.now() - rateCache.at < 6 * 3600_000) return rateCache.rates;
  const j = await getJson<{ result?: string; rates?: Record<string, number> }>('https://open.er-api.com/v6/latest/USD');
  if (j.result !== 'success' || !j.rates) throw new Error('Could not load exchange rates.');
  rateCache = { rates: j.rates, at: Date.now() };
  return j.rates;
}

/** Some exchanges quote in minor units (London in pence). */
function normalizeCurrency(price: number, currency: string): [number, string] {
  if (currency === 'GBp' || currency === 'GBX') return [price / 100, 'GBP'];
  if (currency === 'ZAc') return [price / 100, 'ZAR'];
  if (currency === 'ILA') return [price / 100, 'ILS'];
  return [price, currency.toUpperCase()];
}

/** How many `to` one unit of `from` is worth. */
export async function fxRate(from: string, to: string): Promise<number> {
  if (from === to) return 1;
  const rates = await usdRates();
  if (!rates[from] || !rates[to]) throw new Error(`No exchange rate for ${rates[from] ? to : from}.`);
  return rates[to] / rates[from];
}

export interface QuoteResult {
  quotes: Quotes;
  failed: string[];
}

/** Fetches current prices for every distinct asset, converted to `currency`. */
export async function fetchQuotes(positions: Position[], currency: string): Promise<QuoteResult> {
  const quotes: Quotes = {};
  const failed: string[] = [];
  if (!positions.length) return { quotes, failed };
  const rates = await usdRates();
  const to = rates[currency];
  if (!to) throw new Error(`No exchange rate available for ${currency}.`);
  const convert = (v: number, from: string) => {
    const f = rates[from];
    if (!f) throw new Error(`No exchange rate for ${from}.`);
    return (v / f) * to;
  };
  const now = Date.now();

  const coins = [...new Set(positions.filter((p) => p.assetType === 'crypto').map((p) => p.sourceId))];
  const stocks = [...new Set(positions.filter((p) => p.assetType === 'stock').map((p) => p.sourceId))];

  const tasks: Promise<void>[] = [];
  if (coins.length) {
    tasks.push(
      getJson<Record<string, { usd?: number; usd_24h_change?: number }>>(
        `https://api.coingecko.com/api/v3/simple/price?ids=${coins.map(encodeURIComponent).join(',')}&vs_currencies=usd&include_24hr_change=true`
      ).then(
        (j) => {
          for (const id of coins) {
            const usd = j[id]?.usd;
            if (typeof usd !== 'number') {
              failed.push(id);
              continue;
            }
            const ch = j[id]?.usd_24h_change;
            quotes[`crypto:${id}`] = { price: convert(usd, 'USD'), native: usd, nativeCurrency: 'USD', change: typeof ch === 'number' ? ch : null, at: now };
          }
        },
        () => {
          failed.push(...coins);
        }
      )
    );
  }
  for (const sym of stocks) {
    tasks.push(
      getJson<any>(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=1d`).then(
        (j) => {
          const meta = j?.chart?.result?.[0]?.meta;
          if (!meta || typeof meta.regularMarketPrice !== 'number') {
            failed.push(sym);
            return;
          }
          const [native, cur] = normalizeCurrency(meta.regularMarketPrice, String(meta.currency || 'USD'));
          const prev = typeof meta.chartPreviousClose === 'number' ? normalizeCurrency(meta.chartPreviousClose, String(meta.currency || 'USD'))[0] : null;
          const change =
            typeof meta.regularMarketChangePercent === 'number' ? meta.regularMarketChangePercent : prev ? (native / prev - 1) * 100 : null;
          try {
            quotes[`stock:${sym}`] = { price: convert(native, cur), native, nativeCurrency: cur, change, at: now };
          } catch {
            failed.push(sym);
          }
        },
        () => {
          failed.push(sym);
        }
      )
    );
  }
  await Promise.all(tasks);
  if (failed.length === coins.length + stocks.length) throw new Error('Could not load any prices. Check your internet connection.');
  return { quotes, failed };
}

// ---------- valuation ----------

export function positionValue(p: Position, quotes: Quotes): number | null {
  const q = quotes[quoteKey(p)];
  return q ? p.quantity * q.price : null;
}

/** Money gained or lost over the quote's change period. */
export function positionDayChange(p: Position, quotes: Quotes): number {
  const q = quotes[quoteKey(p)];
  if (!q || q.change === null) return 0;
  const v = p.quantity * q.price;
  return v - v / (1 + q.change / 100);
}

export interface Holdings {
  value: number;
  dayChange: number;
  cost: number;
  /** Value of positions that have a buy price (for P/L). */
  costedValue: number;
  missing: number;
  count: number;
}

export function holdings(positions: Position[], quotes: Quotes): Holdings {
  const h: Holdings = { value: 0, dayChange: 0, cost: 0, costedValue: 0, missing: 0, count: positions.length };
  for (const p of positions) {
    const v = positionValue(p, quotes);
    if (v === null) {
      h.missing++;
      continue;
    }
    h.value += v;
    h.dayChange += positionDayChange(p, quotes);
    if (p.avgPrice > 0) {
      h.cost += p.avgPrice * p.quantity;
      h.costedValue += v;
    }
  }
  return h;
}

/**
 * Cash (opening balance + transactions, app currency) plus the market value of its positions.
 * `holdings` is in the portfolio currency; `total` is in the app currency, converted with `fx`
 * (portfolio → app currency). Without a rate yet, positions are left out of `total`.
 */
export function accountValue(d: AppData, accountId: string, quotes: Quotes, fx: number | null) {
  const cash = accountBalance(d, accountId);
  const h = holdings(
    d.positions.filter((p) => p.accountId === accountId),
    quotes
  );
  const rate = fx ?? (d.settings.portfolioCurrency === d.settings.currency ? 1 : 0);
  return { cash, holdings: h, holdingsApp: h.value * rate, dayChangeApp: h.dayChange * rate, total: cash + h.value * rate };
}

export function netWorth(d: AppData, quotes: Quotes, fx: number | null) {
  return d.accounts.reduce((s, a) => s + accountValue(d, a.id, quotes, fx).total, 0);
}
