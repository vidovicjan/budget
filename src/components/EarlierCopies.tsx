import { useCallback, useEffect, useState } from 'react';
import { readData, type DataReport } from '../lib/data';
import { mediumDate, toISO } from '../lib/dates';
import { saveTextFile } from '../lib/files';
import { countEntries, deleteCopies, listCopies, type CopyReason, type SafetyCopy } from '../lib/safety';
import type { AppData } from '../lib/types';
import { confirmDialog } from './Confirm';
import { Icon } from './Icon';

const REASON: Record<CopyReason, string> = {
  daily: 'Daily copy',
  restore: 'Before a restore',
  erase: 'Before erasing',
  sample: 'Before loading sample data',
  skipped: 'Original, before unreadable entries were left out',
  unreadable: 'Original that couldn’t be read',
};

const when = (at: number) => `${mediumDate(toISO(new Date(at)))}, ${new Date(at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`;

function tryRead(data: unknown): DataReport | null {
  try {
    return readData(data);
  } catch {
    return null;
  }
}

/** List of a space's earlier copies, each of which can be restored or saved as a file. */
export function EarlierCopies({
  spaceId,
  spaceName,
  onRestore,
  onError,
  canDelete = false,
}: {
  spaceId: string;
  spaceName: string;
  /** Replaces the current data. Must keep a copy of it first. */
  onRestore: (data: AppData) => Promise<void>;
  onError: (message: string) => void;
  canDelete?: boolean;
}) {
  const [copies, setCopies] = useState<SafetyCopy[] | null>(null);

  const load = useCallback(() => {
    listCopies(spaceId).then(setCopies, (err) => {
      setCopies([]);
      onError(`Couldn't list the earlier copies: ${err?.message || err}`);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId]);
  useEffect(load, [load]);

  const restore = async (c: SafetyCopy, r: DataReport) => {
    const ok = await confirmDialog({
      title: 'Restore this copy?',
      message: `“${spaceName}” goes back to ${when(c.at)} (${r.data.transactions.length} transactions).${r.skipped.length ? ` Can’t be read and left out: ${r.skipped.join(', ')}.` : ''} What’s there now is kept as a copy.`,
      confirmLabel: 'Restore',
      icon: 'refresh',
    });
    if (!ok) return;
    try {
      await onRestore(r.data);
    } catch (err) {
      onError(`Nothing was changed: ${(err as Error).message}`);
    }
  };

  const saveFile = async (c: SafetyCopy) => {
    try {
      await saveTextFile(`budget-tracker-copy-${toISO(new Date(c.at))}.json`, JSON.stringify(c.data, null, 2), 'application/json');
    } catch (err) {
      onError(`Couldn't save the file: ${(err as Error).message}`);
    }
  };

  const removeAll = async () => {
    if (!(await confirmDialog({ title: 'Delete all earlier copies?', message: `All earlier copies of “${spaceName}” are deleted from this device. Your current data stays. This can’t be undone.`, confirmLabel: 'Delete copies', danger: true }))) return;
    try {
      await deleteCopies(spaceId);
      load();
    } catch (err) {
      onError(`Couldn't delete the copies: ${(err as Error).message}`);
    }
  };

  if (!copies) return <p className="hint">Loading…</p>;
  if (!copies.length) return <p className="hint">No earlier copies yet. The first one is kept the next day you use the app.</p>;
  return (
    <>
      <ul className="copy-list">
        {copies.map((c) => {
          const r = tryRead(c.data);
          const n = countEntries(c.data);
          return (
            <li key={`${c.at}:${c.reason}`}>
              <span className="stack grow">
                <strong>{when(c.at)}</strong>
                <span className="sub">
                  {REASON[c.reason]}
                  {n !== null && ` · ${n} ${n === 1 ? 'entry' : 'entries'}`}
                </span>
              </span>
              <button type="button" className="icon-btn" aria-label={`Save the copy from ${when(c.at)} as a file`} title="Save as a file" onClick={() => saveFile(c)}>
                <Icon name="download" size={16} />
              </button>
              {r && (
                <button type="button" className="btn btn-secondary btn-sm" aria-label={`Restore the copy from ${when(c.at)}`} onClick={() => restore(c, r)}>
                  Restore
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {canDelete && (
        <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={removeAll}>
          Delete all earlier copies
        </button>
      )}
    </>
  );
}
