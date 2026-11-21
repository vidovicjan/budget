import type { Transaction } from './types';

let currency = 'USD';
let fmt = make(currency, 2);
let whole = make(currency, 0);

function make(c: string, digits: number): Intl.NumberFormat {
  const opts: Intl.NumberFormatOptions = {
    style: 'currency',
    currencyDisplay: 'narrowSymbol',
    currency: c,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  };
  try {
    return new Intl.NumberFormat('en-US', opts);
  } catch {
    return new Intl.NumberFormat('en-US', { ...opts, currency: 'USD' });
  }
}

export function setCurrency(c: string) {
  if (c === currency) return;
  currency = c;
  fmt = make(c, 2);
  whole = make(c, 0);
}

const MINUS = '−';

/** $1,234.50 — negative values get a real minus sign. With `sign`, positives get "+". */
export function money(n: number, sign = false): string {
  const s = fmt.format(Math.abs(n));
  if (n < 0) return MINUS + s;
  return sign && n > 0 ? '+' + s : s;
}

/** $3,146 */
export function moneyWhole(n: number): string {
  const s = whole.format(Math.abs(n));
  return n < 0 ? MINUS + s : s;
}

/** Axis ticks: full under 10,000, compact above (10K, 20K). */
export function moneyAxis(n: number): string {
  if (Math.abs(n) < 10000) return moneyWhole(n);
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currencyDisplay: 'narrowSymbol',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(n);
  } catch {
    return moneyWhole(n);
  }
}

/** Signed amount for a transaction: −$84.20 / +$2,600.00 */
export const txAmount = (t: Transaction) => money(t.type === 'income' ? t.amount : -t.amount, true);

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function parseAmount(raw: string): number {
  let s = raw.trim().replace(/−/g, '-');
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[^\d.,-]/g, '');
  // "1.234,56" (European) → "1234.56"; "1,234.56" → "1234.56"
  if (/,\d{1,2}$/.test(s) && (s.match(/,/g) || []).length === 1) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    s = s.replace(/,/g, '');
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return NaN;
  return negative ? -Math.abs(n) : n;
}

export const CURRENCIES = [
  ['USD', 'US dollar'],
  ['EUR', 'Euro'],
  ['GBP', 'British pound'],
  ['CHF', 'Swiss franc'],
  ['CAD', 'Canadian dollar'],
  ['AUD', 'Australian dollar'],
  ['JPY', 'Japanese yen'],
  ['SEK', 'Swedish krona'],
  ['NOK', 'Norwegian krone'],
  ['DKK', 'Danish krone'],
  ['PLN', 'Polish złoty'],
  ['CZK', 'Czech koruna'],
  ['HUF', 'Hungarian forint'],
  ['RSD', 'Serbian dinar'],
  ['BAM', 'Bosnia-Herzegovina mark'],
] as const;

/** Unit price: small prices (e.g. 0.000123 for some coins) keep their significant digits. */
export function price(n: number): string {
  if (n === 0 || Math.abs(n) >= 1) return money(n);
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currencyDisplay: 'narrowSymbol',
      currency,
      maximumSignificantDigits: 4,
    }).format(n);
  } catch {
    return money(n);
  }
}

/** Quantity of an asset: up to 8 decimals, no trailing zeros. */
export const qty = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 }).format(n);

/** +2.4% / −1.1% */
export const pctSigned = (n: number) => `${n > 0 ? '+' : n < 0 ? MINUS : ''}${Math.abs(n).toFixed(Math.abs(n) < 10 ? 2 : 1)}%`;

/** Amount in a foreign currency, e.g. the native quote "$62,606.00" or "€98.40". */
export function foreign(n: number, cur: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currencyDisplay: 'narrowSymbol',
      currency: cur,
      maximumSignificantDigits: Math.abs(n) < 1 ? 4 : undefined,
      minimumFractionDigits: Math.abs(n) < 1 ? undefined : 2,
      maximumFractionDigits: Math.abs(n) < 1 ? undefined : 2,
    }).format(n);
  } catch {
    return `${n} ${cur}`;
  }
}

/** Amount in a specific currency (e.g. the portfolio currency): $1,234.50, with "+"/"−" when `sign`. */
export function moneyIn(n: number, cur: string, sign = false): string {
  let s: string;
  try {
    s = new Intl.NumberFormat('en-US', { style: 'currency', currencyDisplay: 'narrowSymbol', currency: cur, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(n));
  } catch {
    s = `${Math.abs(n).toFixed(2)} ${cur}`;
  }
  if (n < 0 && Math.abs(n) >= 0.005) return MINUS + s;
  return sign && n >= 0.005 ? '+' + s : s;
}

/** Unit price in a specific currency; tiny prices keep 4 significant digits. */
export const priceIn = (n: number, cur: string) => (n !== 0 && Math.abs(n) < 1 ? foreign(n, cur) : moneyIn(n, cur));

/** "$" for USD, "KM" for BAM. */
export function currencySymbol(cur: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, currencyDisplay: 'narrowSymbol' }).formatToParts(0).find((p) => p.type === 'currency')?.value ?? cur;
  } catch {
    return cur;
  }
}
