import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { PageHeader } from '../components/common';
import { Icon } from '../components/Icon';
import { GroupedColumns, TipRow } from '../components/charts';
import { monthLabel, monthName, monthOf, monthShort, todayISO } from '../lib/dates';
import { categoryLookup, inMonth, spendByCategory, totals, shade } from '../lib/data';
import { money } from '../lib/format';
import { Progress } from '../components/common';

const SERIES = [
  { name: 'Income', color: 'var(--series-ink)' },
  { name: 'Expenses', color: '#E86F56' },
];

export function Reports() {
  const { data } = useStore();
  const thisMonth = monthOf(todayISO());
  const thisYear = Number(thisMonth.slice(0, 4));
  const years = useMemo(() => {
    const ys = new Set(data.transactions.map((t) => Number(t.date.slice(0, 4))));
    ys.add(thisYear);
    return [...ys].sort((a, b) => a - b);
  }, [data.transactions, thisYear]);
  const [year, setYear] = useState(thisYear);
  const cat = categoryLookup(data);

  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`).filter((m) => m <= thisMonth);
  const perMonth = months.map((m) => ({ m, ...totals(inMonth(data, m)) }));
  const yearTx = data.transactions.filter((t) => t.date.startsWith(`${year}-`));
  const yt = totals(yearTx);
  const rate = yt.income > 0 ? (yt.net / yt.income) * 100 : null;
  const elapsed = Math.max(1, months.length);

  const byCat = [...spendByCategory(yearTx).entries()].sort((a, b) => b[1] - a[1]);
  const topCat = byCat[0]?.[1] ?? 0;

  const idx = years.indexOf(year);

  return (
    <div className="container">
      <PageHeader eyebrow={`${year} · ${yearTx.length} transactions`} title="Reports">
        <div className="month-switch">
          <button type="button" aria-label="Previous year" disabled={idx <= 0} onClick={() => setYear(years[idx - 1])}>
            <Icon name="chevL" strokeWidth={2} />
          </button>
          <span aria-live="polite" style={{ minWidth: 80 }}>
            {year}
          </span>
          <button type="button" aria-label="Next year" disabled={idx >= years.length - 1} onClick={() => setYear(years[idx + 1])}>
            <Icon name="chevR" strokeWidth={2} />
          </button>
        </div>
      </PageHeader>

      <section className="kpi-grid" aria-label={`${year} summary`}>
        <div className="kpi">
          <span className="kpi-label">Income</span>
          <span className="kpi-value">{money(yt.income)}</span>
          <span className="kpi-foot">{money(yt.income / elapsed)} per month</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Expenses</span>
          <span className="kpi-value">{money(yt.expense)}</span>
          <span className="kpi-foot">{money(yt.expense / elapsed)} per month</span>
        </div>
        <div className="kpi dark">
          <span className="kpi-label">Net saved</span>
          <span className="kpi-value">{money(yt.net, true)}</span>
          <span className="kpi-foot">{year === thisYear ? 'Year to date' : `Full year ${year}`}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Savings rate</span>
          <span className={`kpi-value ${rate !== null && rate < 0 ? 'neg' : ''}`}>{rate === null ? '—' : `${rate.toFixed(1)}%`}</span>
          <span className="kpi-foot">Share of income not spent</span>
        </div>
      </section>

      <section className="card" aria-labelledby="monthly-title">
        <div className="card-head">
          <div className="stack">
            <h2 id="monthly-title" className="card-title">
              Income and expenses by month
            </h2>
            <span className="sub">{year}</span>
          </div>
          <div className="legend">
            {SERIES.map((s) => (
              <span key={s.name}>
                <span className="swatch" style={{ background: s.color }} />
                {s.name}
              </span>
            ))}
          </div>
        </div>
        {months.length ? (
          <GroupedColumns
            rows={perMonth.map((p) => ({ label: monthShort(p.m), title: monthLabel(p.m), values: [p.income, p.expense] }))}
            series={SERIES}
            height={300}
            title={`Income and expenses by month, ${year}`}
            extra={(r) => <TipRow label="Net" value={money(r.values[0] - r.values[1], true)} />}
          />
        ) : (
          <div className="chart-empty">No months to show yet.</div>
        )}
      </section>

      <div className="row">
        <section className="card half" aria-labelledby="table-title">
          <h2 id="table-title" className="card-title">
            Monthly breakdown
          </h2>
          <div style={{ overflowX: 'auto', margin: '0 -24px -24px' }}>
            <table className="data month-table" style={{ minWidth: 460 }}>
              <thead>
                <tr>
                  <th scope="col">Month</th>
                  <th scope="col" className="num">
                    Income
                  </th>
                  <th scope="col" className="num">
                    Expenses
                  </th>
                  <th scope="col" className="num">
                    Net
                  </th>
                </tr>
              </thead>
              <tbody>
                {perMonth.map((p) => (
                  <tr key={p.m}>
                    <td>{monthName(p.m)}</td>
                    <td className="num">{money(p.income)}</td>
                    <td className="num">{money(p.expense)}</td>
                    <td className="num" style={{ fontWeight: 600, color: p.net < 0 ? 'var(--coral-dark)' : undefined }}>
                      {money(p.net, true)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td className="num">{money(yt.income)}</td>
                  <td className="num">{money(yt.expense)}</td>
                  <td className="num">{money(yt.net, true)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <section className="card half" aria-labelledby="cat-year-title">
          <div className="stack">
            <h2 id="cat-year-title" className="card-title">
              Spending by category
            </h2>
            <span className="sub">Total for {year} and average per month</span>
          </div>
          {byCat.length ? (
            <div className="budget-list" style={{ gap: 16 }}>
              {byCat.map(([id, v]) => {
                const c = cat(id);
                return (
                  <div className="budget-row" key={id || 'none'}>
                    <div className="budget-row-top">
                      <span className="name" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="swatch" style={{ background: shade(c.color) }} />
                        {c.name}
                      </span>
                      <span className="of">
                        <strong>{money(v)}</strong> · {money(v / elapsed)}/mo · {Math.round((v / yt.expense) * 100)}%
                      </span>
                    </div>
                    <Progress value={(v / topCat) * 100} variant="thin" />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="chart-empty">No spending in {year}.</div>
          )}
        </section>
      </div>
    </div>
  );
}
