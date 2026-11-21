import { useState, type FormEvent } from 'react';
import { useStore } from '../store';
import { Modal, SelectBox } from './common';
import { Icon } from './Icon';
import { Avatar } from './People';
import { CURRENCIES } from '../lib/format';
import { KIND_INFO, createSharedSpace, type SpaceKind, type SpaceMeta } from '../lib/spaces';
import { MEMBER_COLORS, uid } from '../lib/data';
import type { SpacePack } from '../sync/provider';
import type { Member } from '../lib/types';

type SharedKind = Exclude<SpaceKind, 'personal'>;
const KINDS: SharedKind[] = ['couple', 'family', 'friends', 'roommates', 'other'];
const PLACEHOLDER: Record<SharedKind, string> = {
  couple: 'e.g. Ana & Jan',
  family: 'e.g. The Horvat family',
  friends: 'e.g. Split trip 2027',
  roommates: 'e.g. Flat on Main Street',
  other: 'e.g. Book club',
};

export function NewSpaceDialog({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
  const { workspace, data, addSpace, setDeviceName } = useStore();
  const [kind, setKind] = useState<SharedKind>('couple');
  const [name, setName] = useState('');
  const [me, setMe] = useState(workspace.device.name);
  const [others, setOthers] = useState([{ name: '', email: '' }]);
  const [currency, setCurrency] = useState(data.settings.currency);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  const meError = me.trim() ? '' : 'Add your name so others know who paid.';
  const othersError = others.some((o) => o.name.trim()) ? '' : 'Add at least one other person. You can add more later.';

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (meError || othersError || busy) return;
    setBusy(true);
    try {
      const { meta, data: d } = createSharedSpace({ name, kind, currency, me, others }, workspace.device.theme);
      setDeviceName(me.trim());
      await addSpace(meta, d);
      onDone(`“${meta.name}” created. Invite the others from the Together page.`);
      onClose();
    } catch (err) {
      onDone(`Couldn't create the space: ${(err as Error).message}`);
      setBusy(false);
    }
  };

  const setOther = (i: number, patch: Partial<{ name: string; email: string }>) => setOthers((list) => list.map((o, j) => (j === i ? { ...o, ...patch } : o)));

  return (
    <Modal title="New shared space" onClose={onClose} width={580}>
      <form onSubmit={save} noValidate style={{ display: 'contents' }}>
        <p className="hint" style={{ marginTop: -8 }}>
          A space is a separate budget you share: its own accounts, categories and transactions, plus who paid and who owes whom.
        </p>
        <fieldset className="plain-fieldset">
          <legend className="label">What's it for?</legend>
          <div className="kind-grid">
            {KINDS.map((k) => (
              <button type="button" key={k} className="kind-card" aria-pressed={kind === k} onClick={() => setKind(k)}>
                <Icon name={KIND_INFO[k].icon} size={20} />
                <strong>{KIND_INFO[k].label}</strong>
                <span>{KIND_INFO[k].blurb}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <div className="field">
          <label htmlFor="space-name">Name</label>
          <input id="space-name" className="input" placeholder={PLACEHOLDER[kind]} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} data-autofocus />
        </div>

        <div className="field">
          <label htmlFor="space-me">Your name</label>
          <input id="space-me" className="input" placeholder="How others will see you" value={me} maxLength={40} onChange={(e) => setMe(e.target.value)} aria-invalid={submitted && !!meError} />
          {submitted && meError && <span className="error-text">{meError}</span>}
        </div>

        <fieldset className="plain-fieldset">
          <legend className="label">Who else is in it?</legend>
          <div className="people-rows">
            {others.map((o, i) => (
              <div className="people-row" key={i}>
                <Avatar member={{ name: o.name || '?', color: MEMBER_COLORS[(i + 1) % MEMBER_COLORS.length], status: 'invited' }} size={32} />
                <label className="sr-only" htmlFor={`other-name-${i}`}>
                  Name of person {i + 1}
                </label>
                <input id={`other-name-${i}`} className="input sm" placeholder="Name" value={o.name} maxLength={40} onChange={(e) => setOther(i, { name: e.target.value })} />
                <label className="sr-only" htmlFor={`other-email-${i}`}>
                  Email of person {i + 1} (optional)
                </label>
                <input
                  id={`other-email-${i}`}
                  className="input sm"
                  type="email"
                  placeholder="Email (optional, for cloud invites later)"
                  value={o.email}
                  onChange={(e) => setOther(i, { email: e.target.value })}
                />
                <button type="button" className="icon-btn" aria-label={`Remove person ${i + 1}`} disabled={others.length === 1} onClick={() => setOthers((l) => l.filter((_, j) => j !== i))}>
                  <Icon name="close" size={16} />
                </button>
              </div>
            ))}
          </div>
          {submitted && othersError && <span className="error-text">{othersError}</span>}
          <button type="button" className="link-btn" style={{ alignSelf: 'flex-start', minHeight: 32 }} onClick={() => setOthers((l) => [...l, { name: '', email: '' }])}>
            + Add another person
          </button>
        </fieldset>

        <div className="field">
          <label htmlFor="space-currency">Currency</label>
          <SelectBox id="space-currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map(([code, label]) => (
              <option key={code} value={code}>
                {code} · {label}
              </option>
            ))}
          </SelectBox>
        </div>

        <div className="modal-foot">
          <span className="spacer" />
          <button type="button" className="btn btn-secondary btn-lg" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
            Create space
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Join a space from an invite file: pick which member you are, or add yourself. */
export function JoinSpaceDialog({ pack, onClose, onDone }: { pack: SpacePack; onClose: () => void; onDone: (msg: string) => void }) {
  const { workspace, addSpace, setDeviceName } = useStore();
  const existing = workspace.spaces.find((s) => s.id === pack.space.id);
  const members = pack.data.members;
  const [who, setWho] = useState<string>(pack.invitedMember ?? members.find((m) => m.status === 'invited')?.id ?? 'new');
  const [newName, setNewName] = useState(workspace.device.name);
  const [busy, setBusy] = useState(false);
  const error = who === 'new' && !newName.trim() ? 'Add your name.' : '';

  const join = async () => {
    if (error || busy) return;
    setBusy(true);
    try {
      const now = Date.now();
      let data = pack.data;
      let meId = who;
      if (who === 'new') {
        meId = uid();
        const m: Member = { id: meId, name: newName.trim(), color: MEMBER_COLORS[members.length % MEMBER_COLORS.length], role: 'member', status: 'active', updatedAt: now };
        data = { ...data, members: [...data.members, m] };
      } else {
        data = { ...data, members: data.members.map((m) => (m.id === who ? { ...m, status: 'active', updatedAt: now } : m)) };
      }
      const meName = data.members.find((m) => m.id === meId)?.name ?? '';
      if (meName) setDeviceName(meName);
      const meta: SpaceMeta = { id: pack.space.id, name: pack.space.name, kind: pack.space.kind, color: pack.space.color, createdAt: now, meId, sync: { mode: 'file', lastSyncedAt: now } };
      await addSpace(meta, data);
      onDone(`You joined “${meta.name}”. Send your changes back with “Send my changes” on the Together page.`);
      onClose();
    } catch (err) {
      onDone(`Couldn't join: ${(err as Error).message}`);
      setBusy(false);
    }
  };

  if (existing) {
    return <SyncFromPackNotice pack={pack} meta={existing} onClose={onClose} onDone={onDone} />;
  }

  return (
    <Modal title={`Join “${pack.space.name}”`} onClose={onClose} width={520}>
      <p className="hint" style={{ marginTop: -8 }}>
        {KIND_INFO[pack.space.kind].label} space with {members.length} member{members.length === 1 ? '' : 's'}, {pack.data.transactions.length} transaction
        {pack.data.transactions.length === 1 ? '' : 's'}. Which one are you?
      </p>
      <div className="who-list" role="radiogroup" aria-label="Which member are you">
        {members.map((m) => (
          <button type="button" key={m.id} role="radio" aria-checked={who === m.id} className="who-item" onClick={() => setWho(m.id)}>
            <Avatar member={m} size={34} />
            <span className="stack grow">
              <strong>{m.name}</strong>
              <span className="sub">{m.role === 'owner' ? 'Created the space' : m.status === 'invited' ? 'Invited' : 'Joined'}</span>
            </span>
            {who === m.id && <Icon name="check" size={18} strokeWidth={2.4} />}
          </button>
        ))}
        <button type="button" role="radio" aria-checked={who === 'new'} className="who-item" onClick={() => setWho('new')}>
          <span className="avatar-m add" style={{ width: 34, height: 34 }} aria-hidden="true">
            <Icon name="plus" size={16} />
          </span>
          <span className="stack grow">
            <strong>I'm not on the list</strong>
            <span className="sub">Add me as a new member</span>
          </span>
          {who === 'new' && <Icon name="check" size={18} strokeWidth={2.4} />}
        </button>
      </div>
      {who === 'new' && (
        <div className="field">
          <label htmlFor="join-name">Your name</label>
          <input id="join-name" className="input" value={newName} maxLength={40} onChange={(e) => setNewName(e.target.value)} aria-invalid={!!error} />
          {error && <span className="error-text">{error}</span>}
        </div>
      )}
      <div className="modal-foot">
        <span className="spacer" />
        <button type="button" className="btn btn-secondary btn-lg" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary btn-lg" disabled={busy || !!error} onClick={join}>
          Join space
        </button>
      </div>
    </Modal>
  );
}

/** Opening a file for a space you already have = merge it in. */
function SyncFromPackNotice({ pack, meta, onClose, onDone }: { pack: SpacePack; meta: SpaceMeta; onClose: () => void; onDone: (msg: string) => void }) {
  const { space, mergeRemote, switchSpace, updateSpace } = useStore();
  const from = pack.data.members.find((m) => m.id === pack.exportedBy)?.name;
  const [busy, setBusy] = useState(false);
  const merge = async () => {
    setBusy(true);
    try {
      await mergeRemote(meta.id, pack.data);
      updateSpace(meta.id, { sync: { ...meta.sync, lastSyncedAt: Date.now() } });
      onDone(`Changes${from ? ` from ${from}` : ''} merged into “${meta.name}”.`);
      onClose();
      if (space.id !== meta.id) await switchSpace(meta.id);
    } catch (err) {
      onDone(`Couldn't merge: ${(err as Error).message}`);
      setBusy(false);
    }
  };
  return (
    <Modal title={`Update “${meta.name}”`} onClose={onClose} width={480}>
      <p className="hint" style={{ marginTop: -8 }}>
        You already have this space. Merge the changes in this file{from ? ` from ${from}` : ''}? Nothing is lost: for each item the newest edit is kept.
      </p>
      <div className="modal-foot">
        <span className="spacer" />
        <button type="button" className="btn btn-secondary btn-lg" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary btn-lg" disabled={busy} onClick={merge}>
          Merge changes
        </button>
      </div>
    </Modal>
  );
}
