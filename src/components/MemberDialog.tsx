import { useRef, useState, type FormEvent } from 'react';
import { Modal } from './common';
import { Icon } from './Icon';
import { Avatar, imageToAvatar } from './People';
import { MEMBER_COLORS } from '../lib/data';
import type { Member } from '../lib/types';

/** Edit a member's name, profile picture and colour. */
export function MemberDialog({
  member,
  isMe,
  onSave,
  onClose,
}: {
  member: Member;
  isMe: boolean;
  onSave: (patch: Pick<Member, 'name' | 'color'> & { photo?: string }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(member.name);
  const [color, setColor] = useState(member.color);
  const [photo, setPhoto] = useState<string | undefined>(member.photo);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      setPhoto(await imageToAvatar(file));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    onSave({ name: n, color, photo });
    onClose();
  };

  const colors = MEMBER_COLORS.includes(color) ? MEMBER_COLORS : [color, ...MEMBER_COLORS];

  return (
    <Modal title={isMe ? 'Your profile' : `Edit ${member.name}`} onClose={onClose} width={480}>
      <form className="stack" style={{ gap: 22 }} onSubmit={submit}>
        <div className="member-edit">
          <Avatar member={{ name: name || '?', color, status: member.status, photo }} size={88} />
          <div className="member-photo-actions">
            <strong>Profile picture</strong>
            <div className="row-btns">
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
                <Icon name="upload" size={16} />
                {photo ? 'Change photo' : 'Upload photo'}
              </button>
              {photo && (
                <button type="button" className="btn btn-danger" onClick={() => setPhoto(undefined)}>
                  Remove
                </button>
              )}
            </div>
            <span className="sub">JPG, PNG or WebP. It's cropped to a square.</span>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => pick(e.target.files?.[0])} />
          </div>
        </div>
        {error && <span className="error-text">{error}</span>}

        <div className="field">
          <label htmlFor="member-name" className="label">
            Name
          </label>
          <input id="member-name" className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} data-autofocus />
          {!name.trim() && <span className="error-text">Enter a name.</span>}
        </div>

        <fieldset className="plain-fieldset">
          <legend className="label">Colour {photo ? '(used when there is no photo)' : ''}</legend>
          <div className="color-swatches">
            {colors.map((c) => (
              <button key={c} type="button" className="color-swatch" style={{ ['--c' as string]: c }} aria-pressed={color === c} aria-label={`Colour ${c}`} onClick={() => setColor(c)}>
                {color === c && <Icon name="check" size={16} strokeWidth={2.6} />}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="modal-foot">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-dark" disabled={!name.trim() || busy}>
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}
