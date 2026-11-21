import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore } from './store';
import { kvGet, kvSet } from './lib/db';
import { fetchQuotes, fxRate, type Quotes } from './lib/market';

const REFRESH_MS = 2 * 60_000;

interface Market {
  /** Prices in the portfolio currency. */
  quotes: Quotes;
  /** Portfolio currency → app currency, or null until loaded. */
  fx: number | null;
  updatedAt: number | null;
  loading: boolean;
  error: string | null;
  /** Assets the last refresh couldn't price. */
  failed: string[];
  refresh: () => void;
}

const MarketCtx = createContext<Market | null>(null);

interface Cached {
  currency: string;
  appCurrency?: string;
  quotes: Quotes;
  fx?: number | null;
  updatedAt: number;
}

export function MarketProvider({ children }: { children: ReactNode }) {
  const { data } = useStore();
  const { livePrices, portfolioCurrency: currency, currency: appCurrency } = data.settings;
  const [quotes, setQuotes] = useState<Quotes>({});
  const [fx, setFx] = useState<number | null>(currency === appCurrency ? 1 : null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const busy = useRef(false);
  const positionsRef = useRef(data.positions);
  positionsRef.current = data.positions;

  // Which assets need prices; refetch only when this set changes.
  const assetKey = useMemo(
    () => [...new Set(data.positions.map((p) => `${p.assetType}:${p.sourceId}`))].sort().join('|'),
    [data.positions]
  );

  // Currencies changed: drop converted prices, then show last known ones (also offline).
  useEffect(() => {
    setQuotes({});
    setUpdatedAt(null);
    setFx(currency === appCurrency ? 1 : null);
    kvGet('quotes').then((c) => {
      const cached = c as Cached | null;
      if (!cached || cached.currency !== currency) return;
      setQuotes((q) => (Object.keys(q).length ? q : cached.quotes));
      setUpdatedAt((u) => u ?? cached.updatedAt);
      if (cached.appCurrency === appCurrency && cached.fx) setFx((f) => f ?? cached.fx ?? null);
    });
  }, [currency, appCurrency]);

  // A refresh asked for while one is running runs right after it, with the then-current settings.
  const pending = useRef(false);
  const settingsKey = `${currency}|${appCurrency}`;
  const keyRef = useRef(settingsKey);
  keyRef.current = settingsKey;
  const refreshRef = useRef<() => void>(() => {});

  const refresh = useCallback(async () => {
    if (busy.current) {
      pending.current = true;
      return;
    }
    const startedFor = `${currency}|${appCurrency}`;
    const positions = positionsRef.current;
    if (!positions.length) {
      setError(null);
      setFailed([]);
      return;
    }
    busy.current = true;
    setLoading(true);
    try {
      const [r, rate] = await Promise.all([fetchQuotes(positions, currency), fxRate(currency, appCurrency).catch(() => null)]);
      // Currencies changed while this was loading: these prices are for the old ones.
      if (keyRef.current !== startedFor) {
        pending.current = true;
        return;
      }
      const now = Date.now();
      if (rate !== null) setFx(rate);
      setQuotes((old) => {
        const merged = { ...old, ...r.quotes };
        kvSet('quotes', { currency, appCurrency, quotes: merged, fx: rate, updatedAt: now } satisfies Cached).catch(() => {});
        return merged;
      });
      setUpdatedAt(now);
      setFailed(r.failed);
      setError(null);
    } catch (err) {
      if (keyRef.current === startedFor) setError((err as Error).message || 'Could not update prices.');
    } finally {
      busy.current = false;
      setLoading(false);
      if (pending.current) {
        pending.current = false;
        refreshRef.current();
      }
    }
  }, [currency, appCurrency]);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!livePrices || !assetKey) return;
    refresh();
    const t = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(t);
  }, [livePrices, assetKey, refresh]);

  const value = useMemo(() => ({ quotes, fx, updatedAt, loading, error, failed, refresh }), [quotes, fx, updatedAt, loading, error, failed, refresh]);
  return <MarketCtx.Provider value={value}>{children}</MarketCtx.Provider>;
}

export function useMarket(): Market {
  const m = useContext(MarketCtx);
  if (!m) throw new Error('useMarket outside MarketProvider');
  return m;
}
