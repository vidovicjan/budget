import { useStore } from '../store';
import { useUI } from '../ui';
import { useMarket } from '../market';
import { Icon } from './Icon';
import { accountValue, netWorth } from '../lib/market';
import { money, moneyIn, pctSigned } from '../lib/format';
import { interestPreview } from '../lib/interest';

/** Every account with its current value; investment accounts at live prices. */
export function AccountsCard() {
  const { data } = useStore();
  const ui = useUI();
  const m = useMarket();
  const worth = netWorth(data, m.quotes, m.fx);
  const pc = data.settings.portfolioCurrency;
  const converts = pc !== data.settings.currency;

  return (
    <section className="card" aria-labelledby="accounts-title">
      <div className="card-head">
        <div className="stack">
          <h2 id="accounts-title" className="card-title">
            Accounts
          </h2>
          <span className="sub">
            Net worth <strong style={{ color: 'var(--ink)' }}>{money(worth)}</strong>
            {data.positions.length > 0 && ' · investments at live prices'}
          </span>
        </div>
        <div className="card-head-actions">
          <button type="button" className="btn btn-secondary" onClick={() => ui.addTransfer()} disabled={data.accounts.length < 2}>
            <Icon name="swap" size={16} />
            Move money
          </button>
          <button type="button" className="link-btn" onClick={() => ui.go('settings')}>
            Manage
          </button>
        </div>
      </div>
      <div className="acct-grid">
        {data.accounts.map((a) => {
          const v = accountValue(data, a.id, m.quotes, m.fx);
          const invest = a.kind === 'investment' || v.holdings.count > 0;
          const prev = v.holdings.value - v.holdings.dayChange;
          const body = (
            <>
              <span className="acct-tile-head">
                <span className={`acct-icon ${invest ? 'invest' : ''}`} aria-hidden="true">
                  <Icon name={invest ? 'trend' : 'wallet'} size={16} />
                </span>
                <span className="acct-name">{a.name}</span>
              </span>
              <span className={`acct-value ${v.total < 0 ? 'neg-text' : ''}`}>{money(v.total)}</span>
              <span className="acct-foot">
                {invest ? (
                  v.holdings.count ? (
                    <>
                      {converts ? `${moneyIn(v.holdings.value, pc)} · ` : ''}
                      {v.holdings.count} position{v.holdings.count === 1 ? '' : 's'}
                      {prev > 0 && (
                        <span className={v.holdings.dayChange < 0 ? 'neg-text' : 'pos-text'}>
                          {' · '}
                          {pctSigned((v.holdings.dayChange / prev) * 100)} today
                        </span>
                      )}
                    </>
                  ) : (
                    'No positions yet'
                  )
                ) : a.interest ? (
                  <span className="int" title={`${a.interest.rate}% a year, paid ${a.interest.payout}`}>
                    {a.interest.rate}% · +{money(interestPreview(data, a)?.perMonth ?? 0)}/mo
                  </span>
                ) : (
                  'Cash'
                )}
              </span>
            </>
          );
          return invest ? (
            <button type="button" key={a.id} className="acct-tile clickable" onClick={() => ui.go('portfolio')}>
              {body}
            </button>
          ) : (
            <div key={a.id} className="acct-tile">
              {body}
            </div>
          );
        })}
      </div>
    </section>
  );
}
