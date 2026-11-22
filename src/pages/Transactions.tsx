import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { useUI } from '../ui';
import { MonthSwitch, PageHeader, SelectBox } from '../components/common';
import { Icon } from '../components/Icon';
import { DailyArea } from '../components/charts';
import { daysInMonth, monthLabel, monthOf, monthShort, shortDate, todayISO } from '../lib/dates';
import { accountName, byDateDesc, categoryLookup, inMonth, totals, shade } from '../lib/data';
import { Avatar } from '../components/People';
import { money, txAmount } from '../lib/format';
import type { Transaction, Transfer } from '../lib/types';

const PAGE_SIZE = 10;

type Row = { kind: 'tx'; x: Transaction } | { kind: 'tr'; x: Transfer };

export function Transactions() {
  const { data } = useStore();
  const payer = (id?: string) => (id && data.members.length >= 2 ? data.members.find((m) => m.id === id) : undefined);
  const ui = useUI();
  const { month } = ui;
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [account, setAccount] = useState('all');
  const [page, setPage] = useState(1);
  const cat = categoryLookup(data);
  const today = todayISO();

  const monthTx = useMemo(() => inMonth(data, month).sort(byDateDesc), [data, month]);
  const t = totals(monthTx);

  useEffect(() => setPage(1), [query, category, account, month]);

  const monthTr = useMemo(() => data.transfers.filter((x) => monthOf(x.date) === month), [data.transfers, month]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const amountMatch = (n: number) => n.toFixed(2).includes(q.replace(/[^\d.]/g, '') || '\u0000');
    const txRows: Row[] = monthTx
      .filter((x) => {
        if (category === 'transfer') return false;
        if (category === 'none' ? cat(x.categoryId).missing === false : category !== 'all' && x.categoryId !== category) return false;
        if (account !== 'all' && x.accountId !== account) return false;
        if (!q) return true;
        return x.description.toLowerCase().includes(q) || x.note.toLowerCase().includes(q) || amountMatch(x.amount);
      })
      .map((x) => ({ kind: 'tx', x }));
    const trRows: Row[] = monthTr
      .filter((x) => {
        if (category !== 'all' && category !== 'transfer') return false;
        if (account !== 'all' && x.from !== account && x.to !== account) return false;
        if (!q) return true;
        const text = `transfer ${accountName(data, x.from)} ${accountName(data, x.to)} ${x.note}`.toLowerCase();
        return text.includes(q) || amountMatch(x.amount);
      })
      .map((x) => ({ kind: 'tr', x }));
    return [...txRows, ...trRows].sort((a, b) => (a.x.date < b.x.date ? 1 : a.x.date > b.x.date ? -1 : b.x.created - a.x.created));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthTx, monthTr, query, category, account, data.categories, data.accounts]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const shown = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const days = daysInMonth(month);
  const lastDay = monthOf(today) === month ? Number(today.slice(8, 10)) : month < monthOf(today) ? days : 0;
  const daily = Array.from({ length: lastDay }, () => 0);
  for (const x of monthTx) if (x.type === 'expense') {
    const d = Number(x.date.slice(8, 10));
    if (d <= lastDay) daily[d - 1] += x.amount;
  }

  const expenseCats = data.categories.filter((c) => c.type === 'expense');
  const incomeCats = data.categories.filter((c) => c.type === 'income');
  const pageButtons = pageList(current, pages);

  return (
    <div className="container">
      <PageHeader eyebrow={`${monthLabel(month)} · ${monthTx.length} transaction${monthTx.length === 1 ? '' : 's'}`} title="Transactions">
        <MonthSwitch month={month} onChange={ui.setMonth} />
        <button type="button" className="btn btn-secondary" onClick={ui.importCsv}>
          <Icon name="upload" size={16} />
          Import CSV
        </button>
        <button type="button" className="btn btn-primary" onClick={() => ui.addTx()}>
          <Icon name="plus" strokeWidth={2.2} />
          Add transaction
        </button>
      </PageHeader>

      <section aria-label={`Totals for ${monthLabel(month)}`} className="kpi-grid">
        <div className="kpi">
          <span className="kpi-label">Income</span>
          <span className="kpi-value">{money(t.income)}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Expenses</span>
          <span className="kpi-value">{money(t.expense)}</span>
        </div>
        <div className="kpi dark">
          <span className="kpi-label">Net</span>
          <span className="kpi-value">{money(t.net, true)}</span>
        </div>
      </section>

      <section className="card" aria-labelledby="daily-title">
        <div className="card-head">
          <div className="stack">
            <h2 id="daily-title" className="card-title">
              Daily spending
            </h2>
            <span className="sub">
              {lastDay
                ? `${monthShort(month)} 1–${lastDay}, ${month.slice(0, 4)}`
                : `${monthLabel(month)} hasn't started yet`}
            </span>
          </div>
        </div>
        {lastDay ? (
          <DailyArea values={daily} days={days} height={200} dayLabel={(d) => `${monthShort(month)} ${d}`} />
        ) : (
          <div className="chart-empty">Nothing to show yet.</div>
        )}
      </section>

      <section aria-labelledby="list-title" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h2 id="list-title" className="sr-only">
          All transactions
        </h2>
        <div className="filters">
          <div className="search-wrap">
            <label htmlFor="tx-search" className="sr-only">
              Search transactions
            </label>
            <Icon name="search" />
            <input
              id="tx-search"
              className="input sm"
              type="search"
              placeholder="Search description, note or amount"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <label htmlFor="f-category" className="sr-only">
            Category
          </label>
          <SelectBox id="f-category" className="sm" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">All categories</option>
            <optgroup label="Expenses">
              {expenseCats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Income">
              {incomeCats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
            <option value="none">Uncategorized</option>
            <option value="transfer">Transfers between accounts</option>
          </SelectBox>
          <label htmlFor="f-account" className="sr-only">
            Account
          </label>
          <SelectBox id="f-account" className="sm" value={account} onChange={(e) => setAccount(e.target.value)}>
            <option value="all">All accounts</option>
            {data.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </SelectBox>
        </div>

        <div className="table-wrap">
          <table className="data tx-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Description</th>
                <th scope="col">Category</th>
                <th scope="col">Account</th>
                <th scope="col" className="num">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => {
                if (row.kind === 'tr') {
                  const x = row.x;
                  return (
                    <tr key={x.id} className="clickable tx-transfer" onClick={() => ui.editTransfer(x)}>
                      <td className="muted">{shortDate(x.date)}</td>
                      <td>
                        <button
                          type="button"
                          className="desc-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            ui.editTransfer(x);
                          }}
                        >
                          {x.note || 'Transfer'}
                        </button>
                      </td>
                      <td>
                        <span className="cat-chip transfer">
                          <Icon name="swap" size={13} />
                          Transfer
                        </span>
                      </td>
                      <td className="muted">
                        <span className="transfer-route-text">
                          {accountName(data, x.from)}
                          <Icon name="chevR" size={14} />
                          {accountName(data, x.to)}
                        </span>
                      </td>
                      <td className="num transfer-amt">
                        {account === x.from ? money(-x.amount, true) : account === x.to ? money(x.amount, true) : money(x.amount)}
                      </td>
                    </tr>
                  );
                }
                const x = row.x;
                const c = cat(x.categoryId);
                const income = x.type === 'income';
                return (
                  <tr key={x.id} className="clickable" onClick={() => ui.editTx(x)}>
                    <td className="muted">{shortDate(x.date)}</td>
                    <td>
                      <button
                        type="button"
                        className="desc-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          ui.editTx(x);
                        }}
                      >
                        {payer(x.paidBy) && (
                          <span className="tx-payer" title={`Paid by ${payer(x.paidBy)!.name}`}>
                            <Avatar member={payer(x.paidBy)!} size={22} />
                          </span>
                        )}
                        {x.description}
                      </button>
                      {(x.repeat || x.sourceId || x.serviceId) && (
                        <span className="repeat-tag" title="Recurring payment">
                          <Icon name="repeat" size={14} />
                          <span className="sr-only">Recurring payment</span>
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`cat-chip ${income ? 'income' : ''}`}>
                        <span className="dot" style={{ background: income ? '#E86F56' : shade(c.color) }} />
                        {c.name}
                      </span>
                    </td>
                    <td className="muted">{accountName(data, x.accountId)}</td>
                    <td className="num" style={{ fontWeight: income ? 600 : 500 }}>
                      {txAmount(x)}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty">
                    {monthTx.length || monthTr.length ? 'No transactions match your filters.' : `No transactions in ${monthLabel(month)}.`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {rows.length > 0 && (
          <div className="pager">
            <span>
              Showing {(current - 1) * PAGE_SIZE + 1}–{Math.min(current * PAGE_SIZE, rows.length)} of {rows.length}
            </span>
            {pages > 1 && (
              <nav aria-label="Pagination">
                <button type="button" aria-label="Previous page" disabled={current === 1} onClick={() => setPage(current - 1)}>
                  <Icon name="chevL" size={16} strokeWidth={2} />
                </button>
                {pageButtons.map((p, i) =>
                  p === 0 ? (
                    <span key={`gap${i}`} style={{ alignSelf: 'center', padding: '0 4px' }}>
                      …
                    </span>
                  ) : (
                    <button type="button" key={p} aria-current={p === current ? 'page' : undefined} onClick={() => setPage(p)}>
                      {p}
                    </button>
                  )
                )}
                <button type="button" aria-label="Next page" disabled={current === pages} onClick={() => setPage(current + 1)}>
                  <Icon name="chevR" size={16} strokeWidth={2} />
                </button>
              </nav>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

/** Page numbers with 0 as an ellipsis: 1 … 4 5 6 … 12 */
function pageList(current: number, pages: number): number[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, pages, current - 1, current, current + 1].filter((p) => p >= 1 && p <= pages));
  const sorted = [...set].sort((a, b) => a - b);
  const out: number[] = [];
  sorted.forEach((p, i) => {
    if (i && p - sorted[i - 1] > 1) out.push(0);
    out.push(p);
  });
  return out;
}
