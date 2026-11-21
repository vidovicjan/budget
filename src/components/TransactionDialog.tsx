import { useMemo, useState, type FormEvent } from 'react';
import type { Repeat, RepeatUnit, Split, Transaction, TxType } from '../lib/types';
import { isShared, shareOf } from '../lib/shared';
import { Avatar } from './People';
import { useStore } from '../store';
import { Modal, SelectBox } from './common';
import { nextColor, uid, shade } from '../lib/data';
import { shortDate } from '../lib/dates';
import { repeatDates, repeatLabel, skipKeyFor, unitName } from '../lib/repeat';
import { money, parseAmount, round2 } from '../lib/format';
import { Icon } from './Icon';

interface Props {
  tx: Transaction | null;
  defaultType: TxType;
  defaultDate: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}

function currencySymbol(currency: string) {
  try {
    const part = new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0)
      .find((p) => p.type === 'currency');
    return part?.value ?? '$';
  } catch {
    return '$';
  }
}

type RepeatKind = 'none' | 'week' | 'biweek' | 'month' | 'year' | 'custom';

const PRESETS: Record<Exclude<RepeatKind, 'none' | 'custom'>, Repeat> = {
  week: { every: 1, unit: 'week' },
  biweek: { every: 2, unit: 'week' },
  month: { every: 1, unit: 'month' },
  year: { every: 1, unit: 'year' },
};

const KINDS: [RepeatKind, string][] = [
  ['none', "Doesn't repeat"],
  ['week', 'Weekly'],
  ['biweek', 'Bi-weekly'],
  ['month', 'Monthly'],
  ['year', 'Yearly'],
  ['custom', 'Custom'],
];

function presetOf(r: Repeat | null): RepeatKind {
  if (!r) return 'none';
  for (const [k, p] of Object.entries(PRESETS)) if (p.every === r.every && p.unit === r.unit) return k as RepeatKind;
  return 'custom';
}

export function TransactionDialog({ tx, defaultType, defaultDate, onClose, onSaved }: Props) {
  const { data, update, space } = useStore();
  const [type, setType] = useState<TxType>(tx?.type ?? defaultType);
  const firstCat = (t: TxType) => data.categories.find((c) => c.type === t)?.id ?? '';
  const [categoryId, setCategoryId] = useState(tx?.categoryId ?? firstCat(tx?.type ?? defaultType));
  const [amount, setAmount] = useState(tx ? tx.amount.toFixed(2) : '');
  const [date, setDate] = useState(tx?.date ?? defaultDate);
  const [accountId, setAccountId] = useState(tx?.accountId ?? data.accounts[0]?.id ?? '');
  const [description, setDescription] = useState(tx?.description ?? '');
  const [note, setNote] = useState(tx?.note ?? '');
  const initialKind = presetOf(tx?.repeat ?? null);
  const [repeatKind, setRepeatKind] = useState<RepeatKind>(initialKind);
  const [customEvery, setCustomEvery] = useState(String(tx?.repeat?.every ?? 10));
  const [customUnit, setCustomUnit] = useState<RepeatUnit>(tx?.repeat && initialKind === 'custom' ? tx.repeat.unit : 'day');
  const [submitted, setSubmitted] = useState(false);

  // Shared spaces: who paid and how it's divided.
  const shared = isShared(data);
  const members = data.members;
  const [paidBy, setPaidBy] = useState(tx?.paidBy ?? space.meId ?? members[0]?.id ?? '');
  const [splitMode, setSplitMode] = useState<Split['mode']>(tx?.split?.mode ?? 'equal');
  const [equalIds, setEqualIds] = useState<string[]>(() =>
    tx?.split?.mode === 'equal' && tx.split.members?.length ? tx.split.members : members.map((m) => m.id)
  );
  const [shares, setShares] = useState<Record<string, string>>(() => {
    if (tx?.split?.mode === 'shares' && tx.split.shares) return Object.fromEntries(members.map((m) => [m.id, String(tx.split!.shares![m.id] ?? 0)]));
    const even = members.length ? Math.floor((100 / members.length) * 100) / 100 : 0;
    return Object.fromEntries(members.map((m, i) => [m.id, String(i === 0 ? round2(100 - even * (members.length - 1)) : even)]));
  });

  // Inline "new category" field; null when closed.
  const [newCat, setNewCat] = useState<string | null>(null);
  const addCategory = () => {
    const name = (newCat ?? '').trim();
    if (!name) return setNewCat(null);
    const existing = data.categories.find((c) => c.type === type && c.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      setCategoryId(existing.id);
    } else {
      const id = uid();
      update((d) => ({ ...d, categories: [...d.categories, { id, name, type, color: nextColor(d, type), budget: 0 }] }));
      setCategoryId(id);
    }
    setNewCat(null);
  };

  const cats = useMemo(() => data.categories.filter((c) => c.type === type), [data.categories, type]);
  const value = parseAmount(amount);
  const amountError = !Number.isFinite(value) || value <= 0 ? 'Enter an amount greater than zero.' : '';
  const dateError = /^\d{4}-\d{2}-\d{2}$/.test(date) ? '' : 'Pick a date.';
  const isCopy = !!tx?.sourceId || !!tx?.serviceId;
  const shareTotal = members.reduce((sum, m) => sum + (Number(shares[m.id]) || 0), 0);
  const splitError =
    type !== 'expense'
      ? ''
      : splitMode === 'shares' && Math.abs(shareTotal - 100) > 0.01
        ? `Shares add up to ${round2(shareTotal)}%; they need to make 100%.`
        : splitMode === 'equal' && equalIds.length === 0
          ? 'Pick at least one person to split with.'
          : '';
  const buildSplit = (): Split =>
    splitMode === 'personal'
      ? { mode: 'personal' }
      : splitMode === 'shares'
        ? { mode: 'shares', shares: Object.fromEntries(members.map((m) => [m.id, round2(Number(shares[m.id]) || 0)])) }
        : { mode: 'equal', members: equalIds.length === members.length ? [] : equalIds };
  const preview = shared && type === 'expense' && !splitError && Number.isFinite(value) && value > 0
    ? shareOf({ amount: round2(value), paidBy, split: buildSplit() } as Transaction, members)
    : {};
  const everyN = Math.floor(Number(customEvery));
  const repeatError = repeatKind === 'custom' && !(everyN >= 1 && everyN <= 365) ? 'Enter a number from 1 to 365.' : '';
  const repeatRule: Repeat | null =
    repeatKind === 'none' ? null : repeatKind === 'custom' ? (repeatError ? null : { every: everyN, unit: customUnit }) : PRESETS[repeatKind];
  const upcoming = repeatRule && !dateError ? repeatDates(date, repeatRule, '9999-12-31').slice(0, 3) : [];
  const service = tx?.serviceId ? data.services.find((s) => s.id === tx.serviceId) : undefined;

  const pickType = (t: TxType) => {
    setType(t);
    if (!data.categories.some((c) => c.id === categoryId && c.type === t)) setCategoryId(firstCat(t));
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (amountError || dateError || repeatError || (shared && splitError)) return;
    const catName = data.categories.find((c) => c.id === categoryId)?.name;
    const next: Transaction = {
      id: tx?.id ?? uid(),
      date,
      description: description.trim() || catName || (type === 'income' ? 'Income' : 'Expense'),
      amount: round2(Math.abs(value)),
      type,
      categoryId,
      accountId,
      note: note.trim(),
      repeat: isCopy ? null : repeatRule,
      sourceId: tx?.sourceId,
      serviceId: tx?.serviceId,
      ...(shared && paidBy ? { paidBy } : {}),
      ...(shared && type === 'expense' ? { split: buildSplit() } : {}),
      ...(tx?.updatedAt ? { updatedAt: tx.updatedAt } : {}),
      created: tx?.created ?? Date.now(),
    };
    update((d) => {
      // Moving a generated copy to another date: remember its original slot so it isn't recreated there.
      const moved = tx && isCopy && tx.date !== date ? skipKeyFor(d, tx) : null;
      return {
        ...d,
        transactions: tx ? d.transactions.map((t) => (t.id === tx.id ? next : t)) : [...d.transactions, next],
        recurringSkips: moved ? [...d.recurringSkips, moved] : d.recurringSkips,
      };
    });
    onSaved(tx ? 'Transaction updated' : 'Transaction added');
    onClose();
  };

  const remove = () => {
    if (!tx) return;
    const series = !!tx.repeat && !tx.sourceId;
    const msg = series
      ? 'Delete this transaction? Copies already made stay; no new ones will be created.'
      : 'Delete this transaction?';
    if (!window.confirm(msg)) return;
    update((d) => ({
      ...d,
      transactions: d.transactions.filter((t) => t.id !== tx.id),
      recurringSkips: (() => {
        const key = skipKeyFor(d, tx);
        return key ? [...d.recurringSkips, key] : d.recurringSkips;
      })(),
    }));
    onSaved('Transaction deleted');
    onClose();
  };

  return (
    <Modal title={tx ? 'Edit transaction' : 'Add transaction'} onClose={onClose}>
      <form onSubmit={save} noValidate style={{ display: 'contents' }}>
        <div className="toggle" role="group" aria-label="Transaction type">
          {(['expense', 'income'] as TxType[]).map((t) => (
            <button type="button" key={t} aria-pressed={type === t} onClick={() => pickType(t)}>
              {t === 'expense' ? 'Expense' : 'Income'}
            </button>
          ))}
        </div>

        <div className="field">
          <label htmlFor="tx-amount">Amount</label>
          <div onClick={(e) => (e.currentTarget.querySelector("input") as HTMLInputElement).focus()} className={`amount-input ${submitted && amountError ? 'invalid' : ''}`}>
            <span aria-hidden="true">{currencySymbol(data.settings.currency)}</span>
            <input
              id="tx-amount"
              data-autofocus
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              autoComplete="off"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={submitted && !!amountError}
              aria-describedby={submitted && amountError ? 'tx-amount-err' : undefined}
            />
          </div>
          {submitted && amountError && (
            <span id="tx-amount-err" className="error-text">
              {amountError}
            </span>
          )}
        </div>

        <div className="field">
          <label htmlFor="tx-desc">Description</label>
          <input
            id="tx-desc"
            className="input"
            type="text"
            placeholder={type === 'expense' ? 'e.g. Greenleaf Market' : 'e.g. Salary'}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={120}
          />
        </div>

        <div className="two">
          <div className="field">
            <label htmlFor="tx-date">Date</label>
            <input id="tx-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-invalid={submitted && !!dateError} />
            {submitted && dateError && <span className="error-text">{dateError}</span>}
          </div>
          <div className="field">
            <label htmlFor="tx-account">Account</label>
            <SelectBox id="tx-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {data.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </SelectBox>
          </div>
        </div>

        <fieldset style={{ margin: 0, padding: 0, border: 0, minWidth: 0 }}>
          <legend className="label" style={{ padding: 0, marginBottom: 10 }}>
            Category
          </legend>
          <div className="chips">
            {cats.map((c) => (
              <button type="button" key={c.id} className="chip-btn" aria-pressed={c.id === categoryId} onClick={() => setCategoryId(c.id)}>
                <span className="dot" style={{ background: shade(c.color) }} />
                {c.name}
              </button>
            ))}
            {newCat === null ? (
              <button type="button" className="chip-btn chip-add" onClick={() => setNewCat('')}>
                <Icon name="plus" size={14} strokeWidth={2.2} />
                New category
              </button>
            ) : (
              <span className="chip-new">
                <label htmlFor="new-cat" className="sr-only">
                  New {type} category name
                </label>
                <input
                  id="new-cat"
                  autoFocus
                  maxLength={40}
                  placeholder="Category name"
                  value={newCat}
                  onChange={(e) => setNewCat(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCategory();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      e.stopPropagation();
                      setNewCat(null);
                    }
                  }}
                />
                <button type="button" className="chip-new-ok" aria-label="Add category" disabled={!newCat.trim()} onClick={addCategory}>
                  <Icon name="check" size={14} strokeWidth={2.4} />
                </button>
                <button type="button" className="chip-new-x" aria-label="Cancel" onClick={() => setNewCat(null)}>
                  <Icon name="close" size={14} strokeWidth={2.2} />
                </button>
              </span>
            )}
          </div>
          {!cats.length && newCat === null && <p className="hint">No {type} categories yet. Create one with “New category”.</p>}
        </fieldset>

        {shared && (
          <fieldset className="plain-fieldset">
            <legend className="label">{type === 'expense' ? 'Paid by' : 'Received by'}</legend>
            <div className="payer-chips">
              {members.map((m) => (
                <button type="button" key={m.id} className="payer-chip" aria-pressed={paidBy === m.id} onClick={() => setPaidBy(m.id)}>
                  <Avatar member={m} size={28} />
                  {m.id === space.meId ? `${m.name} (you)` : m.name}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {shared && type === 'expense' && (
          <fieldset className="plain-fieldset">
            <legend className="label">Split</legend>
            <div className="chips">
              {(
                [
                  ['equal', 'Equally'],
                  ['shares', 'By percentage'],
                  ['personal', 'Not shared'],
                ] as const
              ).map(([k, label]) => (
                <button type="button" key={k} className="chip-btn sm" aria-pressed={splitMode === k} onClick={() => setSplitMode(k)}>
                  {label}
                </button>
              ))}
            </div>
            {splitMode === 'equal' && (
              <div className="split-shares">
                {members.map((m) => (
                  <div className="split-row" key={m.id}>
                    <label className="who split-check">
                      <input
                        type="checkbox"
                        checked={equalIds.includes(m.id)}
                        onChange={(e) => setEqualIds((ids) => (e.target.checked ? [...ids, m.id] : ids.filter((x) => x !== m.id)))}
                      />
                      <Avatar member={m} size={24} />
                      {m.name}
                    </label>
                    <span />
                    <span className="amt">{preview[m.id] !== undefined ? money(preview[m.id]) : '—'}</span>
                  </div>
                ))}
              </div>
            )}
            {splitMode === 'shares' && (
              <div className="split-shares">
                {members.map((m) => (
                  <div className="split-row" key={m.id}>
                    <span className="who">
                      <Avatar member={m} size={24} />
                      {m.name}
                    </span>
                    <span className="split-pct">
                      <label className="sr-only" htmlFor={`share-${m.id}`}>
                        {m.name}'s share in percent
                      </label>
                      <input
                        id={`share-${m.id}`}
                        className="input sm"
                        inputMode="decimal"
                        value={shares[m.id] ?? ''}
                        onChange={(e) => setShares((sh) => ({ ...sh, [m.id]: e.target.value.replace(',', '.') }))}
                      />
                      <span>%</span>
                    </span>
                    <span className="amt">{preview[m.id] !== undefined ? money(preview[m.id]) : '—'}</span>
                  </div>
                ))}
              </div>
            )}
            {splitMode === 'personal' && (
              <p className="hint">Counts in the budget, but nobody owes anything for it.</p>
            )}
            {splitError && (submitted || splitMode === 'shares') && <span className="error-text">{splitError}</span>}
          </fieldset>
        )}

        <div className="field">
          <label htmlFor="tx-note">
            Note <span className="opt">(optional)</span>
          </label>
          <textarea id="tx-note" className="textarea" rows={2} placeholder="Add a short note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </div>

        {isCopy ? (
          <p className="hint" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="repeat" size={16} />
            {tx?.serviceId
              ? service
                ? `Payment for the "${service.name}" service, added automatically.`
                : 'Payment for a service that has since been removed.'
              : (() => {
                  const tpl = data.transactions.find((t) => t.id === tx?.sourceId);
                  return tpl?.repeat
                    ? `Created automatically from a repeating transaction (${repeatLabel(tpl.repeat).toLowerCase()}).`
                    : 'Created automatically from a repeating transaction.';
                })()}
          </p>
        ) : (
          <fieldset className="repeat-field">
            <legend className="label">Repeat</legend>
            <div className="chips">
              {KINDS.map(([k, label]) => (
                <button type="button" key={k} className="chip-btn sm" aria-pressed={repeatKind === k} onClick={() => setRepeatKind(k)}>
                  {k !== 'none' && <Icon name="repeat" size={13} strokeWidth={2.2} />}
                  {label}
                </button>
              ))}
            </div>
            {repeatKind === 'custom' && (
              <div className="repeat-custom">
                <span>Every</span>
                <label htmlFor="repeat-every" className="sr-only">
                  Repeat every how many
                </label>
                <input
                  id="repeat-every"
                  className="input sm"
                  type="number"
                  min={1}
                  max={365}
                  inputMode="numeric"
                  value={customEvery}
                  aria-invalid={!!repeatError}
                  onChange={(e) => setCustomEvery(e.target.value)}
                />
                <label htmlFor="repeat-unit" className="sr-only">
                  Period
                </label>
                <SelectBox id="repeat-unit" className="sm" value={customUnit} onChange={(e) => setCustomUnit(e.target.value as RepeatUnit)}>
                  {(['day', 'week', 'month', 'year'] as RepeatUnit[]).map((u) => (
                    <option key={u} value={u}>
                      {unitName(u, everyN || 2)}
                    </option>
                  ))}
                </SelectBox>
              </div>
            )}
            {repeatError ? (
              <p className="error-text" style={{ margin: 0 }}>{repeatError}</p>
            ) : repeatRule ? (
              <p className="hint">
                {repeatLabel(repeatRule)}, added automatically on each date. Next: {upcoming.map(shortDate).join(', ')}
                {upcoming.length === 3 ? ' …' : ''}
              </p>
            ) : null}
          </fieldset>
        )}

        <div className="modal-foot">
          {tx && (
            <button type="button" className="btn btn-danger btn-lg" onClick={remove}>
              <Icon name="trash" size={16} /> Delete
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn btn-secondary btn-lg" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary btn-lg">
            Save transaction
          </button>
        </div>
      </form>
    </Modal>
  );
}
