import { useMemo, useState, type FormEvent } from 'react';
import { useStore } from '../store';
import { useUI } from '../ui';
import { Modal, PageHeader, SelectBox } from '../components/common';
import { Icon } from '../components/Icon';
import { Avatar, AvatarStack } from '../components/People';
import { MEMBER_COLORS, inMonth, uid } from '../lib/data';
import { mediumDate, monthLabel, monthOf, todayISO } from '../lib/dates';
import { money, parseAmount, round2 } from '../lib/format';
import { KIND_INFO } from '../lib/spaces';
import { shareOf, summarize } from '../lib/shared';
import { exportCopy } from '../sync/file';
import { getProvider } from '../sync/provider';
import type { Member, Settlement } from '../lib/types';

type SettleDraft = { from: string; to: string; amount: number } | null;

export function Together() {
  const { data, update, space, mergeRemote, updateSpace, removeSpace } = useStore();
  const ui = useUI();
  const today = todayISO();
  const month = monthOf(today);
  const sum = useMemo(() => summarize(data), [data]);
  const name = (id: string) => data.members.find((m) => m.id === id)?.name ?? 'Someone';
  const isMe = (id: string) => id === space.meId;
  const [settle, setSettle] = useState<SettleDraft>(null);
  const [inviteFor, setInviteFor] = useState<string>(() => data.members.find((m) => m.status === 'invited')?.id ?? '');
  const [newMember, setNewMember] = useState('');

  // This month: what each person paid for shared costs, and their share.
  const monthByMember = useMemo(() => {
    const paid = new Map<string, number>();
    const share = new Map<string, number>();
    for (const t of inMonth(data, month)) {
      if (t.type !== 'expense' || !t.paidBy || t.split?.mode === 'personal') continue;
      paid.set(t.paidBy, (paid.get(t.paidBy) ?? 0) + t.amount);
      for (const [id, v] of Object.entries(shareOf(t, data.members))) share.set(id, (share.get(id) ?? 0) + v);
    }
    const max = Math.max(1, ...paid.values(), ...share.values());
    return data.members.map((m) => ({ m, paid: paid.get(m.id) ?? 0, share: share.get(m.id) ?? 0, max }));
  }, [data, month]);

  const settlements = [...data.settlements].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.created - a.created));

  const recordSettlement = (s: Omit<Settlement, 'id' | 'created'>) => {
    update((d) => ({ ...d, settlements: [...d.settlements, { ...s, id: uid(), created: Date.now() }] }));
    ui.toast(`Recorded: ${name(s.from)} paid ${name(s.to)} ${money(s.amount)}`);
  };

  const removeSettlement = (s: Settlement) => {
    if (!window.confirm(`Delete this payment of ${money(s.amount)} from ${name(s.from)} to ${name(s.to)}?`)) return;
    update((d) => ({ ...d, settlements: d.settlements.filter((x) => x.id !== s.id) }));
  };

  const addMember = (e: FormEvent) => {
    e.preventDefault();
    const n = newMember.trim();
    if (!n) return;
    const m: Member = { id: uid(), name: n, color: MEMBER_COLORS[data.members.length % MEMBER_COLORS.length], role: 'member', status: 'invited' };
    update((d) => ({ ...d, members: [...d.members, m] }));
    setNewMember('');
    setInviteFor(m.id);
    ui.toast(`${n} added. Send them an invite file below.`);
  };

  const renameMember = (m: Member) => {
    const n = window.prompt('Name', m.name)?.trim();
    if (!n || n === m.name) return;
    update((d) => ({ ...d, members: d.members.map((x) => (x.id === m.id ? { ...x, name: n } : x)) }));
  };

  const removeMember = (m: Member) => {
    const used = data.transactions.some((t) => t.paidBy === m.id) || data.settlements.some((s) => s.from === m.id || s.to === m.id);
    if (used) {
      window.alert(`${m.name} is part of transactions or payments in this space, so they can't be removed. Settle up first; their history stays.`);
      return;
    }
    if (!window.confirm(`Remove ${m.name} from this space?`)) return;
    update((d) => ({ ...d, members: d.members.filter((x) => x.id !== m.id) }));
  };

  const invite = async () => {
    const m = data.members.find((x) => x.id === inviteFor);
    try {
      const p = await getProvider();
      const r = await p.invite(space, data, m);
      if (r.message !== 'Cancelled') ui.toast(r.message);
    } catch (err) {
      ui.toast((err as Error).message, 'error');
    }
  };

  const sendChanges = async () => {
    try {
      const ok = await exportCopy(space, data, name(space.meId ?? ''));
      if (ok) {
        updateSpace(space.id, { sync: { ...space.sync, lastSyncedAt: Date.now() } });
        ui.toast('Your copy is saved. Send the file to the others.');
      }
    } catch (err) {
      ui.toast((err as Error).message, 'error');
    }
  };

  const getChanges = async () => {
    try {
      const p = await getProvider();
      const r = await p.sync(space, data);
      if (!r.data) return;
      await mergeRemote(space.id, r.data);
      updateSpace(space.id, { sync: { ...space.sync, lastSyncedAt: Date.now() } });
      ui.toast(r.message);
    } catch (err) {
      ui.toast((err as Error).message, 'error');
    }
  };

  const leave = async () => {
    if (!window.confirm(`Remove “${space.name}” from this device? Other members keep their copies. Export a backup first if you might need it.`)) return;
    await removeSpace(space.id);
    ui.toast(`“${space.name}” removed from this device`);
  };

  const settledUp = sum.transfers.length === 0;

  return (
    <div className="container">
      <PageHeader
        eyebrow={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <AvatarStack members={data.members} size={22} />
            {KIND_INFO[space.kind].label} · {data.members.length} members
          </span>
        }
        title={space.name}
      >
        <button type="button" className="btn btn-secondary" onClick={() => setSettle({ from: space.meId ?? data.members[0].id, to: data.members.find((m) => m.id !== space.meId)?.id ?? '', amount: 0 })}>
          <Icon name="swap" size={16} />
          Record a payment
        </button>
        <button type="button" className="btn btn-primary" onClick={() => ui.addTx('expense')}>
          <Icon name="plus" strokeWidth={2.2} />
          Add shared expense
        </button>
      </PageHeader>

      <div className="row">
        <section className="card card-dark grow-1 tg-owe" aria-labelledby="owe-title">
          <div className="stack">
            <h2 id="owe-title" className="card-title">
              {settledUp ? 'Everyone is even' : 'To settle up'}
            </h2>
            <span className="sub">
              {settledUp
                ? 'No one owes anything right now.'
                : `${sum.transfers.length} payment${sum.transfers.length === 1 ? '' : 's'} would even things out`}
              {sum.unassigned > 0 && ` · ${sum.unassigned} expense${sum.unassigned === 1 ? '' : 's'} without a payer aren't counted`}
            </span>
          </div>
          {settledUp ? (
            <div className="tg-even">
              <Icon name="check" size={28} strokeWidth={2.2} />
              <span>
                Shared spending so far: <strong>{money(sum.totalShared)}</strong>
              </span>
            </div>
          ) : (
            <ul className="tg-transfers">
              {sum.transfers.map((t) => {
                const from = data.members.find((m) => m.id === t.from)!;
                const to = data.members.find((m) => m.id === t.to)!;
                return (
                  <li key={`${t.from}-${t.to}`}>
                    <Avatar member={from} size={34} />
                    <span className="tg-tr-text">
                      <strong>{isMe(from.id) ? 'You' : from.name}</strong> {isMe(from.id) ? 'owe' : 'owes'} <strong>{isMe(to.id) ? 'you' : to.name}</strong>
                    </span>
                    <span className="tg-tr-amt">{money(t.amount)}</span>
                    <button type="button" className="btn btn-ghost-dark btn-sm" onClick={() => setSettle({ from: t.from, to: t.to, amount: t.amount })}>
                      Mark as paid
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card grow-1" aria-labelledby="month-title">
          <div className="stack">
            <h2 id="month-title" className="card-title">
              {monthLabel(month)}
            </h2>
            <span className="sub">Who paid for shared costs vs. their share</span>
          </div>
          <ul className="tg-bars">
            {monthByMember.map(({ m, paid, share, max }) => (
              <li key={m.id}>
                <span className="tg-bar-who">
                  <Avatar member={m} size={24} />
                  {m.name}
                  {isMe(m.id) && <span className="sub"> (you)</span>}
                </span>
                <span className="tg-bar-track" aria-hidden="true">
                  <span className="paid" style={{ width: `${(paid / max) * 100}%`, background: m.color }} />
                  <span className="share" style={{ left: `${(share / max) * 100}%` }} />
                </span>
                <span className="tg-bar-val">
                  {money(paid)} <span className="sub">/ {money(share)}</span>
                </span>
              </li>
            ))}
          </ul>
          <span className="tg-legend sub">
            <span className="tg-legend-bar" /> paid <span className="tg-legend-tick" /> their share
          </span>
        </section>
      </div>

      <section aria-labelledby="people-title" className="tg-section">
        <h2 id="people-title" className="section-title">
          Balances
        </h2>
        <div className="tg-people">
          {sum.balances.map((b) => (
            <article key={b.member.id} className="tg-person">
              <div className="tg-person-head">
                <Avatar member={b.member} size={40} />
                <div className="stack grow">
                  <strong>
                    {b.member.name}
                    {isMe(b.member.id) && <span className="you-chip">You</span>}
                  </strong>
                  <span className="sub">{b.member.role === 'owner' ? 'Owner' : b.member.status === 'invited' ? 'Invited · not joined yet' : 'Member'}</span>
                </div>
              </div>
              <div className={`tg-balance ${b.balance > 0.005 ? 'pos' : b.balance < -0.005 ? 'neg' : ''}`}>
                {b.balance > 0.005 ? `gets back ${money(b.balance)}` : b.balance < -0.005 ? `owes ${money(-b.balance)}` : 'even'}
              </div>
              <dl className="tg-figures">
                <div>
                  <dt>Paid</dt>
                  <dd>{money(b.paid)}</dd>
                </div>
                <div>
                  <dt>Share</dt>
                  <dd>{money(b.share)}</dd>
                </div>
                <div>
                  <dt>Settled</dt>
                  <dd>{money(b.settled, true)}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <div className="row">
        <section className="card grow-1" aria-labelledby="members-title">
          <div className="stack">
            <h2 id="members-title" className="card-title">
              Members
            </h2>
            <span className="sub">Everyone who shares this space</span>
          </div>
          <ul className="tg-members">
            {data.members.map((m) => (
              <li key={m.id}>
                <Avatar member={m} size={32} />
                <span className="stack grow">
                  <span className="tg-m-name">
                    {m.name}
                    {isMe(m.id) && <span className="you-chip">You</span>}
                  </span>
                  <span className="sub">
                    {m.role === 'owner' ? 'Owner' : 'Member'} · {m.status === 'invited' ? 'invited' : 'joined'}
                    {m.email ? ` · ${m.email}` : ''}
                  </span>
                </span>
                <button type="button" className="icon-btn" aria-label={`Rename ${m.name}`} onClick={() => renameMember(m)}>
                  <Icon name="edit" size={16} />
                </button>
                {!isMe(m.id) && (
                  <button type="button" className="icon-btn danger" aria-label={`Remove ${m.name}`} onClick={() => removeMember(m)}>
                    <Icon name="trash" size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
          <form className="tg-add" onSubmit={addMember}>
            <label htmlFor="new-member" className="sr-only">
              New member's name
            </label>
            <input id="new-member" className="input sm" placeholder="Add a person by name" value={newMember} maxLength={40} onChange={(e) => setNewMember(e.target.value)} />
            <button type="submit" className="btn btn-secondary btn-sm" disabled={!newMember.trim()}>
              <Icon name="userPlus" size={16} />
              Add
            </button>
          </form>
        </section>

        <section className="card grow-1" aria-labelledby="sync-title">
          <div className="stack">
            <h2 id="sync-title" className="card-title">
              Share & sync
            </h2>
            <span className="sub">
              Works without accounts: each person keeps a copy and you swap files.{' '}
              {space.sync.lastSyncedAt ? `Last synced ${new Date(space.sync.lastSyncedAt).toLocaleString()}.` : 'Not synced yet.'}
            </span>
          </div>
          <ol className="tg-steps">
            <li>
              <span className="tg-step-n">1</span>
              <div className="stack grow">
                <strong>Invite</strong>
                <span className="sub">Save an invite file and send it (chat, email). They open it with “Join from an invite file” in the space menu.</span>
                <div className="tg-step-row">
                  <label htmlFor="invite-for" className="sr-only">
                    Invite who
                  </label>
                  <SelectBox id="invite-for" className="sm" value={inviteFor} onChange={(e) => setInviteFor(e.target.value)}>
                    <option value="">Anyone</option>
                    {data.members
                      .filter((m) => !isMe(m.id))
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                          {m.status === 'invited' ? ' (invited)' : ''}
                        </option>
                      ))}
                  </SelectBox>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={invite}>
                    <Icon name="send" size={15} />
                    Save invite file
                  </button>
                </div>
              </div>
            </li>
            <li>
              <span className="tg-step-n">2</span>
              <div className="stack grow">
                <strong>Send my changes</strong>
                <span className="sub">After adding expenses, save your copy and send it to the others.</span>
                <div className="tg-step-row">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={sendChanges}>
                    <Icon name="upload" size={15} />
                    Send my changes
                  </button>
                </div>
              </div>
            </li>
            <li>
              <span className="tg-step-n">3</span>
              <div className="stack grow">
                <strong>Get their changes</strong>
                <span className="sub">Open a file someone sent you. Everything is merged; for each item the newest edit wins.</span>
                <div className="tg-step-row">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={getChanges}>
                    <Icon name="download" size={15} />
                    Open their file
                  </button>
                </div>
              </div>
            </li>
          </ol>
          <p className="hint tg-cloud">
            <Icon name="refresh" size={14} /> Live sync with invite links (accounts, no files) is planned. This space is already set up for it.
          </p>
        </section>
      </div>

      <section className="card" aria-labelledby="history-title">
        <div className="card-head">
          <div className="stack">
            <h2 id="history-title" className="card-title">
              Payments between members
            </h2>
            <span className="sub">Money paid back to settle up. It changes balances, not your budgets.</span>
          </div>
        </div>
        {settlements.length ? (
          <ul className="tg-history">
            {settlements.map((s) => {
              const from = data.members.find((m) => m.id === s.from);
              return (
                <li key={s.id}>
                  {from && <Avatar member={from} size={28} />}
                  <span className="grow">
                    <strong>{name(s.from)}</strong> paid <strong>{name(s.to)}</strong>
                    {s.note && <span className="sub"> · {s.note}</span>}
                  </span>
                  <span className="sub">{mediumDate(s.date)}</span>
                  <strong>{money(s.amount)}</strong>
                  <button type="button" className="icon-btn danger" aria-label="Delete payment" onClick={() => removeSettlement(s)}>
                    <Icon name="trash" size={16} />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="chart-empty" style={{ minHeight: 100 }}>
            No payments yet. Use “Mark as paid” when someone pays back.
          </div>
        )}
      </section>

      <section className="card danger-zone" aria-labelledby="leave-title">
        <div className="settings-row">
          <div className="stack">
            <strong id="leave-title">Remove this space from this device</strong>
            <span className="sub">Deletes your copy only. The others keep theirs; you can join again from an invite file.</span>
          </div>
          <button type="button" className="btn btn-danger" onClick={leave}>
            <Icon name="trash" size={16} />
            Remove space
          </button>
        </div>
      </section>

      {settle && <SettleDialog draft={settle} members={data.members} onClose={() => setSettle(null)} onSave={recordSettlement} today={today} />}
    </div>
  );
}

function SettleDialog({
  draft,
  members,
  onClose,
  onSave,
  today,
}: {
  draft: NonNullable<SettleDraft>;
  members: Member[];
  onClose: () => void;
  onSave: (s: Omit<Settlement, 'id' | 'created'>) => void;
  today: string;
}) {
  const [from, setFrom] = useState(draft.from);
  const [to, setTo] = useState(draft.to || members.find((m) => m.id !== draft.from)?.id || '');
  const [amount, setAmount] = useState(draft.amount ? draft.amount.toFixed(2) : '');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const value = parseAmount(amount);
  const error = from === to ? 'Pick two different people.' : !Number.isFinite(value) || value <= 0 ? 'Enter an amount greater than zero.' : '';

  const save = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (error) return;
    onSave({ from, to, amount: round2(value), date, note: note.trim() });
    onClose();
  };

  return (
    <Modal title="Record a payment" onClose={onClose} width={480}>
      <form onSubmit={save} noValidate style={{ display: 'contents' }}>
        <div className="two">
          <div className="field">
            <label htmlFor="st-from">Who paid</label>
            <SelectBox id="st-from" value={from} onChange={(e) => setFrom(e.target.value)}>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </SelectBox>
          </div>
          <div className="field">
            <label htmlFor="st-to">To whom</label>
            <SelectBox id="st-to" value={to} onChange={(e) => setTo(e.target.value)}>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </SelectBox>
          </div>
        </div>
        <div className="two">
          <div className="field">
            <label htmlFor="st-amount">Amount</label>
            <input id="st-amount" className="input" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} data-autofocus />
          </div>
          <div className="field">
            <label htmlFor="st-date">Date</label>
            <input id="st-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="st-note">
            Note <span className="opt">(optional)</span>
          </label>
          <input id="st-note" className="input" placeholder="e.g. Bank transfer" value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} />
        </div>
        {submitted && error && <span className="error-text">{error}</span>}
        <div className="modal-foot">
          <span className="spacer" />
          <button type="button" className="btn btn-secondary btn-lg" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary btn-lg">
            Save payment
          </button>
        </div>
      </form>
    </Modal>
  );
}
