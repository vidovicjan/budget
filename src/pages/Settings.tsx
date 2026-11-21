import { useState } from 'react';
import { useStore } from '../store';
import { useUI } from '../ui';
import { PageHeader, SelectBox } from '../components/common';
import { Icon } from '../components/Icon';
import { accountBalance, emptyData, normalizeData, uid, shade } from '../lib/data';
import { CURRENCIES, money, parseAmount, round2 } from '../lib/format';
import { exportCSV } from '../lib/csv';
import { openTextFile, saveTextFile } from '../lib/files';
import { todayISO } from '../lib/dates';
import type { Account, AccountKind } from '../lib/types';
import type { UpdateState } from '../lib/files';
import { useUpdate } from '../components/UpdateBanner';

function updateText(u: UpdateState): string {
  switch (u.status) {
    case 'dev':
      return 'Updates are checked only in the installed app.';
    case 'checking':
      return 'Checking for updates…';
    case 'downloading':
      return `Downloading version ${u.next ?? ''}… ${u.percent ? `${u.percent}%` : ''}`;
    case 'ready':
      return `Version ${u.next} is downloaded and installs when you restart.`;
    case 'latest':
      return 'You have the latest version.';
    case 'error':
      return `Couldn't check for updates: ${u.error ?? 'unknown error'}`;
    default:
      return 'Updates download automatically in the background.';
  }
}

export function Settings() {
  const { data, update, workspace, setTheme } = useStore();
  const ui = useUI();
  const [newAccount, setNewAccount] = useState('');
  const [newKind, setNewKind] = useState<AccountKind>('cash');
  const update_ = useUpdate();

  const setAccount = (id: string, patch: Partial<Account>) =>
    update((d) => ({ ...d, accounts: d.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));

  const addAccount = () => {
    const name = newAccount.trim();
    if (!name) return;
    update((d) => ({ ...d, accounts: [...d.accounts, { id: uid(), name, kind: newKind, openingBalance: 0 }] }));
    setNewAccount('');
  };

  const removeAccount = (a: Account) => {
    const used = data.transactions.filter((t) => t.accountId === a.id).length;
    const held = data.positions.filter((p) => p.accountId === a.id).length;
    if (held) {
      ui.toast(`"${a.name}" holds ${held} position${held === 1 ? '' : 's'}. Remove them on the Portfolio page first.`, 'error');
      return;
    }
    if (used) {
      ui.toast(`"${a.name}" has ${used} transaction${used === 1 ? '' : 's'}. Move or delete them first.`, 'error');
      return;
    }
    if (data.accounts.length === 1) {
      ui.toast('You need at least one account.', 'error');
      return;
    }
    if (window.confirm(`Delete the account "${a.name}"?`)) update((d) => ({ ...d, accounts: d.accounts.filter((x) => x.id !== a.id) }));
  };

  const exportTx = async () => {
    const path = await saveTextFile(`budget-transactions-${todayISO()}.csv`, exportCSV(data), 'text/csv');
    if (path) ui.toast('Transactions exported');
  };

  const restore = async () => {
    try {
      const file = await openTextFile(['json']);
      if (!file) return;
      const restored = normalizeData(JSON.parse(file.content));
      const msg = `Replace all current data with "${file.name}"? It has ${restored.transactions.length} transactions. This can't be undone.`;
      if (!window.confirm(msg)) return;
      update(() => restored);
      ui.toast('Backup restored');
    } catch (err) {
      ui.toast(err instanceof SyntaxError ? 'That file is not valid JSON.' : String((err as Error).message || err), 'error');
    }
  };

  const erase = () => {
    if (!window.confirm('Erase all transactions, categories, budgets and accounts? Export a backup first if you might need them. This cannot be undone.')) return;
    // Shared spaces keep their members (and currency); everything else is cleared.
    update((d) => ({ ...emptyData(), members: d.members, settings: { ...emptyData().settings, currency: d.settings.currency } }));
    ui.toast('All data erased');
  };

  const incomeCats = data.categories.filter((c) => c.type === 'income');

  return (
    <div className="container" style={{ maxWidth: 960 }}>
      <PageHeader eyebrow="Preferences and data" title="Settings" />

      <section className="card" aria-labelledby="general-title">
        <h2 id="general-title" className="card-title">
          General
        </h2>
        <div className="settings-row">
          <div className="stack">
            <strong>Currency</strong>
            <span className="sub">Used to display all amounts. Changing it doesn't convert values.</span>
          </div>
          <div style={{ width: 260 }}>
            <label htmlFor="currency" className="sr-only">
              Currency
            </label>
            <SelectBox
              id="currency"
              className="sm"
              value={data.settings.currency}
              onChange={(e) => update((d) => ({ ...d, settings: { ...d.settings, currency: e.target.value } }))}
            >
              {CURRENCIES.map(([code, name]) => (
                <option key={code} value={code}>
                  {code} · {name}
                </option>
              ))}
            </SelectBox>
          </div>
        </div>
        <div className="settings-row">
          <div className="stack">
            <strong id="theme-label">Appearance</strong>
            <span className="sub">System follows your Windows light or dark setting.</span>
          </div>
          <div className="seg" role="group" aria-labelledby="theme-label">
            {(
              [
                ['light', 'Light'],
                ['dark', 'Dark'],
                ['system', 'System'],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                aria-pressed={workspace.device.theme === v}
                onClick={() => setTheme(v)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {update_ && (
          <div className="settings-row">
            <div className="stack">
              <strong>App version {update_.version}</strong>
              <span className="sub">{updateText(update_)}</span>
            </div>
            {update_.status === 'ready' ? (
              <button type="button" className="btn btn-dark" onClick={() => window.desktop?.installUpdate?.()}>
                Restart to update
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={update_.status === 'dev' || update_.status === 'checking' || update_.status === 'downloading'}
                onClick={() => window.desktop?.checkForUpdates?.()}
              >
                <Icon name="refresh" size={16} />
                Check for updates
              </button>
            )}
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="prices-title">
        <h2 id="prices-title" className="card-title">
          Live prices
        </h2>
        <div className="settings-row">
          <div className="stack">
            <strong>Update investment prices automatically</strong>
            <span className="sub">
              Every two minutes from CoinGecko (crypto) and Yahoo Finance (stocks, ETFs), converted with ExchangeRate-API. Only coin and ticker names are
              sent, never your amounts. Turn off to keep the app fully offline.
            </span>
          </div>
          <label className="check" style={{ whiteSpace: 'nowrap' }}>
            <input
              type="checkbox"
              checked={data.settings.livePrices}
              onChange={(e) => update((d) => ({ ...d, settings: { ...d.settings, livePrices: e.target.checked } }))}
            />
            <span>{data.settings.livePrices ? 'On' : 'Off'}</span>
          </label>
        </div>
        <div className="settings-row">
          <div className="stack">
            <strong>Portfolio currency</strong>
            <span className="sub">
              Prices, values and average buy prices on the Portfolio page are in this currency. Net worth is converted to {data.settings.currency}.
              Changing it doesn't convert buy prices you already entered.
            </span>
          </div>
          <div style={{ width: 260 }}>
            <label htmlFor="portfolio-currency" className="sr-only">
              Portfolio currency
            </label>
            <SelectBox
              id="portfolio-currency"
              className="sm"
              value={data.settings.portfolioCurrency}
              onChange={(e) => update((d) => ({ ...d, settings: { ...d.settings, portfolioCurrency: e.target.value } }))}
            >
              {CURRENCIES.map(([code, name]) => (
                <option key={code} value={code}>
                  {code} · {name}
                </option>
              ))}
            </SelectBox>
          </div>
        </div>
      </section>

      <section className="card" aria-labelledby="accounts-title">
        <div className="stack">
          <h2 id="accounts-title" className="card-title">
            Accounts
          </h2>
          <span className="sub">
            The opening balance is the cash the account held before your first tracked transaction. Investment accounts (crypto, brokerage) also hold
            positions, valued at live prices on the Portfolio page.
          </span>
        </div>
        <div>
          <div className="acct-row acct-head" aria-hidden="true">
            <span>Name</span>
            <span>Type</span>
            <span>Opening balance</span>
            <span style={{ textAlign: 'right' }}>Balance today</span>
            <span />
          </div>
          {data.accounts.map((a) => (
            <AccountRow key={a.id} account={a} balance={accountBalance(data, a.id)} positions={data.positions.filter((p) => p.accountId === a.id).length} onChange={(p) => setAccount(a.id, p)} onRemove={() => removeAccount(a)} />
          ))}
        </div>
        <form
          style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}
          onSubmit={(e) => {
            e.preventDefault();
            addAccount();
          }}
        >
          <label htmlFor="new-account" className="sr-only">
            New account name
          </label>
          <input id="new-account" className="input sm" style={{ flex: '1 1 240px' }} placeholder={newKind === 'investment' ? 'New account, e.g. Crypto or Broker' : 'New account, e.g. Cash'} value={newAccount} onChange={(e) => setNewAccount(e.target.value)} maxLength={40} />
          <div style={{ flex: '0 0 170px' }}>
            <label htmlFor="new-account-kind" className="sr-only">
              Account type
            </label>
            <SelectBox id="new-account-kind" className="sm" value={newKind} onChange={(e) => setNewKind(e.target.value as AccountKind)}>
              <option value="cash">Cash</option>
              <option value="investment">Investment</option>
            </SelectBox>
          </div>
          <button type="submit" className="btn btn-secondary" disabled={!newAccount.trim()}>
            <Icon name="plus" strokeWidth={2.2} /> Add account
          </button>
        </form>
      </section>

      <section className="card" aria-labelledby="income-title">
        <div className="card-head">
          <div className="stack">
            <h2 id="income-title" className="card-title">
              Income categories
            </h2>
            <span className="sub">Expense categories and their limits are on the Budgets page.</span>
          </div>
          <button type="button" className="btn btn-secondary" onClick={() => ui.addCategory('income')}>
            <Icon name="plus" strokeWidth={2.2} /> Add
          </button>
        </div>
        <div className="cat-rows">
          {incomeCats.map((c) => (
            <button type="button" key={c.id} className="cat-line" onClick={() => ui.editCategory(c)}>
              <span className="swatch" style={{ background: shade(c.color) }} />
              <span className="grow">{c.name}</span>
              <Icon name="edit" size={16} color="var(--muted)" />
              <span className="sr-only">Edit</span>
            </button>
          ))}
          {incomeCats.length === 0 && <p className="hint">No income categories.</p>}
        </div>
      </section>

      <section className="card" aria-labelledby="data-title">
        <h2 id="data-title" className="card-title">
          Data
        </h2>
        <div className="settings-row">
          <div className="stack">
            <strong>Backup</strong>
            <span className="sub">Save everything to a JSON file, or restore from one.</span>
          </div>
          <div className="header-actions">
            <button type="button" className="btn btn-secondary" onClick={restore}>
              <Icon name="upload" size={16} /> Restore backup
            </button>
            <button type="button" className="btn btn-dark" onClick={ui.exportBackup}>
              <Icon name="download" size={16} /> Export backup
            </button>
          </div>
        </div>
        <div className="settings-row">
          <div className="stack">
            <strong>CSV</strong>
            <span className="sub">
              Import needs a header row with <b>Date</b> and <b>Amount</b>; Description, Category, Account, Type and Note are optional. Negative amounts are
              expenses.
            </span>
          </div>
          <div className="header-actions">
            <button type="button" className="btn btn-secondary" onClick={ui.importCsv}>
              <Icon name="upload" size={16} /> Import CSV
            </button>
            <button type="button" className="btn btn-secondary" onClick={exportTx} disabled={!data.transactions.length}>
              <Icon name="file" size={16} /> Export CSV
            </button>
          </div>
        </div>
        <div className="settings-row">
          <div className="stack">
            <strong>Sample data</strong>
            <span className="sub">Replace your data with twelve months of demo transactions.</span>
          </div>
          <button type="button" className="btn btn-secondary" onClick={ui.loadSample}>
            Load sample data
          </button>
        </div>
      </section>

      <section className="card danger-zone" aria-labelledby="danger-title">
        <div className="settings-row" style={{ borderTop: 0, padding: 0 }}>
          <div className="stack">
            <h2 id="danger-title" className="card-title">
              Erase all data
            </h2>
            <span className="sub">Removes everything stored on this device and starts fresh.</span>
          </div>
          <button type="button" className="btn btn-danger" onClick={erase}>
            <Icon name="trash" size={16} /> Erase everything
          </button>
        </div>
      </section>
    </div>
  );
}

function AccountRow({
  account,
  balance,
  positions,
  onChange,
  onRemove,
}: {
  account: Account;
  balance: number;
  positions: number;
  onChange: (p: Partial<Account>) => void;
  onRemove: () => void;
}) {
  const [name, setName] = useState(account.name);
  const [opening, setOpening] = useState(account.openingBalance.toFixed(2));
  const commitName = () => (name.trim() ? onChange({ name: name.trim() }) : setName(account.name));
  const commitOpening = () => {
    const v = parseAmount(opening);
    if (Number.isFinite(v)) {
      onChange({ openingBalance: round2(v) });
      setOpening(round2(v).toFixed(2));
    } else setOpening(account.openingBalance.toFixed(2));
  };
  return (
    <div className="acct-row">
      <input className="input sm" aria-label="Account name" value={name} onChange={(e) => setName(e.target.value)} onBlur={commitName} maxLength={40} />
      <SelectBox
        aria-label={`${account.name} type`}
        className="sm"
        value={account.kind}
        disabled={account.kind === 'investment' && positions > 0}
        title={account.kind === 'investment' && positions > 0 ? 'Remove its positions first' : undefined}
        onChange={(e) => onChange({ kind: e.target.value as AccountKind })}
      >
        <option value="cash">Cash</option>
        <option value="investment">Investment</option>
      </SelectBox>
      <input
        className="input sm"
        aria-label={`${account.name} opening balance`}
        inputMode="decimal"
        value={opening}
        onChange={(e) => setOpening(e.target.value)}
        onBlur={commitOpening}
      />
      <span className="bal" style={{ color: balance < 0 ? 'var(--coral-dark)' : undefined }}>
        {money(balance)}
      </span>
      <button type="button" className="icon-btn" aria-label={`Delete ${account.name}`} onClick={onRemove}>
        <Icon name="trash" size={16} />
      </button>
    </div>
  );
}
