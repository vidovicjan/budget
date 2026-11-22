import type { Category } from '../lib/types';
import { useStore } from '../store';
import { useUI } from '../ui';
import { MonthSwitch, PageHeader, Progress } from '../components/common';
import { Icon } from '../components/Icon';
import { BudgetBars } from '../components/charts';
import { daysInMonth, mediumDate, monthLabel, monthOf, monthShort, todayISO } from '../lib/dates';
import { accountName, categoryLookup, inMonth, spendByCategory, totals, shade } from '../lib/data';
import { money } from '../lib/format';
import { daysBetween, dueLabel, monthlyCost, nextPayment, scheduleLabel } from '../lib/services';
import { confirmDialog } from '../components/Confirm';

const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export function Budgets() {
  const { data, update } = useStore();
  const ui = useUI();
  const { month } = ui;
  const today = todayISO();
  const thisMonth = monthOf(today);
  const days = daysInMonth(month);
  const day = month === thisMonth ? Number(today.slice(8, 10)) : month < thisMonth ? days : 0;
  const daysLeft = days - day + (month === thisMonth ? 1 : 0); // today still counts

  const monthTx = inMonth(data, month);
  const spentBy = spendByCategory(monthTx);
  const t = totals(monthTx);
  const cats = data.categories.filter((c) => c.type === 'expense');
  const totalBudget = cats.reduce((s, c) => s + c.budget, 0);
  const remaining = totalBudget - t.expense;
  const overCount = cats.filter((c) => c.budget > 0 && (spentBy.get(c.id) || 0) > c.budget).length;
  const uncategorized = [...spentBy.entries()].filter(([id]) => !cats.some((c) => c.id === id)).reduce((s, [, v]) => s + v, 0);

  const eyebrow =
    month === thisMonth
      ? `${monthLabel(month)} · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left`
      : month < thisMonth
        ? `${monthLabel(month)} · closed`
        : `${monthLabel(month)} · upcoming`;

  const removeCategory = async (c: Category) => {
    const used = data.transactions.filter((t) => t.categoryId === c.id).length;
    const svcs = data.services.filter((s) => s.categoryId === c.id).length;
    const parts: string[] = [];
    if (used) parts.push(`its ${used} transaction${used === 1 ? '' : 's'} will be kept as Uncategorized`);
    if (svcs) parts.push(`its ${svcs} subscription${svcs === 1 ? '' : 's'} will be removed`);
    if (!(await confirmDialog({ title: `Delete “${c.name}”?`, message: parts.length ? capital(parts.join(' and ')) + '.' : 'This category will be removed.', danger: true }))) return;
    update((d) => ({
      ...d,
      categories: d.categories.filter((x) => x.id !== c.id),
      services: d.services.filter((s) => s.categoryId !== c.id),
    }));
    ui.toast(`"${c.name}" deleted`);
  };

  const svcCount = (catId: string) => data.services.filter((s) => s.categoryId === catId).length;
  const svcMonthly = (catId: string) => data.services.filter((s) => s.categoryId === catId).reduce((sum, s) => sum + monthlyCost(s), 0);

  const bars = cats
    .map((c) => ({ key: c.id, label: c.name, limit: c.budget, spent: spentBy.get(c.id) || 0 }))
    .filter((r) => r.limit > 0 || r.spent > 0)
    .sort((a, b) => Math.max(b.limit, b.spent) - Math.max(a.limit, a.spent));

  return (
    <div className="container">
      <PageHeader eyebrow={eyebrow} title="Budgets">
        <MonthSwitch month={month} onChange={ui.setMonth} />
        <button type="button" className="btn btn-primary" onClick={() => ui.addCategory('expense')}>
          <Icon name="plus" strokeWidth={2.2} />
          Add category
        </button>
      </PageHeader>

      <div className="row">
        <section className="card card-dark grow-1" aria-labelledby="month-title" style={{ gap: 22 }}>
          <div className="stack">
            <h2 id="month-title" className="card-title">
              {month === thisMonth ? 'This month' : monthLabel(month)}
            </h2>
            <span className="sub">
              {monthShort(month)} 1 – {monthShort(month)} {days}, {month.slice(0, 4)}
            </span>
          </div>
          <div className="stack" style={{ gap: 6 }}>
            <span className="sub">Spent {month === thisMonth ? 'so far' : ''}</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontFamily: 'var(--display)', fontSize: 40, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{money(t.expense)}</span>
              <span className="sub" style={{ fontSize: 14 }}>
                {totalBudget > 0 ? `of ${money(totalBudget)}` : 'no limits set'}
              </span>
            </div>
          </div>
          {totalBudget > 0 && (
            <div className="stack" style={{ gap: 8 }}>
              <Progress value={(t.expense / totalBudget) * 100} variant="dark" />
              <div className="sub" style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span>{Math.round((t.expense / totalBudget) * 100)}% used</span>
                {day > 0 && (
                  <span>
                    Day {day} of {days}
                  </span>
                )}
              </div>
            </div>
          )}
          <div style={{ marginTop: 'auto', display: 'flex', flexWrap: 'wrap', gap: 16, paddingTop: 18, borderTop: '1px solid var(--navy-600)' }}>
            <Stat label={remaining < 0 ? 'Over total' : 'Remaining'} value={totalBudget > 0 ? money(Math.abs(remaining)) : '—'} />
            <Stat
              label="Per day left"
              value={totalBudget > 0 && month === thisMonth && remaining > 0 ? money(remaining / daysLeft) : '—'}
            />
            <Stat label="Over budget" value={`${overCount} categor${overCount === 1 ? 'y' : 'ies'}`} />
          </div>
        </section>

        <section className="card grow-2" aria-labelledby="bva-title">
          <div className="card-head">
            <div className="stack">
              <h2 id="bva-title" className="card-title">
                Budget vs. actual
              </h2>
              <span className="sub">Spending against each category's limit</span>
            </div>
            <div className="legend">
              <span>
                <span className="swatch" style={{ background: 'var(--limit)' }} />
                Limit
              </span>
              <span>
                <span className="swatch" style={{ background: 'var(--series-ink)' }} />
                Spent
              </span>
              <span>
                <span className="swatch" style={{ background: '#E86F56' }} />
                Over
              </span>
            </div>
          </div>
          {bars.length ? <BudgetBars rows={bars} /> : <div className="chart-empty">Set limits on the categories below to compare them here.</div>}
        </section>
      </div>

      <section aria-labelledby="cats-title" style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <h2 id="cats-title" className="section-title">
            Categories
          </h2>
          <span className="cat-head-right">
            <span className="sub">
              {cats.length} categor{cats.length === 1 ? 'y' : 'ies'} · {money(totalBudget)} budgeted
              {uncategorized > 0 && ` · ${money(uncategorized)} uncategorized`}
            </span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => ui.addCategory('expense')}>
              <Icon name="plus" size={16} strokeWidth={2.2} />
              New category
            </button>
          </span>
        </div>
        <div className="cat-grid">
          {cats.map((c) => {
            const spent = spentBy.get(c.id) || 0;
            const has = c.budget > 0;
            const pct = has ? Math.round((spent / c.budget) * 100) : 0;
            const over = has && spent > c.budget;
            const left = c.budget - spent;
            return (
              <article className="cat-card" key={c.id}>
                <div className="cat-card-head">
                  <h3>
                    <span className="swatch" style={{ background: shade(c.color) }} />
                    <span className="cat-name" title={c.name}>{c.name}</span>
                  </h3>
                  <span className="cat-card-tools">
                    <button type="button" className="icon-btn" title="Edit name, color, limit and services" aria-label={`Edit ${c.name}`} onClick={() => ui.editCategory(c)}>
                      <Icon name="edit" size={16} />
                    </button>
                    <button type="button" className="icon-btn danger" title="Delete category" aria-label={`Delete ${c.name}`} onClick={() => removeCategory(c)}>
                      <Icon name="trash" size={16} />
                    </button>
                  </span>
                </div>
                <div className="cat-amount">
                  <strong className={over ? 'over' : ''}>{money(spent)}</strong>
                  <span className="sub">{has ? `of ${money(c.budget)}` : 'spent'}</span>
                </div>
                <Progress value={has ? pct : 0} over={over} />
                {svcCount(c.id) > 0 && (
                  <span className="sub" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="repeat" size={14} />
                    {svcCount(c.id)} service{svcCount(c.id) === 1 ? '' : 's'} · {money(svcMonthly(c.id))}/mo
                  </span>
                )}
                <div className="cat-foot">
                  {has ? (
                    <>
                      <span className={over ? 'over' : ''}>{over ? `Over by ${money(-left)}` : left === 0 ? 'Fully used' : `${money(left)} left`}</span>
                      <span>{pct}%</span>
                    </>
                  ) : (
                    <button type="button" className="link-btn" style={{ minHeight: 24 }} onClick={() => ui.editCategory(c)}>
                      Set a limit
                    </button>
                  )}
                </div>
              </article>
            );
          })}
          <button type="button" className="cat-card cat-add" onClick={() => ui.addCategory('expense')}>
            <span className="cat-add-icon" aria-hidden="true">
              <Icon name="plus" size={20} strokeWidth={2.2} />
            </span>
            <strong>Add category</strong>
            <span className="sub">Name, color, monthly limit and subscriptions</span>
          </button>
        </div>
      </section>

      <Bills />
    </div>
  );
}

/** Every subscription and bill across categories, soonest payment first. */
function Bills() {
  const { data } = useStore();
  const ui = useUI();
  const today = todayISO();
  const cat = categoryLookup(data);
  const rows = data.services
    .map((s) => ({ s, next: nextPayment(s, today) }))
    .sort((a, b) => (a.next < b.next ? -1 : a.next > b.next ? 1 : a.s.name.localeCompare(b.s.name)));
  const perMonth = data.services.reduce((sum, s) => sum + monthlyCost(s), 0);
  const firstExpense = data.categories.find((c) => c.name.toLowerCase() === 'subscriptions' && c.type === 'expense');

  return (
    <section aria-labelledby="bills-title" style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <h2 id="bills-title" className="section-title">
          Subscriptions & bills
        </h2>
        {rows.length > 0 && (
          <span className="sub">
            {rows.length} service{rows.length === 1 ? '' : 's'} · {money(perMonth)} per month · {money(perMonth * 12)} per year
          </span>
        )}
      </div>
      {rows.length ? (
        <div className="table-wrap">
          <table className="data bills-table">
            <thead>
              <tr>
                <th scope="col">Service</th>
                <th scope="col">Category</th>
                <th scope="col">Next payment</th>
                <th scope="col">Paid from</th>
                <th scope="col" className="num">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ s, next }) => {
                const c = cat(s.categoryId);
                const category = data.categories.find((x) => x.id === s.categoryId);
                const open = () => category && ui.editCategory(category);
                return (
                  <tr key={s.id} className="clickable" onClick={open}>
                    <td>
                      <button
                        type="button"
                        className="desc-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          open();
                        }}
                      >
                        {s.name}
                      </button>
                      <div className="svc-sched">{scheduleLabel(s)}</div>
                    </td>
                    <td>
                      <span className="cat-chip">
                        <span className="dot" style={{ background: shade(c.color) }} />
                        {c.name}
                      </span>
                    </td>
                    <td>
                      {mediumDate(next)}
                      {daysBetween(today, next) <= 7 && <span className="due-soon">{dueLabel(next, today)}</span>}
                    </td>
                    <td className="muted">{accountName(data, s.accountId)}</td>
                    <td className="num">
                      <strong>{money(s.amount)}</strong>
                      {s.frequency === 'yearly' && <div className="svc-sched">≈ {money(monthlyCost(s))}/mo</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="chart-empty">
          <div>
            No subscriptions or bills yet. Open a category with the edit button and add the services you pay for.
            {firstExpense && (
              <>
                <br />
                <button type="button" className="link-btn" onClick={() => ui.editCategory(firstExpense)}>
                  Add services to {firstExpense.name}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: '1 1 90px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 12, color: 'var(--muted-dark)' }}>{label}</span>
      <span style={{ fontSize: 16, fontWeight: 600 }}>{value}</span>
    </div>
  );
}
