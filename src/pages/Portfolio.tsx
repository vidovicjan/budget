import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { useUI } from '../ui';
import { useMarket } from '../market';
import { PageHeader } from '../components/common';
import { Icon } from '../components/Icon';
import { Donut, type Slice } from '../components/charts';
import { CATEGORY_COLORS, OTHER_COLOR } from '../lib/data';
import { accountValue, holdings, netWorth, positionDayChange, positionValue, quoteKey } from '../lib/market';
import { foreign, money, moneyIn, pctSigned, priceIn, qty } from '../lib/format';
import type { Position } from '../lib/types';

function timeLabel(ms: number) {
  return new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function Portfolio() {
  const { data } = useStore();
  const ui = useUI();
  const m = useMarket();
  const [active, setActive] = useState<string | null>(null);
  const pc = data.settings.portfolioCurrency;
  const pm = (n: number, sign = false) => moneyIn(n, pc, sign);
  const invest = data.accounts.filter((a) => a.kind === 'investment' || data.positions.some((p) => p.accountId === a.id));
  const all = holdings(data.positions, m.quotes);
  const worth = netWorth(data, m.quotes, m.fx);
  const prevValue = all.value - all.dayChange;
  const pl = all.cost > 0 ? all.costedValue - all.cost : null;

  // One slice per asset (summed across accounts). Colors follow the asset, not its rank.
  const slices: Slice[] = useMemo(() => {
    const order: string[] = [];
    const sums = new Map<string, { label: string; value: number }>();
    for (const p of data.positions) {
      const k = quoteKey(p);
      if (!order.includes(k)) order.push(k);
      const v = positionValue(p, m.quotes) ?? 0;
      const cur = sums.get(k);
      sums.set(k, { label: p.symbol, value: (cur?.value ?? 0) + v });
    }
    const list = order.map((k, i) => ({ key: k, label: sums.get(k)!.label, value: sums.get(k)!.value, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }));
    const sorted = [...list].sort((a, b) => b.value - a.value);
    const top = sorted.slice(0, 7);
    const rest = sorted.slice(7).reduce((s, x) => s + x.value, 0);
    if (rest > 0) top.push({ key: 'other', label: 'Other', value: rest, color: OTHER_COLOR });
    return top.filter((s) => s.value > 0);
  }, [data.positions, m.quotes]);

  const header = (
    <PageHeader
      eyebrow={
        m.loading
          ? 'Updating prices…'
          : m.updatedAt
            ? `Prices updated ${timeLabel(m.updatedAt)} · CoinGecko & Yahoo Finance`
            : 'Live prices from CoinGecko & Yahoo Finance'
      }
      title="Portfolio"
    >
      {data.positions.length > 0 && (
        <button type="button" className="btn btn-secondary" onClick={m.refresh} disabled={m.loading || !data.settings.livePrices}>
          <span className={m.loading ? 'spin' : ''} style={{ display: 'inline-flex' }}>
            <Icon name="refresh" size={16} />
          </span>
          Refresh
        </button>
      )}
      <button type="button" className="btn btn-primary" onClick={() => ui.addPosition()}>
        <Icon name="plus" strokeWidth={2.2} />
        Add position
      </button>
    </PageHeader>
  );

  if (data.positions.length === 0) {
    return (
      <div className="container">
        {header}
        <section className="card welcome" aria-labelledby="pf-welcome">
          <Icon name="trend" size={28} color="#E86F56" />
          <h2 id="pf-welcome">Track your crypto and stocks</h2>
          <p>
            Add the coins, stocks and ETFs you hold, like your spot positions on an exchange, with the quantity and, if you like, your average buy price. Prices
            update automatically every two minutes, so you always see the current value and your profit or loss. Your holdings stay on this device; only the
            coin and ticker names are sent to the price services.
          </p>
          <div className="actions">
            <button type="button" className="btn btn-primary" onClick={() => ui.addPosition()}>
              <Icon name="plus" strokeWidth={2.2} /> Add first position
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="container">
      {header}

      {!data.settings.livePrices && (
        <div className="banner" role="status">
          <Icon name="alert" size={18} /> Live prices are turned off in Settings. Values use the last known prices.
        </div>
      )}
      {m.error && (
        <div className="banner error" role="alert">
          <Icon name="alert" size={18} />
          Couldn't update prices: {m.error}
          {m.updatedAt ? ` Showing prices from ${timeLabel(m.updatedAt)}.` : ''}
        </div>
      )}
      {!m.error && m.failed.length > 0 && (
        <div className="banner" role="status">
          <Icon name="alert" size={18} /> No price found for {m.failed.join(', ')}.
        </div>
      )}

      <section className="kpi-grid" aria-label="Portfolio summary">
        <div className="kpi">
          <span className="kpi-label">Portfolio value</span>
          <span className="kpi-value">{pm(all.value)}</span>
          <span className="kpi-foot">
            {all.count} position{all.count === 1 ? '' : 's'} in {invest.length} account{invest.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Today</span>
          <span className={`kpi-value ${all.dayChange < 0 ? 'neg' : ''}`}>{pm(all.dayChange, true)}</span>
          <span className="kpi-foot">
            {prevValue > 0 && (
              <>
                <Icon name={all.dayChange < 0 ? 'down' : 'up'} size={14} strokeWidth={2.2} />
                {pctSigned((all.dayChange / prevValue) * 100)} since yesterday
              </>
            )}
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Profit / loss</span>
          {pl !== null ? (
            <>
              <span className={`kpi-value ${pl < 0 ? 'neg' : ''}`}>{pm(pl, true)}</span>
              <span className="kpi-foot">
                {pctSigned((pl / all.cost) * 100)} on {pm(all.cost)} invested
              </span>
            </>
          ) : (
            <>
              <span className="kpi-value">—</span>
              <span className="kpi-foot">Add buy prices to see it</span>
            </>
          )}
        </div>
        <div className="kpi dark">
          <span className="kpi-label">Net worth</span>
          <span className="kpi-value">{money(worth)}</span>
          <span className="kpi-foot">
            Cash + investments{pc !== data.settings.currency ? ` · in ${data.settings.currency}` : ''}
          </span>
        </div>
      </section>

      {slices.length > 0 && (
        <section className="card" aria-labelledby="alloc-title">
          <div className="stack">
            <h2 id="alloc-title" className="card-title">
              Allocation
            </h2>
            <span className="sub">Share of portfolio value by asset</span>
          </div>
          <div className="alloc">
            <Donut slices={slices} centerLabel="Invested" active={active} onActive={setActive} format={(n) => moneyIn(n, pc)} />
            <ul className="cat-legend" style={{ flex: '1 1 280px', maxWidth: 440 }}>
              {slices.map((s) => (
                <li key={s.key} className={active === s.key ? 'active' : ''} onMouseEnter={() => setActive(s.key)} onMouseLeave={() => setActive(null)}>
                  <span className="swatch" style={{ background: s.color }} />
                  <span className="name">{s.label}</span>
                  <span className="val">{pm(s.value)}</span>
                  <span className="pct">{all.value > 0 ? Math.round((s.value / all.value) * 100) : 0}%</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {invest.map((acc) => {
        const positions = data.positions.filter((p) => p.accountId === acc.id);
        const v = accountValue(data, acc.id, m.quotes, m.fx);
        return (
          <section key={acc.id} aria-labelledby={`acc-${acc.id}`} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
              <div className="stack">
                <h2 id={`acc-${acc.id}`} className="section-title">
                  {acc.name}
                </h2>
                <span className="sub">
                  {pm(v.holdings.value)} in {positions.length} position{positions.length === 1 ? '' : 's'}
                  {Math.abs(v.cash) > 0.004 && ` · ${money(v.cash)} cash`}
                </span>
              </div>
              <button type="button" className="btn btn-secondary" onClick={() => ui.addPosition(acc.id)}>
                <Icon name="plus" strokeWidth={2.2} /> Add to {acc.name}
              </button>
            </div>
            {positions.length ? (
              <PositionsTable positions={positions} total={all.value} />
            ) : (
              <div className="chart-empty">No positions in this account yet.</div>
            )}
          </section>
        );
      })}

      <p className="hint">
        Prices: crypto from CoinGecko (24-hour change), stocks and ETFs from Yahoo Finance (change since the previous close), converted to{' '}
        {pc} with rates from ExchangeRate-API. Prices can be delayed and are for information only.
      </p>
    </div>
  );
}

function PositionsTable({ positions, total }: { positions: Position[]; total: number }) {
  const ui = useUI();
  const { data } = useStore();
  const { quotes } = useMarket();
  const pc = data.settings.portfolioCurrency;
  const pm = (n: number, sign = false) => moneyIn(n, pc, sign);
  const pp = (n: number) => priceIn(n, pc);
  const rows = [...positions].sort((a, b) => (positionValue(b, quotes) ?? 0) - (positionValue(a, quotes) ?? 0));
  return (
    <div className="table-wrap">
      <table className="data" style={{ minWidth: 880 }}>
        <thead>
          <tr>
            <th scope="col">Asset</th>
            <th scope="col" className="num">
              Quantity
            </th>
            <th scope="col" className="num">
              Price
            </th>
            <th scope="col" className="num">
              Change
            </th>
            <th scope="col" className="num">
              Value
            </th>
            <th scope="col" className="num">
              Avg. buy
            </th>
            <th scope="col" className="num">
              Profit / loss
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const q = quotes[quoteKey(p)];
            const v = positionValue(p, quotes);
            const pl = v !== null && p.avgPrice > 0 ? v - p.avgPrice * p.quantity : null;
            const day = positionDayChange(p, quotes);
            return (
              <tr key={p.id} className="clickable" onClick={() => ui.editPosition(p)}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span className={`asset-badge ${p.assetType}`}>{p.symbol.slice(0, 4)}</span>
                    <span className="tx-main">
                      <button
                        type="button"
                        className="desc-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          ui.editPosition(p);
                        }}
                      >
                        {p.name}
                      </button>
                      <span className="tx-meta">
                        {p.symbol} · {p.assetType === 'crypto' ? 'Crypto' : 'Stock / ETF'}
                        {v !== null && total > 0 && ` · ${Math.round((v / total) * 100)}%`}
                      </span>
                    </span>
                  </div>
                </td>
                <td className="num">{qty(p.quantity)}</td>
                <td className="num">
                  {q ? pp(q.price) : '—'}
                  {q && q.nativeCurrency !== pc && <div className="tx-meta">{foreign(q.native, q.nativeCurrency)}</div>}
                </td>
                <td className="num">
                  {q && q.change !== null ? (
                    <>
                      <span className={q.change < 0 ? 'neg-text' : 'pos-text'}>{pctSigned(q.change)}</span>
                      <div className="tx-meta">{pm(day, true)}</div>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="num" style={{ fontWeight: 600 }}>
                  {v !== null ? pm(v) : '—'}
                </td>
                <td className="num muted">{p.avgPrice > 0 ? pp(p.avgPrice) : '—'}</td>
                <td className="num">
                  {pl !== null ? (
                    <>
                      <span className={pl < 0 ? 'neg-text' : 'pos-text'} style={{ fontWeight: 600 }}>
                        {pm(pl, true)}
                      </span>
                      <div className="tx-meta">{pctSigned((pl / (p.avgPrice * p.quantity)) * 100)}</div>
                    </>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
