import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { useUI } from '../ui';
import { PageHeader } from '../components/common';
import { Icon } from '../components/Icon';
import { uid } from '../lib/data';
import type { Note } from '../lib/types';
import { confirmDialog } from '../components/Confirm';
import { Checklist, checklistSummary } from '../components/Checklist';

const SAVE_DELAY = 400;

/** Title to show: the title, else the first line of the text, else the first list item. */
const displayTitle = (n: Pick<Note, 'title' | 'body' | 'checklist'>) =>
  n.title.trim() || n.body.trim().split('\n')[0].slice(0, 80) || n.checklist?.find((i) => i.text.trim())?.text.trim().slice(0, 80) || 'Untitled note';

/** Body preview without the line already used as the title; checklist progress first. */
function preview(n: Note) {
  const lines = n.body.trim().split('\n');
  const rest = n.title.trim() ? lines : lines.slice(1);
  const text = rest.join(' ').trim();
  return [checklistSummary(n.checklist), text].filter(Boolean).join(' · ').slice(0, 120);
}

const searchText = (n: Note) => `${n.title}\n${n.body}\n${(n.checklist ?? []).map((i) => i.text).join('\n')}`.toLowerCase();

function when(ms: number) {
  const d = new Date(ms);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('en-US', opts);
}

export function Notes() {
  const { data, update } = useStore();
  const ui = useUI();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(() => data.notes[0]?.id ?? null);

  // The note being edited lives here and is saved shortly after typing stops.
  const [draft, setDraft] = useState<Note | null>(null);
  const timer = useRef<number>();
  const draftRef = useRef<Note | null>(null);
  draftRef.current = draft;

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    const n = draftRef.current;
    if (!n) return;
    update((d) => {
      const old = d.notes.find((x) => x.id === n.id);
      if (!old || (old.title === n.title && old.body === n.body && old.pinned === n.pinned && JSON.stringify(old.checklist) === JSON.stringify(n.checklist)))
        return d;
      return { ...d, notes: d.notes.map((x) => (x.id === n.id ? n : x)) };
    });
  }, [update]);

  // Save when leaving the page.
  useEffect(() => flush, [flush]);

  const sorted = useMemo(() => {
    const list = data.notes.map((n) => (draft && n.id === draft.id ? draft : n));
    return list.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated - a.updated);
  }, [data.notes, draft]);

  const q = query.trim().toLowerCase();
  const visible = q ? sorted.filter((n) => searchText(n).includes(q)) : sorted;
  const current = sorted.find((n) => n.id === selectedId) ?? null;

  // Load the selected note into the editor.
  useEffect(() => {
    if (draftRef.current?.id === selectedId) return;
    flush();
    setDraft(data.notes.find((n) => n.id === selectedId) ?? null);
  }, [selectedId, data.notes, flush]);

  const edit = (patch: Partial<Pick<Note, 'title' | 'body' | 'pinned' | 'checklist'>>) => {
    if (!draft) return;
    const n = { ...draft, ...patch, updated: Date.now() };
    if (patch.checklist === undefined && 'checklist' in patch) delete n.checklist;
    draftRef.current = n;
    setDraft(n);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, SAVE_DELAY);
  };

  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const create = () => {
    flush();
    const n: Note = { id: uid(), title: '', body: '', pinned: false, updated: Date.now() };
    update((d) => ({ ...d, notes: [n, ...d.notes] }));
    setQuery('');
    setDraft(n);
    setSelectedId(n.id);
    window.setTimeout(() => titleRef.current?.focus(), 0);
  };

  const remove = async () => {
    if (!current) return;
    if ((current.title || current.body) && !(await confirmDialog({ title: `Delete “${displayTitle(current)}”?`, message: 'This note can’t be recovered.', danger: true }))) return;
    window.clearTimeout(timer.current);
    const next = sorted.find((n) => n.id !== current.id) ?? null;
    draftRef.current = null;
    setDraft(null);
    update((d) => ({ ...d, notes: d.notes.filter((n) => n.id !== current.id) }));
    setSelectedId(next?.id ?? null);
    ui.toast('Note deleted');
  };

  const togglePin = () => {
    if (!draft) return;
    const pinned = !draft.pinned;
    const n = { ...draft, pinned };
    draftRef.current = n;
    setDraft(n);
    flush();
  };

  const toggleChecklist = async () => {
    if (!draft) return;
    if (!draft.checklist) {
      edit({ checklist: [{ id: uid(), text: '', done: false }] });
      window.setTimeout(() => document.querySelector<HTMLTextAreaElement>('.note-editor .check-text')?.focus(), 0);
      return;
    }
    const filled = draft.checklist.filter((i) => i.text.trim()).length;
    if (
      filled &&
      !(await confirmDialog({
        title: 'Remove the checklist?',
        message: `Its ${filled} item${filled === 1 ? '' : 's'} will be deleted. The note's text stays.`,
        confirmLabel: 'Remove checklist',
        danger: true,
      }))
    )
      return;
    edit({ checklist: undefined });
    flush();
  };

  const listWords = (draft?.checklist ?? []).map((i) => i.text).join(' ');
  const words = draft ? `${draft.body} ${listWords}`.trim().split(/\s+/).filter(Boolean).length : 0;

  return (
    <div className="container">
      <PageHeader eyebrow={`${data.notes.length} note${data.notes.length === 1 ? '' : 's'} · saved automatically`} title="Notes">
        <button type="button" className="btn btn-primary" onClick={create}>
          <Icon name="plus" strokeWidth={2.2} />
          New note
        </button>
      </PageHeader>

      {data.notes.length === 0 ? (
        <section className="card notes-empty">
          <span className="notes-empty-icon" aria-hidden="true">
            <Icon name="note" size={26} />
          </span>
          <h2 className="card-title">Nothing written yet</h2>
          <p className="sub">Keep plans, reminders, savings goals or anything else here. Notes are saved on this device and included in backups.</p>
          <button type="button" className="btn btn-primary" onClick={create}>
            <Icon name="plus" strokeWidth={2.2} />
            Write your first note
          </button>
        </section>
      ) : (
        <div className="notes-layout">
          <section className="card notes-list-card" aria-label="All notes">
            <div className="search-wrap">
              <label htmlFor="note-search" className="sr-only">
                Search notes
              </label>
              <Icon name="search" />
              <input id="note-search" className="input sm" type="search" placeholder="Search notes" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <ul className="notes-list">
              {visible.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className="note-item"
                    aria-current={n.id === selectedId ? 'true' : undefined}
                    onClick={() => setSelectedId(n.id)}
                  >
                    <span className="note-item-top">
                      {n.pinned && <Icon name="pin" size={12} strokeWidth={2.2} />}
                      <span className="note-item-title">{displayTitle(n)}</span>
                      <span className="note-item-time">{when(n.updated)}</span>
                    </span>
                    <span className="note-item-preview">{preview(n) || 'No additional text'}</span>
                  </button>
                </li>
              ))}
              {!visible.length && <li className="sub notes-none">No notes match “{query}”.</li>}
            </ul>
          </section>

          <section className="card note-editor" aria-label="Note editor">
            {draft ? (
              <>
                <div className="note-toolbar">
                  <span className="sub">Edited {when(draft.updated)}</span>
                  <span className="note-tools">
                    <button
                      type="button"
                      className={`icon-btn ${draft.checklist ? 'active' : ''}`}
                      aria-pressed={!!draft.checklist}
                      title={draft.checklist ? 'Remove checklist' : 'Add checklist'}
                      aria-label={draft.checklist ? 'Remove checklist' : 'Add checklist'}
                      onClick={toggleChecklist}
                    >
                      <Icon name="checklist" size={16} />
                    </button>
                    <button
                      type="button"
                      className={`icon-btn ${draft.pinned ? 'active' : ''}`}
                      aria-pressed={draft.pinned}
                      title={draft.pinned ? 'Unpin' : 'Pin to top'}
                      aria-label={draft.pinned ? 'Unpin note' : 'Pin note to top'}
                      onClick={togglePin}
                    >
                      <Icon name="pin" size={16} />
                    </button>
                    <button type="button" className="icon-btn" title="Delete note" aria-label="Delete note" onClick={remove}>
                      <Icon name="trash" size={16} />
                    </button>
                  </span>
                </div>
                <label htmlFor="note-title" className="sr-only">
                  Title
                </label>
                <input
                  id="note-title"
                  ref={titleRef}
                  className="note-title-input"
                  placeholder="Title"
                  value={draft.title}
                  onChange={(e) => edit({ title: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      bodyRef.current?.focus();
                    }
                  }}
                  onBlur={flush}
                />
                <div className={`note-scroll ${draft.checklist ? 'has-list' : ''}`}>
                  {draft.checklist && <Checklist items={draft.checklist} onChange={(checklist) => edit({ checklist })} />}
                  <label htmlFor="note-body" className="sr-only">
                    Note
                  </label>
                  <textarea
                    id="note-body"
                    ref={bodyRef}
                    className="note-body-input"
                    placeholder={draft.checklist ? 'Add a note…' : 'Start writing…'}
                    value={draft.body}
                    onChange={(e) => edit({ body: e.target.value })}
                    onBlur={flush}
                  />
                </div>
                <div className="note-foot sub">
                  {words} word{words === 1 ? '' : 's'} · {draft.body.length} character{draft.body.length === 1 ? '' : 's'}
                  {draft.checklist?.length ? ` · ${checklistSummary(draft.checklist).split(' · ')[0]}` : ''}
                </div>
              </>
            ) : (
              <div className="note-placeholder sub">Select a note, or create a new one.</div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
