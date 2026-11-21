import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { useUI } from '../ui';
import { MonthSwitch, PageHeader, Progress } from '../components/common';
import { Icon } from '../components/Icon';
import { Donut, GroupedColumns, TipRow, type Slice } from '../components/charts';
import { addMonths, daysInMonth, longDate, monthLabel, monthShort, shortDate, todayISO } from '../lib/dates';
import { byDateDesc, categoryLookup, inMonth, OTHER_COLOR, spendByCategory, totalBalance, totals } from '../lib/data';
import { money, moneyWhole, txAmount } from '../lib/format';
import { AccountsCard } from '../components/AccountsCard';

type Range = '6M' | '12M' | 'YTD';

const SERIES = [
  { name: 'Income', color: 'var(--series-ink)' },
  { name: 'Expenses', color: '#E86F56' },
];

export function Overview() {
  const { data } = useStore();
  const ui = useUI();
  const { month } = ui;
  const [range, setRange] = useState<Range>('12M');
  const [activeSlice, setActiveSlice] = useState<string | null>(null);
  const today = todayISO();
  const cat = categoryLookup(data);
  const endOfMonth = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;

  const monthTx = useMemo(() => inMonth(data, month), [data, month]);
  const t = totals(monthTx);
  const prev = totals(inMonth(data, addMonths(month, -1)));
  const change = prev.expense > 0 ? ((t.expense - prev.expense) / prev.expense) * 100 : null;
  const expenseCats = data.categories.filter((c) => c.type === 'expense');
  const totalBudget = expenseCats.reduce((s, c) => s + c.budget, 0);
  const left = totalBudget - t.expense;
  const balanceDate = endOfMonth < today ? endOfMonth : today;
  const balance = totalBalance(data, balanceDate);

  const flow = useMemo(() => {
    const count = range === '6M' ? 6 : range === '12M' ? 12 : Number(month.slice(5, 7));
    return Array.from({ length: count }, (_, i) => {
      const m = addMonths(month, i - count + 1);
      const x = totals(inMonth(data, m));
      return { label: monthShort(m), title: monthLabel(m), values: [x.income, x.expense] };
    });
  }, [data, month, range]);

  const slices: Slice[] = useMemo(() => {
    const spend = [...spendByCategory(monthTx).entries()].sort((a, b) => b[1] - a[1]);
    const top = spend.slice(0, 5).map(([id, value]) => ({ key: id || 'none', label: cat(id).name, value, color: cat(id).color }));
    const rest = spend.slice(5).reduce((s, [, v]) => s + v, 0);
    if (rest > 0) top.push({ key: 'other', label: 'Other', value: rest, color: OTHER_COLOR });
    return top;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthTx, data.categories]);

  const spentBy = spendByCategory(monthTx);
  const budgets = expenseCats
    .filter((c) => c.budget > 0)
    .sort((a, b) => b.budget - a.budget)
    .slice(0, 5)
    .map((c) => ({ c, spent: spentBy.get(c.id) || 0 }));

  const recent = data.transactions.filter((x) => x.date <= endOfMonth && x.date <= today).sort(byDateDesc).slice(0, 5);

  const header = (
    <PageHeader eyebrow={longDate(today)} title="Overview">
      <MonthSwitch month={month} onChange={ui.setMonth} />
      <button type="button" className="btn btn-primary" onClick={() => ui.addTx()}>
        <Icon name="plus" strokeWidth={2.2} />
        Add transaction
      </button>
    </PageHeader>
  );

  if (data.transactions.length === 0) {
    return (
      <div className="container">
        {header}
        <section className="card welcome" aria-labelledby="welcome-title">
          <Icon name="spark" size={28} color="#E86F56" />
          <h2 id="welcome-title">Welcome to Budget Tracker</h2>
          <p>
            Add your first transaction, import a CSV export from your bank, or load sample data to look around. You can set monthly limits for each
            category on the Budgets page.
          </p>
          <div className="actions">
            <button type="button" className="btn btn-primary" onClick={() => ui.addTx()}>
              <Icon name="plus" strokeWidth={2.2} /> Add transaction
            </button>
            <button type="button" className="btn btn-secondary" onClick={ui.importCsv}>
              <Icon name="upload" size={16} /> Import CSV
            </button>
            <button type="button" className="btn btn-secondary" onClick={ui.loadSample}>
              Load sample data
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="container">
      {header}

      <section aria-label="Monthly summary" className="kpi-grid">
        <div className="kpi dark">
          <span className="kpi-label">Total balance</span>
          <span className="kpi-value">{money(balance)}</span>
          <span className="kpi-foot">
            Cash across {data.accounts.length} account{data.accounts.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Income</span>
          <span className="kpi-value">{money(t.income)}</span>
          <span className="kpi-foot">
            {t.deposits} deposit{t.deposits === 1 ? '' : 's'} this month
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Expenses</span>
          <span className="kpi-value">{money(t.expense)}</span>
          <span className="kpi-foot">
            {change === null ? (
              'No spending last month'
            ) : (
              <>
                <Icon name={change <= 0 ? 'down' : 'up'} size={14} strokeWidth={2.2} />
                {Math.abs(change).toFixed(1)}% {change <= 0 ? 'less' : 'more'} than {monthLabel(addMonths(month, -1)).split(' ')[0]}
              </>
            )}
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Left to spend</span>
          {totalBudget > 0 ? (
            <>
              <span className={`kpi-value ${left < 0 ? 'neg' : ''}`}>{money(left)}</span>
              <div className="kpi-foot">
                <div style={{ flex: 1 }}>
                  <Progress value={(t.expense / totalBudget) * 100} over={left < 0} variant="thin" />
                </div>
                <span>
                  {Math.round((t.expense / totalBudget) * 100)}% of {moneyWhole(totalBudget)}
                </span>
              </div>
            </>
          ) : (
            <>
              <span className="kpi-value">—</span>
              <span className="kpi-foot">
                <button type="button" className="link-btn" style={{ minHeight: 0 }} onClick={() => ui.go('budgets')}>
                  Set monthly limits
                </button>
              </span>
            </>
          )}
        </div>
      </section>

      <AccountsCard />

      <div className="row">
        <section className="card grow-2" aria-labelledby="cashflow-title">
          <div className="card-head">
            <div className="stack">
              <h2 id="cashflow-title" className="card-title">
                Cash flow
              </h2>
              <span className="sub">
                Income vs. expenses, {range === 'YTD' ? `${month.slice(0, 4)} to date` : `last ${range === '6M' ? 6 : 12} months`}
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 18 }}>
              <div className="legend">
                {SERIES.map((s) => (
                  <span key={s.name}>
                    <span className="swatch" style={{ background: s.color }} />
                    {s.name}
                  </span>
                ))}
              </div>
              <div className="seg" role="group" aria-label="Time range">
                {(['6M', '12M', 'YTD'] as Range[]).map((r) => (
                  <button type="button" key={r} aria-pressed={range === r} onClick={() => setRange(r)}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <GroupedColumns
            rows={flow}
            series={SERIES}
            height={380}
            title="Cash flow by month"
            extra={(r) => <TipRow label="Net" value={money(r.values[0] - r.values[1], true)} />}
          />
        </section>

        <section className="card grow-1" aria-labelledby="category-title">
          <div className="stack">
            <h2 id="category-title" className="card-title">
              Spending by category
            </h2>
            <span className="sub">{monthLabel(month)}</span>
          </div>
          {slices.length ? (
            <>
              <Donut slices={slices} centerLabel="Spent" active={activeSlice} onActive={setActiveSlice} />
              <ul className="cat-legend">
                {slices.map((s) => (
                  <li key={s.key} className={activeSlice === s.key ? 'active' : ''} onMouseEnter={() => setActiveSlice(s.key)} onMouseLeave={() => setActiveSlice(null)}>
                    <span className="swatch" style={{ background: s.color }} />
                    <span className="name">{s.label}</span>
                    <span className="val">{money(s.value)}</span>
                    <span className="pct">{Math.round((s.value / t.expense) * 100)}%</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="chart-empty">No spending in {monthLabel(month)}.</div>
          )}
        </section>
      </div>

      <div className="row">
        <section className="card half" aria-labelledby="budgets-title" style={{ gap: 22 }}>
          <div className="card-head">
            <div className="stack">
              <h2 id="budgets-title" className="card-title">
                Budgets
              </h2>
              <span className="sub">{totalBudget > 0 ? `${money(t.expense)} of ${money(totalBudget)} spent` : 'No monthly limits set yet'}</span>
            </div>
            <button type="button" className="link-btn" onClick={() => ui.go('budgets')}>
              View all
            </button>
          </div>
          {budgets.length ? (
            <div className="budget-list">
              {budgets.map(({ c, spent }) => {
                const over = spent > c.budget;
                return (
                  <div className="budget-row" key={c.id}>
                    <div className="budget-row-top">
                      <span className="name">{c.name}</span>
                      <span className="of">
                        <strong className={over ? 'over' : ''}>{money(spent)}</strong> / {money(c.budget)}
                      </span>
                    </div>
                    <Progress value={(spent / c.budget) * 100} over={over} />
                    {over && (
                      <span className="over-note">
                        <Icon name="alert" size={14} strokeWidth={2} />
                        Over budget by {money(spent - c.budget)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="chart-empty">
              <div>
                Set a monthly limit for a category to track it here.
                <br />
                <button type="button" className="link-btn" onClick={() => ui.go('budgets')}>
                  Go to Budgets
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="card half" aria-labelledby="recent-title" style={{ gap: 12 }}>
          <div className="card-head" style={{ paddingBottom: 6 }}>
            <div className="stack">
              <h2 id="recent-title" className="card-title">
                Recent transactions
              </h2>
              <span className="sub">Latest {recent.length}</span>
            </div>
            <button type="button" className="link-btn" onClick={() => ui.go('transactions')}>
              View all
            </button>
          </div>
          {recent.length ? (
            <ul className="tx-list">
              {recent.map((x) => (
                <li key={x.id}>
                  <button type="button" className="tx-item" onClick={() => ui.editTx(x)}>
                    <span aria-hidden="true" className={`avatar ${x.type === 'income' ? 'income' : ''}`}>
                      {(x.description.trim()[0] || '?').toUpperCase()}
                    </span>
                    <span className="tx-main">
                      <span className="tx-name">{x.description}</span>
                      <span className="tx-meta">
                        {x.type === 'income' ? 'Income' : cat(x.categoryId).name} · {shortDate(x.date)}
                      </span>
                    </span>
                    <span className="tx-amt">{txAmount(x)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="chart-empty">No transactions yet.</div>
          )}
        </section>
      </div>
    </div>
  );
}
