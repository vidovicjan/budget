import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { AssetType, Position } from '../lib/types';
import { useStore } from '../store';
import { useMarket } from '../market';
import { Modal, SelectBox } from './common';
import { Icon } from './Icon';
import { uid } from '../lib/data';
import { fetchQuotes, quoteKey, searchAssets, type AssetHit, type Quote } from '../lib/market';
import { currencySymbol, foreign, moneyIn, parseAmount, pctSigned, priceIn } from '../lib/format';

interface Props {
  position: Position | null;
  accountId?: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export function PositionDialog({ position, accountId, onClose, onSaved }: Props) {
  const { data, update } = useStore();
  const market = useMarket();
  const pc = data.settings.portfolioCurrency;
  const investAccounts = data.accounts.filter((a) => a.kind === 'investment');
  const [type, setType] = useState<AssetType>(position?.assetType ?? 'crypto');
  const [asset, setAsset] = useState<AssetHit | null>(
    position ? { type: position.assetType, sourceId: position.sourceId, symbol: position.symbol, name: position.name, detail: '' } : null
  );
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AssetHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [quantity, setQuantity] = useState(position ? String(position.quantity) : '');
  const [avg, setAvg] = useState(position && position.avgPrice > 0 ? String(position.avgPrice) : '');
  const [account, setAccount] = useState(position?.accountId ?? accountId ?? investAccounts[0]?.id ?? 'new');
  const [newAccount, setNewAccount] = useState(type === 'crypto' ? 'Crypto' : 'Brokerage');
  const [quote, setQuote] = useState<Quote | null>(position ? market.quotes[quoteKey(position)] ?? null : null);
  const [submitted, setSubmitted] = useState(false);
  const searchId = useRef(0);

  // Search as you type (debounced).
  useEffect(() => {
    if (asset || query.trim().length < 2) {
      setResults([]);
      setSearchError('');
      return;
    }
    const id = ++searchId.current;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const hits = await searchAssets(type, query);
        if (id === searchId.current) {
          setResults(hits);
          setSearchError(hits.length ? '' : 'Nothing found. Try the ticker, e.g. BTC or AAPL.');
        }
      } catch (err) {
        if (id === searchId.current) setSearchError((err as Error).message);
      } finally {
        if (id === searchId.current) setSearching(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [query, type, asset]);

  // Price preview for the chosen asset.
  useEffect(() => {
    if (!asset) return;
    const known = market.quotes[`${asset.type}:${asset.sourceId}`];
    if (known) {
      setQuote(known);
      return;
    }
    let live = true;
    const probe: Position = { id: 'probe', accountId: '', assetType: asset.type, sourceId: asset.sourceId, symbol: asset.symbol, name: asset.name, quantity: 1, avgPrice: 0 };
    fetchQuotes([probe], pc)
      .then((r) => live && setQuote(r.quotes[quoteKey(probe)] ?? null))
      .catch(() => live && setQuote(null));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset?.sourceId, asset?.type, pc]);

  const q = parseAmount(quantity);
  const a = avg.trim() ? parseAmount(avg) : 0;
  const errors = {
    asset: asset ? '' : 'Search for an asset and pick it from the list.',
    quantity: Number.isFinite(q) && q > 0 ? '' : 'Enter how many units you hold.',
    avg: Number.isFinite(a) && a >= 0 ? '' : 'Enter a valid price, or leave it empty.',
    account: account === 'new' && !newAccount.trim() ? 'Name the new account.' : '',
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const save = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (hasErrors || !asset) return;
    const accId = account === 'new' ? uid() : account;
    const base: Position = {
      id: position?.id ?? uid(),
      accountId: accId,
      assetType: asset.type,
      sourceId: asset.sourceId,
      symbol: asset.symbol,
      name: asset.name,
      quantity: q,
      avgPrice: a,
    };
    let message = position ? 'Position updated' : `${asset.symbol} added`;
    update((d) => {
      const accounts = account === 'new' ? [...d.accounts, { id: accId, name: newAccount.trim(), kind: 'investment' as const, openingBalance: 0 }] : d.accounts;
      if (position) return { ...d, accounts, positions: d.positions.map((p) => (p.id === position.id ? base : p)) };
      // Same asset already in this account: merge into one position with a weighted average price.
      const same = d.positions.find((p) => p.accountId === accId && p.assetType === base.assetType && p.sourceId === base.sourceId);
      if (same) {
        const total = same.quantity + base.quantity;
        const avgPrice = same.avgPrice > 0 && base.avgPrice > 0 ? (same.avgPrice * same.quantity + base.avgPrice * base.quantity) / total : same.avgPrice || base.avgPrice;
        message = `Added to your ${asset.symbol} position`;
        return { ...d, accounts, positions: d.positions.map((p) => (p.id === same.id ? { ...same, quantity: total, avgPrice } : p)) };
      }
      return { ...d, accounts, positions: [...d.positions, base] };
    });
    onSaved(message);
    onClose();
  };

  const remove = () => {
    if (!position || !window.confirm(`Remove your ${position.symbol} position?`)) return;
    update((d) => ({ ...d, positions: d.positions.filter((p) => p.id !== position.id) }));
    onSaved('Position removed');
    onClose();
  };

  const value = quote && Number.isFinite(q) && q > 0 ? q * quote.price : null;
  const pl = value !== null && a > 0 ? value - a * q : null;

  return (
    <Modal title={position ? `Edit ${position.symbol}` : 'Add position'} onClose={onClose} width={560}>
      <form onSubmit={save} noValidate style={{ display: 'contents' }}>
        {!position && (
          <div className="toggle" role="group" aria-label="Asset type">
            {(['crypto', 'stock'] as AssetType[]).map((t) => (
              <button
                type="button"
                key={t}
                aria-pressed={type === t}
                onClick={() => {
                  setType(t);
                  setAsset(null);
                  setResults([]);
                  setQuote(null);
                  if (investAccounts.length === 0) setNewAccount(t === 'crypto' ? 'Crypto' : 'Brokerage');
                }}
              >
                {t === 'crypto' ? 'Crypto' : 'Stock / ETF'}
              </button>
            ))}
          </div>
        )}

        <div className="field">
          <span className="label">Asset</span>
          {asset ? (
            <div className="asset-picked">
              <span className={`asset-badge ${asset.type}`}>{asset.symbol.slice(0, 4)}</span>
              <span className="tx-main">
                <span className="tx-name">
                  {asset.name} <span className="sub">{asset.symbol}</span>
                </span>
                <span className="tx-meta">
                  {quote
                    ? `${priceIn(quote.price, pc)}${quote.nativeCurrency !== pc ? ` (${foreign(quote.native, quote.nativeCurrency)})` : ''}${
                        quote.change !== null ? ` · ${pctSigned(quote.change)} ${asset.type === 'crypto' ? '24h' : 'today'}` : ''
                      }`
                    : 'Loading price…'}
                </span>
              </span>
              {!position && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setAsset(null);
                    setQuote(null);
                  }}
                >
                  Change
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="search-wrap" style={{ flex: 'none' }}>
                <label htmlFor="asset-search" className="sr-only">
                  Search {type === 'crypto' ? 'coins' : 'stocks and ETFs'}
                </label>
                <Icon name="search" />
                <input
                  id="asset-search"
                  data-autofocus
                  className="input"
                  autoComplete="off"
                  placeholder={type === 'crypto' ? 'Search coin, e.g. Bitcoin or SOL' : 'Search name or ticker, e.g. Apple or VOO'}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-invalid={submitted && !!errors.asset}
                />
              </div>
              {searching && <span className="hint">Searching…</span>}
              {searchError && !searching && <span className="hint">{searchError}</span>}
              {results.length > 0 && (
                <ul className="asset-results" aria-label="Search results">
                  {results.map((r) => (
                    <li key={r.sourceId}>
                      <button
                        type="button"
                        onClick={() => {
                          setAsset(r);
                          setResults([]);
                        }}
                      >
                        <span className={`asset-badge ${r.type}`}>{r.symbol.slice(0, 4)}</span>
                        <span className="tx-main">
                          <span className="tx-name">{r.name}</span>
                          <span className="tx-meta">
                            {r.symbol} · {r.detail}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {submitted && errors.asset && <span className="error-text">{errors.asset}</span>}
            </>
          )}
        </div>

        <div className="two">
          <div className="field">
            <label htmlFor="pos-qty">Quantity</label>
            <input
              id="pos-qty"
              className="input"
              inputMode="decimal"
              placeholder={type === 'crypto' ? 'e.g. 0.25' : 'e.g. 10'}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              aria-invalid={submitted && !!errors.quantity}
            />
            {submitted && errors.quantity && <span className="error-text">{errors.quantity}</span>}
          </div>
          <div className="field">
            <label htmlFor="pos-avg">
              Avg. buy price <span className="opt">(optional)</span>
            </label>
            <div
              className={`amount-input small ${submitted && errors.avg ? 'invalid' : ''}`}
              onClick={(e) => (e.currentTarget.querySelector('input') as HTMLInputElement).focus()}
            >
              <span aria-hidden="true">{currencySymbol(pc)}</span>
              <input
                id="pos-avg"
                inputMode="decimal"
                placeholder={`per unit, in ${pc}`}
                value={avg}
                onChange={(e) => setAvg(e.target.value)}
                aria-invalid={submitted && !!errors.avg}
              />
            </div>
            {submitted && errors.avg && <span className="error-text">{errors.avg}</span>}
          </div>
        </div>

        <div className="field">
          <label htmlFor="pos-account">Account</label>
          <SelectBox id="pos-account" value={account} onChange={(e) => setAccount(e.target.value)}>
            {investAccounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name}
              </option>
            ))}
            <option value="new">+ New investment account…</option>
          </SelectBox>
          {account === 'new' && (
            <>
              <label htmlFor="pos-new-account" className="sr-only">
                New account name
              </label>
              <input
                id="pos-new-account"
                className="input"
                placeholder="Account name, e.g. Crypto or Broker"
                value={newAccount}
                maxLength={40}
                onChange={(e) => setNewAccount(e.target.value)}
                aria-invalid={submitted && !!errors.account}
              />
              {submitted && errors.account && <span className="error-text">{errors.account}</span>}
            </>
          )}
        </div>

        {value !== null && (
          <div className="pos-preview">
            <div className="stack">
              <span className="sub">Current value</span>
              <strong>{moneyIn(value, pc)}</strong>
            </div>
            {pl !== null && (
              <div className="stack" style={{ textAlign: 'right' }}>
                <span className="sub">Profit / loss</span>
                <strong className={pl < 0 ? 'neg-text' : 'pos-text'}>
                  {moneyIn(pl, pc, true)} ({pctSigned((pl / (a * q)) * 100)})
                </strong>
              </div>
            )}
          </div>
        )}

        <div className="modal-foot">
          {position && (
            <button type="button" className="btn btn-danger btn-lg" onClick={remove}>
              <Icon name="trash" size={16} /> Remove
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn btn-secondary btn-lg" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary btn-lg">
            {position ? 'Save' : 'Add position'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
