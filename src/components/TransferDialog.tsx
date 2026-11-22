import { useState, type FormEvent } from 'react';
import { useStore } from '../store';
import { Modal, SelectBox } from './common';
import { Icon } from './Icon';
import { confirmDialog } from './Confirm';
import { accountBalance, uid } from '../lib/data';
import { currencySymbol, money, parseAmount, round2 } from '../lib/format';
import { todayISO } from '../lib/dates';
import type { Transfer } from '../lib/types';

interface Props {
  transfer: Transfer | null;
  defaultFrom?: string;
  defaultTo?: string;
  defaultDate: string;
  onClose: () => void;
  onSaved: (message: string) => void;
  /** Switch back to the normal transaction dialog (from the type toggle). */
  onSwitchType?: (type: 'expense' | 'income') => void;
}

/** Move money between two of your own accounts, e.g. Checking → Savings. */
export function TransferDialog({ transfer, defaultFrom, defaultTo, defaultDate, onClose, onSaved, onSwitchType }: Props) {
  const { data, update } = useStore();
  const accounts = data.accounts;
  const savingsGuess = accounts.find((a) => /sav|štedn|stedn/i.test(a.name))?.id;
  const initialFrom = transfer?.from ?? defaultFrom ?? accounts[0]?.id ?? '';
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(transfer?.to ?? defaultTo ?? (savingsGuess && savingsGuess !== initialFrom ? savingsGuess : accounts.find((a) => a.id !== initialFrom)?.id ?? ''));
  const [amount, setAmount] = useState(transfer ? transfer.amount.toFixed(2) : '');
  const [date, setDate] = useState(transfer?.date ?? defaultDate);
  const [note, setNote] = useState(transfer?.note ?? '');
  const [submitted, setSubmitted] = useState(false);

  const value = parseAmount(amount);
  const amountError = !amount.trim() ? 'Enter an amount.' : !Number.isFinite(value) || value <= 0 ? 'Enter an amount above zero.' : '';
  const sameError = from === to ? 'Pick two different accounts.' : '';
  const dateError = /^\d{4}-\d{2}-\d{2}$/.test(date) ? '' : 'Pick a date.';

  // Balance of the source account on that date, without this transfer (when editing).
  const others = transfer ? { ...data, transfers: data.transfers.filter((x) => x.id !== transfer.id) } : data;
  const fromBalance = from ? accountBalance(others, from, date || todayISO()) : 0;
  const short = !amountError && !sameError && value > fromBalance;

  const swap = () => {
    setFrom(to);
    setTo(from);
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (amountError || sameError || dateError) return;
    const record: Transfer = {
      id: transfer?.id ?? uid(),
      date,
      from,
      to,
      amount: round2(value),
      note: note.trim(),
      created: transfer?.created ?? Date.now(),
      ...(transfer?.updatedAt ? { updatedAt: transfer.updatedAt } : {}),
    };
    update((d) => ({ ...d, transfers: transfer ? d.transfers.map((x) => (x.id === transfer.id ? record : x)) : [...d.transfers, record] }));
    const name = (id: string) => accounts.find((a) => a.id === id)?.name ?? 'account';
    onSaved(transfer ? 'Transfer updated' : `Moved ${money(record.amount)} from ${name(from)} to ${name(to)}`);
    onClose();
  };

  const remove = async () => {
    if (!transfer) return;
    if (!(await confirmDialog({ title: 'Delete this transfer?', message: 'Both account balances go back to how they were before it.', danger: true }))) return;
    update((d) => ({ ...d, transfers: d.transfers.filter((x) => x.id !== transfer.id) }));
    onSaved('Transfer deleted');
    onClose();
  };

  if (accounts.length < 2) {
    return (
      <Modal title="Move money" onClose={onClose}>
        <p className="hint" style={{ margin: 0 }}>
          You need at least two accounts to move money between them. Add one under Settings → Accounts.
        </p>
        <div className="modal-foot">
          <button type="button" className="btn btn-secondary btn-lg" onClick={onClose}>
            Close
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={transfer ? 'Edit transfer' : 'Move money'} onClose={onClose}>
      <form onSubmit={save} noValidate style={{ display: 'contents' }}>
        {!transfer && onSwitchType && (
          <div className="toggle three" role="group" aria-label="Transaction type">
            <button type="button" aria-pressed={false} onClick={() => onSwitchType('expense')}>
              Expense
            </button>
            <button type="button" aria-pressed={false} onClick={() => onSwitchType('income')}>
              Income
            </button>
            <button type="button" aria-pressed={true}>
              Transfer
            </button>
          </div>
        )}

        <div className="transfer-route">
          <div className="field">
            <label htmlFor="tr-from">From</label>
            <SelectBox id="tr-from" value={from} onChange={(e) => setFrom(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </SelectBox>
          </div>
          <button type="button" className="icon-btn transfer-swap" aria-label="Swap accounts" title="Swap accounts" onClick={swap}>
            <Icon name="swap" size={18} />
          </button>
          <div className="field">
            <label htmlFor="tr-to">To</label>
            <SelectBox id="tr-to" value={to} onChange={(e) => setTo(e.target.value)} aria-invalid={submitted && !!sameError}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </SelectBox>
          </div>
        </div>
        {sameError && <span className="error-text">{sameError}</span>}

        <div className="field">
          <label htmlFor="tr-amount">Amount</label>
          <div onClick={(e) => (e.currentTarget.querySelector('input') as HTMLInputElement).focus()} className={`amount-input ${submitted && amountError ? 'invalid' : ''}`}>
            <span aria-hidden="true">{currencySymbol(data.settings.currency)}</span>
            <input
              id="tr-amount"
              data-autofocus
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              autoComplete="off"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={submitted && !!amountError}
            />
          </div>
          {submitted && amountError ? (
            <span className="error-text">{amountError}</span>
          ) : (
            <span className={`hint ${short ? 'warn-text' : ''}`}>
              {short
                ? `More than the ${money(fromBalance)} in ${accounts.find((a) => a.id === from)?.name} on that day. It will go negative.`
                : `${accounts.find((a) => a.id === from)?.name ?? ''} has ${money(fromBalance)} on that day.`}
            </span>
          )}
        </div>

        <div className="two">
          <div className="field">
            <label htmlFor="tr-date">Date</label>
            <input id="tr-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-invalid={submitted && !!dateError} />
            {submitted && dateError && <span className="error-text">{dateError}</span>}
          </div>
          <div className="field">
            <label htmlFor="tr-note">Note (optional)</label>
            <input id="tr-note" className="input" type="text" placeholder="e.g. Monthly savings" value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <p className="hint" style={{ margin: 0 }}>
          Transfers don't count as income or spending. They only change the two account balances.
        </p>

        <div className="modal-foot">
          {transfer && (
            <button type="button" className="btn btn-danger btn-lg" onClick={remove}>
              <Icon name="trash" size={16} /> Delete
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn btn-secondary btn-lg" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary btn-lg">
            {transfer ? 'Save transfer' : 'Move money'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
