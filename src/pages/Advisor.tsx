import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { useUI, type Page } from '../ui';
import { useMarket } from '../market';
import { MonthSwitch, PageHeader } from '../components/common';
import { Icon, type IconName } from '../components/Icon';
import { Mascot } from '../components/Mascot';
import { mascotInfo, type MascotPose } from '../lib/mascots';
import { monthLabel, monthOf, todayISO } from '../lib/dates';
import { money, moneyWhole } from '../lib/format';
import { analyze, defaultAnalysisMonth, type Advice, type Analysis, type Area, type Level } from '../lib/advisor';

const AREAS: { id: Area; label: string; icon: IconName; blurb: string; page: Page }[] = [
  { id: 'spending', label: 'Cut spending', icon: 'down', blurb: 'Where money leaked this month', page: 'budgets' },
  { id: 'saving', label: 'Save more', icon: 'wallet', blurb: 'Savings rate and safety cushion', page: 'overview' },
  { id: 'investing', label: 'Invest', icon: 'trend', blurb: 'Putting extra money to work', page: 'portfolio' },
];

const LEVEL_LABEL: Record<Level, string> = { alert: 'Needs attention', tip: 'Suggestion', good: 'On track' };

function scoreWord(s: number) {
  if (s >= 80) return 'Excellent';
  if (s >= 65) return 'Good';
  if (s >= 45) return 'Fair';
  return 'Needs work';
}

/** How the mascot reacts to the month. */
function poseFor(a: Analysis, partial: boolean): MascotPose {
  if (a.net < 0 || a.score < 45) return 'alert';
  if (partial) return 'think';
  return a.score >= 65 ? 'cheer' : 'wave';
}

export function Advisor() {
  const { data, workspace } = useStore();
  const ui = useUI();
  const m = useMarket();
  const today = todayISO();
  const [month, setMonth] = useState(() => defaultAnalysisMonth(data, today));
  const a = useMemo(() => analyze(data, month, { quotes: m.quotes, fx: m.fx }, today), [data, month, m.quotes, m.fx, today]);
  const partial = month === monthOf(today);

  const mascot = mascotInfo(workspace.device.mascot);
  const ring = 2 * Math.PI * 42;

  return (
    <div className="container">
      <PageHeader eyebrow={`${monthLabel(month)} · ${a.txCount} transaction${a.txCount === 1 ? '' : 's'} analysed`} title="Advisor">
        <MonthSwitch month={month} onChange={setMonth} max={monthOf(today)} />
      </PageHeader>

      {a.txCount === 0 ? (
        <section className="card notes-empty">
          <Mascot mascot={mascot} pose="wave" animated className="adv-mascot-empty" />
          <h2 className="card-title">No transactions in {monthLabel(month)}</h2>
          <p className="sub">Add income and expenses, or pick another month, and {mascot.name} will check where money went and what to improve.</p>
          <button type="button" className="btn btn-primary" onClick={() => ui.addTx('expense')}>
            <Icon name="plus" strokeWidth={2.2} />
            Add transaction
          </button>
        </section>
      ) : (
        <>
          {partial && (
            <div className="banner">
              <Icon name="alert" size={16} />
              {monthLabel(month)} isn't over yet, so this is a mid-month check. Pick last month for a full review.
            </div>
          )}

          <section className="card card-dark adv-hero" aria-label="Summary">
            <div className="adv-mascot">
              <Mascot mascot={mascot} pose={poseFor(a, partial)} animated />
              <span className="adv-mascot-name">{mascot.name} · your advisor</span>
            </div>
            <div className="adv-score">
              <svg viewBox="0 0 100 100" width="112" height="112" aria-hidden="true">
                <circle cx="50" cy="50" r="42" fill="none" stroke="var(--navy-600)" strokeWidth="9" />
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke="var(--coral)"
                  strokeWidth="9"
                  strokeLinecap="round"
                  strokeDasharray={`${(a.score / 100) * ring} ${ring}`}
                  transform="rotate(-90 50 50)"
                />
              </svg>
              <span className="adv-score-num">
                {a.score}
                <small>/100</small>
              </span>
            </div>
            <div className="stack adv-hero-text">
              <span className="adv-eyebrow">Money health · {scoreWord(a.score)}</span>
              <h2 className="adv-headline">
                {a.potentialSaving > 0 ? (
                  <>
                    You could keep about <span className="adv-hl">{moneyWhole(a.potentialSaving)}</span> more each month
                  </>
                ) : a.net >= 0 ? (
                  'Your spending is under control this month'
                ) : (
                  'Spending was higher than income this month'
                )}
              </h2>
              <span className="sub">Based on your transactions, budgets, subscriptions and accounts. All analysis runs on this device.</span>
            </div>
            <dl className="adv-stats">
              <div>
                <dt>Income</dt>
                <dd>{money(a.income)}</dd>
              </div>
              <div>
                <dt>Spent</dt>
                <dd>{money(a.expense)}</dd>
              </div>
              <div>
                <dt>Kept</dt>
                <dd className={a.net < 0 ? 'neg' : ''}>
                  {money(a.net, true)}
                  {a.savingsRate !== null && <small> · {Math.round(a.savingsRate * 100)}%</small>}
                </dd>
              </div>
              <div>
                <dt>Cash cushion</dt>
                <dd>{a.runwayMonths !== null ? `${a.runwayMonths.toFixed(1)} mo` : '—'}</dd>
              </div>
            </dl>
          </section>

          {AREAS.map((area) => {
            const list = a.advice.filter((x) => x.area === area.id);
            if (!list.length) return null;
            return (
              <section key={area.id} className="adv-area" aria-labelledby={`adv-${area.id}`}>
                <div className="adv-area-head">
                  <span className={`adv-area-icon ${area.id}`} aria-hidden="true">
                    <Icon name={area.icon} size={18} />
                  </span>
                  <div className="stack grow">
                    <h2 id={`adv-${area.id}`} className="card-title">
                      {area.label}
                    </h2>
                    <span className="sub">{area.blurb}</span>
                  </div>
                  {area.id === 'spending' && a.potentialSaving > 0 && <span className="adv-pill">up to {moneyWhole(a.potentialSaving)}/mo</span>}
                  <button type="button" className="link-btn" onClick={() => ui.go(area.page)}>
                    Open {area.page}
                  </button>
                </div>
                <div className="adv-grid">
                  {list.map((x) => (
                    <AdviceCard key={x.id} advice={x} />
                  ))}
                </div>
              </section>
            );
          })}

          <p className="sub adv-note">
            These suggestions come from common personal-finance guidelines (20% savings rate, 3–6 month emergency fund, diversified
            investing) applied to your own numbers. They aren't professional financial advice.
          </p>
        </>
      )}
    </div>
  );
}

function AdviceCard({ advice: x }: { advice: Advice }) {
  return (
    <article className={`adv-card ${x.level}`}>
      <div className="adv-card-top">
        <span className={`adv-level ${x.level}`}>
          <Icon name={x.level === 'alert' ? 'alert' : x.level === 'good' ? 'check' : 'spark'} size={13} strokeWidth={2.2} />
          {LEVEL_LABEL[x.level]}
        </span>
        {x.saving !== undefined && x.saving > 0 && <span className="adv-save">save ~{moneyWhole(x.saving)}/mo</span>}
      </div>
      <h3 className="adv-title">{x.title}</h3>
      <p className="adv-detail">{x.detail}</p>
      {x.items && x.items.length > 0 && (
        <ul className="adv-items">
          {x.items.map((it) => (
            <li key={it.label}>
              <span className="grow">{it.label}</span>
              {it.note && <span className="sub">{it.note}</span>}
              <strong>{money(it.value)}</strong>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
