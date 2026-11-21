import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { useUI } from '../ui';
import { Icon } from './Icon';
import { KIND_INFO } from '../lib/spaces';
import { initials } from '../lib/shared';

/** Sidebar control showing the active space, with a menu to switch, create or join spaces. */
export function SpaceSwitcher() {
  const { workspace, space, data, switchSpace } = useStore();
  const ui = useUI();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = async (id: string) => {
    setOpen(false);
    if (id === space.id) return;
    try {
      await switchSpace(id);
    } catch (err) {
      ui.toast(`Couldn't open that space: ${(err as Error).message}`, 'error');
    }
  };

  const sub = space.kind === 'personal' ? 'Only you' : `${data.members.length} member${data.members.length === 1 ? '' : 's'} · ${KIND_INFO[space.kind].label}`;

  return (
    <div className="space-switch" ref={ref}>
      <button type="button" className="space-current" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="space-badge" style={{ ['--s' as string]: space.color }} aria-hidden="true">
          {space.kind === 'personal' ? <Icon name="wallet" size={16} /> : initials(space.name)}
        </span>
        <span className="space-text">
          <span className="space-name">{space.name}</span>
          <span className="space-sub">{sub}</span>
        </span>
        <Icon name="down" size={16} />
      </button>
      {open && (
        <div className="space-menu" role="menu" aria-label="Spaces">
          <span className="space-menu-label">Your spaces</span>
          {workspace.spaces.map((s) => (
            <button key={s.id} type="button" role="menuitemradio" aria-checked={s.id === space.id} className="space-item" onClick={() => pick(s.id)}>
              <span className="space-badge sm" style={{ ['--s' as string]: s.color }} aria-hidden="true">
                {s.kind === 'personal' ? <Icon name="wallet" size={13} /> : initials(s.name)}
              </span>
              <span className="space-item-name">{s.name}</span>
              {s.kind !== 'personal' && <span className="space-item-kind">{KIND_INFO[s.kind].label}</span>}
              {s.id === space.id && <Icon name="check" size={15} strokeWidth={2.4} />}
            </button>
          ))}
          <span className="space-menu-sep" />
          <button
            type="button"
            role="menuitem"
            className="space-item action"
            onClick={() => {
              setOpen(false);
              ui.newSpace();
            }}
          >
            <Icon name="userPlus" size={16} />
            New shared space…
          </button>
          <button
            type="button"
            role="menuitem"
            className="space-item action"
            onClick={() => {
              setOpen(false);
              ui.joinSpace();
            }}
          >
            <Icon name="inbox" size={16} />
            Join from an invite file…
          </button>
        </div>
      )}
    </div>
  );
}
