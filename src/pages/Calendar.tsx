import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { useUI } from '../ui';
import { MonthSwitch, PageHeader } from '../components/common';
import { Icon } from '../components/Icon';
import { longDate, monthLabel, monthOf, todayISO } from '../lib/dates';
import { accountName, byDateDesc, categoryLookup, inMonth, totals } from '../lib/data';
import { money, moneyWhole, txAmount } from '../lib/format';
import { monthWeeks, scheduledIn, type Scheduled } from '../lib/schedule';
import type { Transaction } from '../lib/types';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MAX_IN_CELL = 3;

type Entry = { kind: 'tx'; tx: Transaction } | { kind: 'scheduled'; s: Scheduled };

const isAuto = (t: Transaction) => !!(t.sourceId || t.serviceId);
const net = (entries: Entry[]) =>
  entries.reduce((sum, e) => {
    const { type, amount } = e.kind === 'tx' ? e.tx : e.s;
    return sum + (type === 'income' ? amount : -amount);
  }, 0);
const signed = (type: string, amount: number) => money(type === 'income' ? amount : -amount, true);

export function Calendar() {
  const { data } = useStore();
  const ui = useUI();
  const { month } = ui;
  const today = todayISO();
  const cat = categoryLookup(data);

  const [selected, setSelected] = useState<string>(() => (monthOf(today) === month ? today : `${month}-01`));
  useEffect(() => {
    if (monthOf(selected) !== month) setSelected(monthOf(today) === month ? today : `${month}-01`);
  }, [month, selected, today]);

  const monthTx = inMonth(data, month);
  const scheduled = useMemo(() => scheduledIn(data, month, today), [data, month, today]);
  const t = totals(monthTx);
  const upcoming = scheduled.reduce((s, x) => s + (x.type === 'income' ? x.amount : -x.amount), 0);
  const autoCount = monthTx.filter(isAuto).length;

  const byDay = useMemo(() => {
    const map = new Map<string, Entry[]>();
    const push = (date: string, e: Entry) => {
      const list = map.get(date);
      if (list) list.push(e);
      else map.set(date, [e]);
    };
    for (const tx of [...monthTx].sort(byDateDesc).reverse()) push(tx.date, { kind: 'tx', tx });
    for (const s of scheduled) push(s.date, { kind: 'scheduled', s });
    return map;
  }, [monthTx, scheduled]);

  const openScheduled = (s: Scheduled) => {
    if (s.source === 'repeat') {
      const tpl = data.transactions.find((x) => s.key.startsWith(`${x.id}:`));
      if (tpl) ui.editTx(tpl);
      return;
    }
    const c = data.categories.find((x) => x.id === s.categoryId);
    if (c) ui.editCategory(c);
  };

  const dayEntries = byDay.get(selected) ?? [];
  const dayNet = net(dayEntries);

  return (
    <div className="container">
      <PageHeader eyebrow={`${monthLabel(month)} · ${monthTx.length} transaction${monthTx.length === 1 ? '' : 's'}`} title="Calendar">
        <MonthSwitch month={month} onChange={ui.setMonth} />
        <button type="button" className="btn btn-primary" onClick={() => ui.addTx('expense')}>
          <Icon name="plus" strokeWidth={2.2} />
          Add transaction
        </button>
      </PageHeader>

      <div className="kpi-grid">
        <div className="kpi">
          <span className="kpi-label">Income</span>
          <span className="kpi-value">{money(t.income)}</span>
          <span className="kpi-foot">Recorded this month</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Expenses</span>
          <span className="kpi-value">{money(t.expense)}</span>
          <span className="kpi-foot">
            {autoCount} added automatically
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Still scheduled</span>
          <span className={`kpi-value ${upcoming < 0 ? 'neg' : ''}`}>{money(upcoming, true)}</span>
          <span className="kpi-foot">
            {scheduled.length ? `${scheduled.length} upcoming payment${scheduled.length === 1 ? '' : 's'}` : 'Nothing left this month'}
          </span>
        </div>
      </div>

      <div className="cal-layout">
        <section className="card cal-card" aria-label={`Calendar for ${monthLabel(month)}`}>
          <div className="cal-grid" role="grid">
            <div className="cal-row cal-head" role="row">
              {WEEKDAYS.map((d) => (
                <div key={d} role="columnheader" className="cal-weekday">
                  {d}
                </div>
              ))}
            </div>
            {monthWeeks(month).map((week, wi) => (
              <div className="cal-row" role="row" key={wi}>
                {week.map((date, di) => {
                  if (!date) return <div key={di} className="cal-cell empty" role="gridcell" />;
                  const entries = byDay.get(date) ?? [];
                  const extra = entries.length - MAX_IN_CELL;
                  const cls = ['cal-cell', date === today && 'today', date === selected && 'selected', date > today && 'future']
                    .filter(Boolean)
                    .join(' ');
                  return (
                    <button
                      key={date}
                      type="button"
                      role="gridcell"
                      className={cls}
                      aria-selected={date === selected}
                      aria-label={`${longDate(date)}, ${entries.length} item${entries.length === 1 ? '' : 's'}`}
                      onClick={() => setSelected(date)}
                      onDoubleClick={() => ui.addTx('expense', date)}
                    >
                      <span className="cal-cell-head">
                        <span className="cal-day">{Number(date.slice(8, 10))}</span>
                        {entries.length > 0 && (
                          <span className={`cal-net ${net(entries) > 0 ? 'pos-text' : ''}`}>{(net(entries) > 0 ? "+" : "") + moneyWhole(net(entries))}</span>
                        )}
                      </span>
                      <span className="cal-items">
                        {entries.slice(0, extra > 0 ? MAX_IN_CELL - 1 : MAX_IN_CELL).map((e) => {
                          const item = e.kind === 'tx' ? e.tx : e.s;
                          const key = e.kind === 'tx' ? e.tx.id : e.s.key;
                          const auto = e.kind === 'scheduled' || isAuto(e.tx);
                          return (
                            <span
                              key={key}
                              className={`cal-pill ${e.kind === 'scheduled' ? 'scheduled' : ''} ${item.type === 'income' ? 'income' : ''}`}
                              style={{ ['--c' as string]: cat(item.categoryId).color }}
                            >
                              {auto && <Icon name="repeat" size={11} strokeWidth={2.2} />}
                              <span className="cal-pill-name" title={`${item.description || cat(item.categoryId).name} ${signed(item.type, item.amount)}`}>
                                {item.description || cat(item.categoryId).name}
                              </span>
                            </span>
                          );
                        })}
                        {extra > 0 && <span className="cal-more">+{extra + 1} more</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="cal-legend">
            <span>
              <Icon name="repeat" size={12} strokeWidth={2.2} /> Added automatically (subscriptions, repeating)
            </span>
            <span>
              <span className="cal-legend-dash" /> Scheduled, added on its date
            </span>
          </div>
        </section>

        <section className="card cal-side" aria-labelledby="day-title">
          <div className="stack">
            <h2 id="day-title" className="card-title">
              {longDate(selected)}
            </h2>
            <span className="sub">
              {dayEntries.length ? `${dayEntries.length} item${dayEntries.length === 1 ? '' : 's'} · ${money(dayNet, true)}` : 'Nothing on this day'}
            </span>
          </div>
          <ul className="cal-day-list">
            {dayEntries.map((e) => {
              if (e.kind === 'tx') {
                const tx = e.tx;
                const c = cat(tx.categoryId);
                return (
                  <li key={tx.id}>
                    <button type="button" className="cal-entry" onClick={() => ui.editTx(tx)}>
                      <span className="cal-dot" style={{ background: c.color }} />
                      <span className="stack grow">
                        <span className="cal-entry-name">{tx.description || c.name}</span>
                        <span className="sub">
                          {c.name} · {accountName(data, tx.accountId)}
                          {tx.serviceId ? ' · subscription' : tx.sourceId ? ' · repeating' : ''}
                        </span>
                      </span>
                      <span className={`cal-entry-amt ${tx.type === 'income' ? 'pos-text' : ''}`}>{txAmount(tx)}</span>
                    </button>
                  </li>
                );
              }
              const s = e.s;
              const c = cat(s.categoryId);
              return (
                <li key={s.key}>
                  <button type="button" className="cal-entry scheduled" onClick={() => openScheduled(s)}>
                    <span className="cal-dot" style={{ background: c.color }} />
                    <span className="stack grow">
                      <span className="cal-entry-name">{s.description || c.name}</span>
                      <span className="sub">
                        {s.autoAdd ? 'Scheduled · added automatically' : 'Reminder · add it when you pay'} · {accountName(data, s.accountId)}
                      </span>
                    </span>
                    <span className={`cal-entry-amt ${s.type === 'income' ? 'pos-text' : ''}`}>{signed(s.type, s.amount)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <button type="button" className="btn btn-secondary" onClick={() => ui.addTx('expense', selected)}>
            <Icon name="plus" strokeWidth={2.2} />
            Add on this day
          </button>
        </section>
      </div>
    </div>
  );
}
