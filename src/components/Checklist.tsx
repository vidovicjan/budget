import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { Icon } from './Icon';
import { uid } from '../lib/data';
import type { ChecklistItem } from '../lib/types';

type Focus = { id: string; at: number | 'end' };

/**
 * Editable tick-box list. Enter adds the next item (splitting at the cursor), Backspace on an
 * empty item removes it, arrows move between items, pasting several lines adds several items.
 * Ticked items move to a "Completed" group below.
 */
export function Checklist({ items, onChange }: { items: ChecklistItem[]; onChange: (items: ChecklistItem[]) => void }) {
  const refs = useRef(new Map<string, HTMLTextAreaElement>());
  const [focus, setFocus] = useState<Focus | null>(null);
  const [showDone, setShowDone] = useState(true);

  const open = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);
  /** Items in the order they're shown, for arrow keys. */
  const shown = showDone ? [...open, ...done] : open;

  useEffect(() => {
    if (!focus) return;
    const el = refs.current.get(focus.id);
    if (el) {
      el.focus();
      const p = focus.at === 'end' ? el.value.length : Math.min(focus.at, el.value.length);
      el.setSelectionRange(p, p);
    }
    setFocus(null);
  }, [focus, items]);

  const patch = (id: string, p: Partial<ChecklistItem>) => onChange(items.map((i) => (i.id === id ? { ...i, ...p } : i)));

  /** Inserts new items right after `afterId` (or at the end of the open items). */
  const insert = (afterId: string | null, texts: string[], base = items) => {
    const added = texts.map((text) => ({ id: uid(), text, done: false }));
    const idx = afterId ? base.findIndex((i) => i.id === afterId) + 1 : lastOpenIndex(base) + 1;
    onChange([...base.slice(0, idx), ...added, ...base.slice(idx)]);
    return added;
  };

  const addItem = () => {
    const [n] = insert(null, ['']);
    setFocus({ id: n.id, at: 0 });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>, item: ChecklistItem) => {
    const el = e.currentTarget;
    const pos = shown.findIndex((i) => i.id === item.id);
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (item.done) return;
      const before = el.value.slice(0, el.selectionStart);
      const after = el.value.slice(el.selectionEnd);
      const base = items.map((i) => (i.id === item.id ? { ...i, text: before } : i));
      const [n] = insert(item.id, [after], base);
      setFocus({ id: n.id, at: 0 });
    } else if (e.key === 'Backspace' && el.value === '') {
      e.preventDefault();
      const prev = shown[pos - 1] ?? shown[pos + 1];
      onChange(items.filter((i) => i.id !== item.id));
      if (prev) setFocus({ id: prev.id, at: 'end' });
    } else if (e.key === 'ArrowUp' && el.selectionStart === 0 && pos > 0) {
      e.preventDefault();
      setFocus({ id: shown[pos - 1].id, at: 'end' });
    } else if (e.key === 'ArrowDown' && el.selectionEnd === el.value.length && pos < shown.length - 1) {
      e.preventDefault();
      setFocus({ id: shown[pos + 1].id, at: 0 });
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>, item: ChecklistItem) => {
    const text = e.clipboardData.getData('text');
    if (!text.includes('\n')) return;
    e.preventDefault();
    const el = e.currentTarget;
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*(?:[-*•]|\[[ xX]?\]|\d+[.)])\s*/, '').trimEnd())
      .filter((l, i, all) => l || (i > 0 && i < all.length - 1));
    if (!lines.length) return;
    const before = el.value.slice(0, el.selectionStart);
    const after = el.value.slice(el.selectionEnd);
    const base = items.map((i) => (i.id === item.id ? { ...i, text: before + lines[0] } : i));
    const rest = lines.slice(1);
    if (!rest.length) {
      onChange(base.map((i) => (i.id === item.id ? { ...i, text: i.text + after } : i)));
      return;
    }
    rest[rest.length - 1] += after;
    const added = insert(item.id, rest, base);
    setFocus({ id: added[added.length - 1].id, at: 'end' });
  };

  const row = (item: ChecklistItem) => (
    <li key={item.id} className={`check-item ${item.done ? 'done' : ''}`}>
      <input
        type="checkbox"
        className="check-box"
        checked={item.done}
        aria-label={item.text ? `Done: ${item.text}` : 'Done'}
        onChange={(e) => patch(item.id, { done: e.target.checked })}
      />
      <textarea
        ref={(el) => {
          if (el) refs.current.set(item.id, el);
          else refs.current.delete(item.id);
        }}
        className="check-text"
        rows={1}
        value={item.text}
        placeholder="List item"
        aria-label="List item"
        maxLength={1000}
        onChange={(e) => patch(item.id, { text: e.target.value.replace(/\r?\n/g, ' ') })}
        onKeyDown={(e) => onKeyDown(e, item)}
        onPaste={(e) => onPaste(e, item)}
      />
      <button type="button" className="icon-btn check-remove" aria-label={`Remove ${item.text || 'item'}`} onClick={() => onChange(items.filter((i) => i.id !== item.id))}>
        <Icon name="close" size={14} strokeWidth={2} />
      </button>
    </li>
  );

  return (
    <div className="checklist">
      {items.length > 0 && (
        <div className="check-progress" aria-label={`${done.length} of ${items.length} done`}>
          <span className="check-bar">
            <span style={{ width: `${(done.length / items.length) * 100}%` }} />
          </span>
          <span className="sub">
            {done.length} of {items.length} done
          </span>
        </div>
      )}
      <ul className="check-list">{open.map(row)}</ul>
      <button type="button" className="check-add" onClick={addItem}>
        <Icon name="plus" size={16} strokeWidth={2} />
        Add item
      </button>
      {done.length > 0 && (
        <>
          <button type="button" className="check-done-toggle" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>
            <Icon name={showDone ? 'chevD' : 'chevR'} size={14} strokeWidth={2} />
            Completed ({done.length})
          </button>
          {showDone && <ul className="check-list">{done.map(row)}</ul>}
        </>
      )}
    </div>
  );
}

function lastOpenIndex(items: ChecklistItem[]) {
  for (let i = items.length - 1; i >= 0; i--) if (!items[i].done) return i;
  return items.length - 1;
}

/** Short summary for the notes list, e.g. "2 of 5 done · Milk, Eggs". */
export function checklistSummary(items: ChecklistItem[] | undefined) {
  if (!items?.length) return '';
  const done = items.filter((i) => i.done).length;
  const next = items
    .filter((i) => !i.done && i.text.trim())
    .map((i) => i.text.trim())
    .join(', ');
  return `${done} of ${items.length} done${next ? ` · ${next}` : ''}`;
}
