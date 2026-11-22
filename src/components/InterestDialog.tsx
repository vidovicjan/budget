import { useState, type FormEvent } from 'react';
import { useStore } from '../store';
import { Modal } from './common';
import { Icon } from './Icon';
import { accountBalance } from '../lib/data';
import { PAYOUT_LABEL } from '../lib/interest';
import { mediumDate, todayISO } from '../lib/dates';
import { money, parseAmount, round2 } from '../lib/format';
import type { Account, InterestPayout } from '../lib/types';

/** Turn interest on or off for an account and set the rate, payout and tax. */
export function InterestDialog({ account, onClose, onSaved }: { account: Account; onClose: () => void; onSaved: (m: string) => void }) {
  const { data, update } = useStore();
  const cfg = account.interest;
  const [rate, setRate] = useState(cfg ? String(cfg.rate) : '');
  const [payout, setPayout] = useState<InterestPayout>(cfg?.payout ?? 'monthly');
  const [since, setSince] = useState(cfg?.since ?? todayISO());
  const [tax, setTax] = useState(cfg ? String(cfg.tax) : '0');
  const [submitted, setSubmitted] = useState(false);

  const r = parseAmount(rate);
  const t = tax.trim() ? parseAmount(tax) : 0;
  const rateError = !rate.trim() ? 'Enter the yearly rate.' : !Number.isFinite(r) || r <= 0 || r > 100 ? 'Enter a rate between 0 and 100 %.' : '';
  const taxError = !Number.isFinite(t) || t < 0 || t > 100 ? 'Enter 0–100 %.' : '';
  const sinceError = /^\d{4}-\d{2}-\d{2}$/.test(since) ? '' : 'Pick a date.';

  const balance = accountBalance(data, account.id);
  const perMonth = !rateError && !taxError ? round2(((Math.max(0, balance) * r) / 100 / 12) * (1 - t / 100)) : 0;
  const perYear = !rateError && !taxError ? round2(((Math.max(0, balance) * r) / 100) * (1 - t / 100)) : 0;

  const save = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (rateError || taxError || sinceError) return;
    update((d) => ({
      ...d,
      accounts: d.accounts.map((a) => (a.id === account.id ? { ...a, interest: { rate: round2(r * 100) / 100, payout, since, tax: round2(t) } } : a)),
    }));
    onSaved(`Interest set for ${account.name}`);
    onClose();
  };

  const turnOff = () => {
    update((d) => ({
      ...d,
      accounts: d.accounts.map((a) => {
        if (a.id !== account.id) return a;
        const { interest: _drop, ...rest } = a;
        return rest;
      }),
    }));
    onSaved(`Interest turned off for ${account.name}. Payments already added stay.`);
    onClose();
  };

  return (
    <Modal title={`Interest · ${account.name}`} onClose={onClose} width={500}>
      <form onSubmit={save} noValidate style={{ display: 'contents' }}>
        <div className="two">
          <div className="field">
            <label htmlFor="int-rate">Yearly rate</label>
            <div className="suffix-input">
              <input id="int-rate" className="input" inputMode="decimal" placeholder="e.g. 2.5" value={rate} onChange={(e) => setRate(e.target.value)} data-autofocus aria-invalid={submitted && !!rateError} />
              <span aria-hidden="true">%</span>
            </div>
            {submitted && rateError && <span className="error-text">{rateError}</span>}
          </div>
          <div className="field">
            <label htmlFor="int-tax">Tax withheld</label>
            <div className="suffix-input">
              <input id="int-tax" className="input" inputMode="decimal" placeholder="0" value={tax} onChange={(e) => setTax(e.target.value)} aria-invalid={!!taxError} />
              <span aria-hidden="true">%</span>
            </div>
            {taxError && <span className="error-text">{taxError}</span>}
          </div>
        </div>

        <fieldset className="plain-fieldset">
          <legend className="label">Paid out</legend>
          <div className="chips">
            {(Object.keys(PAYOUT_LABEL) as InterestPayout[]).map((p) => (
              <button type="button" key={p} className="chip-btn sm" aria-pressed={payout === p} onClick={() => setPayout(p)}>
                {PAYOUT_LABEL[p]}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="field">
          <label htmlFor="int-since">Earning interest since</label>
          <input id="int-since" className="input" type="date" value={since} onChange={(e) => setSince(e.target.value)} />
          <span className="hint">A date in the past adds the interest you've already earned since then.</span>
        </div>

        <div className="interest-preview">
          <Icon name="trend" size={18} />
          <span>
            {perMonth > 0 ? (
              <>
                On today's balance of <strong>{money(balance)}</strong> that's about <strong>{money(perMonth)}</strong> a month ({money(perYear)} a year).
              </>
            ) : balance <= 0 ? (
              'This account has no money in it yet, so it earns nothing for now.'
            ) : (
              'Enter a rate to see what it earns.'
            )}
            <span className="sub">
              Earned daily on the balance and added as income at the end of each {payout === 'monthly' ? 'month' : payout === 'quarterly' ? 'quarter' : 'year'}
              {since > todayISO() ? `, starting ${mediumDate(since)}` : ''}. It compounds, so paid interest earns interest too.
            </span>
          </span>
        </div>

        <div className="modal-foot">
          {cfg && (
            <button type="button" className="btn btn-danger btn-lg" onClick={turnOff}>
              Turn off
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn btn-secondary btn-lg" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary btn-lg">
            {cfg ? 'Save' : 'Turn on interest'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
